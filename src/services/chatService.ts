import { Server as SocketIOServer, Socket } from 'socket.io';
import mongoose from 'mongoose';
import ChatSession, { IChatSession } from '../models/ChatSession';
import ChatMessage from '../models/ChatMessage';
import ChatReview from '../models/ChatReview';
import User from '../models/User';
import Astrologer from '../models/Astrologer';
import Transaction from '../models/Transaction';
import notificationService from './notificationService';
import availabilityService from './availabilityService';

/**
 * ChatService - Core billing and session management
 * 
 * CRITICAL: This service is the SINGLE SOURCE OF TRUTH for:
 * - Chat timing
 * - Billing cycles
 * - Wallet deduction
 * - Earnings calculation
 * 
 * Apps MUST NOT control timing or billing.
 */
class ChatService {
    public io: SocketIOServer | null = null;

    // Map of active billing timers: sessionId -> NodeJS.Timeout
    private billingTimers: Map<string, NodeJS.Timeout> = new Map();

    // NOTE: No grace period timers — chats are NEVER force-ended on disconnect.
    // Sessions only end via: wallet depletion, free trial expiry, or explicit user/astrologer end.

    // Billing cycle interval (60 seconds)
    private readonly BILLING_INTERVAL_MS = 60000;

    // Request timeout — must exceed ping detection window (pingInterval 10s + pingTimeout 20s = 30s).
    // 30s gives enough time for socket reconnect + FCM wake-up before marking as missed.
    private readonly REQUEST_TIMEOUT_MS = 30000;

    // Map of request timeout timers: sessionId -> NodeJS.Timeout
    private requestTimeouts: Map<string, NodeJS.Timeout> = new Map();

    // Map of free trial timers: sessionId -> NodeJS.Timeout
    private freeTrialTimers: Map<string, NodeJS.Timeout> = new Map();

    // Map of free trial warning timers: sessionId -> NodeJS.Timeout
    private freeTrialWarningTimers: Map<string, NodeJS.Timeout> = new Map();

    // Free trial duration (120 seconds = 2 minutes)
    private readonly FREE_TRIAL_DURATION_MS = 120000;

    /**
     * Initialize the chat service with Socket.IO instance
     */
    initialize(io: SocketIOServer) {
        this.io = io;
        console.log('[ChatService] Initialized');
    }

    /**
     * Create a new chat request
     * Called when user wants to start chat with astrologer
     */
    async createChatRequest(
        userId: string,
        astrologerId: string,
        intakeDetails?: object
    ): Promise<IChatSession> {
        // Validate user exists and has sufficient balance
        const user = await User.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        // Get astrologer and validate
        const astrologer = await Astrologer.findById(astrologerId);
        if (!astrologer) {
            throw new Error('Astrologer not found');
        }

        if (!astrologer.isOnline) {
            throw new Error('Astrologer is offline');
        }



        if (astrologer.status !== 'approved') {
            throw new Error('Astrologer is not approved');
        }

        if (astrologer.isBusy) {
            throw new Error('Astrologer is busy with another chat');
        }

        const ratePerMinute = astrologer.pricePerMin;
        const minRealBalanceRequired = ratePerMinute * 5;

        // Check if user is eligible for free trial (first-time user)
        // FREE TRIAL RULES:
        //   1. User must never have used a free trial before (hasUsedFreeTrial = false)
        //   2. User must NOT have sufficient REAL paid balance for a 5-minute session.
        //      If the user has enough money, they get a PAID session.
        // NOTE: Free trial is a PLATFORM USER benefit, NOT controlled per-astrologer.
        const isEligibleForFreeTrial = !user.hasUsedFreeTrial &&
                                      (user.walletBalance < minRealBalanceRequired);

        // Check if user has enough REAL balance for at least 5 mins (skip for free trial users)
        if (!isEligibleForFreeTrial && user.walletBalance < minRealBalanceRequired) {
            throw new Error(`Insufficient real balance. Minimum ₹${minRealBalanceRequired} required for 5 minutes of chat.`);
        }

        // Check for existing pending request from this user
        const existingRequest = await ChatSession.findOne({
            userId,
            status: 'PENDING'
        });
        if (existingRequest) {
            throw new Error('You already have a pending chat request');
        }


        // Create new chat session
        const session = new ChatSession({
            userId,
            astrologerId,
            ratePerMinute,
            status: 'PENDING',
            intakeDetails,
            profileId: (intakeDetails as any)?.profileId || 'default', // Save profileId
            // Free trial for new users
            isFreeTrialSession: isEligibleForFreeTrial,
            freeTrialDurationSeconds: isEligibleForFreeTrial ? 120 : undefined,
        });

        await session.save();

        console.log(`[ChatService] Chat request created: ${session.sessionId}`);

        // Set auto-reject timeout
        const timeout = setTimeout(async () => {
            await this.timeoutChatRequest(session.sessionId);
        }, this.REQUEST_TIMEOUT_MS);
        this.requestTimeouts.set(session.sessionId, timeout);

        // Send FCM wake-up + socket notification to astrologer
        if (this.io) {
            const roomName = `astrologer:${astrologerId}`;

            const requestPayload = {
                sessionId: session.sessionId,
                userId: user._id.toString(),
                userName: user.name || 'User',
                intakeDetails,
                ratePerMinute,
                userMobile: user.mobile,
                createdAt: session.createdAt.toISOString(),
            };

            // FCM wake-up (best-effort, works even if app is killed/background)
            notificationService.sendHighPriorityChatRequest(astrologerId, {
                sessionId: session.sessionId,
                userId: user._id.toString(),
                userName: user.name || 'User',
                userMobile: user.mobile,
                ratePerMinute,
                intakeDetails,
            }).catch(e => console.error('[ChatService] FCM chat request send failed:', e));

            // Socket emit — fire and forget, no ACK, no retry
            this.io.to(roomName).emit('CHAT_REQUEST', requestPayload);
            console.log(`[ChatService] CHAT_REQUEST sent to room: ${roomName}`);
        } else {
            console.error(`[ChatService] ERROR: Socket.IO instance not initialized!`);
        }

        return session;
    }

    /**
     * Accept a pending chat request
     * Called when astrologer accepts the request
     */
    async acceptChatRequest(sessionId: string): Promise<IChatSession> {
        // Initial check (non-atomic, just for validation)
        let session = await ChatSession.findOne({ sessionId });
        if (!session) {
            throw new Error('Session not found');
        }

        // IDEMPOTENCY: If the session is already ACTIVE, just return it.
        // This handles cases where double-clicks or retries occur for an already successfully started chat.
        if (session.status === 'ACTIVE') {
            console.log(`[ChatService] acceptChatRequest itempotency: Session ${sessionId} is already ACTIVE.`);
            return session;
        }

        if (session.status !== 'PENDING') {
            throw new Error(`Cannot accept session with status: ${session.status}`);
        }

        // Clear request timeout
        const timeout = this.requestTimeouts.get(sessionId);
        if (timeout) {
            clearTimeout(timeout);
            this.requestTimeouts.delete(sessionId);
        }

        // Verify user still has enough balance (skip for free trial)
        const user = await User.findById(session.userId);

        if (!user) {
            throw new Error('User not found');
        }

        const minRealBalanceRequired = session.ratePerMinute * 5;
        if (!session.isFreeTrialSession && user.walletBalance < minRealBalanceRequired) {
            const errorMsg = `Insufficient real balance. Minimum ₹${minRealBalanceRequired} required for 5 minutes. User has ₹${user.walletBalance}.`;
            // Atomic update to fail
            await ChatSession.findOneAndUpdate(
                { sessionId, status: 'PENDING' },
                { 
                    status: 'ENDED', 
                    endReason: 'INSUFFICIENT_BALANCE_AT_ACCEPT',
                    errorDescription: errorMsg
                }
            );
            throw new Error(errorMsg);
        }

        // Atomically acquire the isBusy lock — only succeeds if astrologer is NOT currently busy,
        // OR if they are already busy with THIS specific session (re-accept/idempotency case).
        const astrologer = await Astrologer.findOneAndUpdate(
            { 
                _id: session.astrologerId, 
                $or: [
                    { isBusy: { $ne: true } },
                    { activeSessionId: sessionId } // Allow if already locked for this session
                ] 
            },
            { $set: { isBusy: true, activeSessionId: sessionId } },
            { new: true }
        );

        if (!astrologer) {
            // Either astrologer not found or already busy with ANOTHER chat
            const existingAstro = await Astrologer.findById(session.astrologerId);
            const errorMsg = existingAstro
                ? `Astrologer is already busy with another chat (Session: ${existingAstro.activeSessionId})`
                : 'Astrologer not found';
            
            // CRITICAL CHANGE: Do NOT mark the session as REJECTED here.
            // Marking it REJECTED permanently kills the session, preventing any retry.
            // If the busy state was transient or a race condition, we want the session to stay PENDING.
            // Only manual rejection or timeout should set REJECTED/ENDED.
            
            throw new Error(errorMsg);
        }

        // ATOMIC COMMIT: Try to change status PENDING -> ACTIVE
        const updatedSession = await ChatSession.findOneAndUpdate(
            { sessionId, status: 'PENDING' },
            {
                status: 'ACTIVE',
                startTime: new Date(),
                userJoined: true,
                astrologerJoined: true
            },
            { new: true }
        );

        if (!updatedSession) {
            // RACE CONDITION LOST!
            // The session is no longer PENDING (likely cancelled by user or already activated by another call).
            
            // Check current status to see if it was already activated (idempotency)
            const checkSession = await ChatSession.findOne({ sessionId });
            if (checkSession?.status === 'ACTIVE') {
                 return checkSession;
            }

            // Revert astrologer state ONLY IF it still points to this session
            await Astrologer.findOneAndUpdate(
                { _id: session.astrologerId, activeSessionId: sessionId },
                { $set: { isBusy: false, activeSessionId: undefined } }
            );

            throw new Error('Chat request was cancelled or expired');
        }

        // Use the updated session object from here
        session = updatedSession;

        // Start appropriate timer based on session type
        if (session.isFreeTrialSession) {
            // Free trial - start countdown timer instead of billing
            this.startFreeTrialTimer(sessionId, session.freeTrialDurationSeconds || 120);

            // Increment daily free chat count for astrologer
            astrologer.freeChatsToday = (astrologer.freeChatsToday || 0) + 1;
            astrologer.lastFreeChatDate = new Date();
            await astrologer.save();

            console.log(`[ChatService] Chat accepted - FREE TRIAL STARTED: ${sessionId}. Astrologer free chats today: ${astrologer.freeChatsToday}`);
        } else {
            // Regular paid session - start billing timer immediately
            this.startBillingTimer(sessionId);
            console.log(`[ChatService] Chat accepted and BILLING STARTED: ${sessionId}`);
        }

        // Fetch bonus usage setting for timer calculation
        const systemSettingModel = mongoose.model('SystemSetting');
        const bonusUsageSetting = await systemSettingModel.findOne({ key: 'bonusUsagePercent' });
        const bonusUsagePercent = Number(bonusUsageSetting?.value ?? 20);

        // Emit CHAT_STARTED to both user and astrologer
        if (this.io) {
            const chatStartedData = {
                sessionId,
                startTime: session.startTime,
                ratePerMinute: session.ratePerMinute,
                status: 'ACTIVE',
                isFreeTrialSession: session.isFreeTrialSession || false,
                freeTrialDurationSeconds: session.freeTrialDurationSeconds || 0,
            };

            this.io.to(`user:${session.userId}`).emit('CHAT_STARTED', {
                ...chatStartedData,
                astrologerId: session.astrologerId,
                astrologerName: `${astrologer.firstName} ${astrologer.lastName}`,
                intakeDetails: session.intakeDetails,
                sharedProfiles: session.sharedProfiles,
            });

            this.io.to(`astrologer:${session.astrologerId}`).emit('CHAT_STARTED', {
                ...chatStartedData,
                userId: session.userId,
                userName: user.name || 'User',
            });

            // BRIDGE CHECK (Backward Compatible):
            // We check if the user has at least one active socket connection. 
            // This works for ALL app versions. 
            try {
                const userSockets = await this.io.in(`user:${session.userId}`).fetchSockets();
                
                if (userSockets.length === 0) {
                   console.log(`[ChatService] User 0 sockets found for session: ${sessionId}. Rolling back.`);
                   throw new Error('NO_USER_SOCKETS');
                }
                
                console.log(`[ChatService] User is reachable (${userSockets.length} sockets). Proceeding.`);

                // Attempt optional verification check for new apps (Non-blocking for old apps)
                this.io.timeout(2000).to(`user:${session.userId}`).emitWithAck('BRIDGE_VERIFY', { sessionId })
                    .then(acks => {
                        if (acks && acks.length > 0) console.log(`[ChatService] Bridge verified via ACK for session: ${sessionId}`);
                    })
                    .catch(() => { /* Ignore timeout for backward compatibility */ });

            } catch (err) {
                console.warn(`[ChatService] User is PROPERLY unreachable for session: ${sessionId}. Rolling back.`);
                
                // ROLLBACK: User is confirmed not connected
                await ChatSession.findOneAndUpdate(
                    { sessionId },
                    { 
                        status: 'ENDED', 
                        endReason: 'USER_UNREACHABLE_AT_START',
                        errorDescription: 'User has 0 active sockets at the moment of acceptance'
                    }
                );

                await Astrologer.findOneAndUpdate(
                    { _id: session.astrologerId, activeSessionId: sessionId },
                    { $set: { isBusy: false, activeSessionId: undefined } }
                );

                // Stop any running timers
                const billingTimer = this.billingTimers.get(sessionId);
                if (billingTimer) {
                    clearTimeout(billingTimer);
                    this.billingTimers.delete(sessionId);
                }
                
                const trialTimer = this.freeTrialTimers.get(sessionId);
                if (trialTimer) {
                    clearInterval(trialTimer);
                    this.freeTrialTimers.delete(sessionId);
                }

                this.io.to(`astrologer:${session.astrologerId}`).emit('CHAT_CANCELLED', {
                    sessionId,
                    reason: 'User is no longer connected. Chat cancelled.'
                });

                throw new Error('User is no longer reachable. Please try another request.');
            }

            // Also emit TIMER_STARTED immediately with duration
            const realBalance = user.walletBalance || 0;
            const bonusBalance = user.bonusBalance || 0;
            
            const maxBonusUsage = bonusUsagePercent >= 100 
                ? bonusBalance 
                : realBalance * (bonusUsagePercent / (100 - bonusUsagePercent));
            
            const effectiveBalance = realBalance + Math.min(bonusBalance, maxBonusUsage);
            const remainingSeconds = session.isFreeTrialSession 
                ? (session.freeTrialDurationSeconds || 120) 
                : Math.floor((effectiveBalance / session.ratePerMinute) * 60);

            this.io.to(`user:${session.userId}`).emit('TIMER_STARTED', {
                sessionId,
                remainingSeconds,
                isFreeTrial: session.isFreeTrialSession || false
            });
            this.io.to(`astrologer:${session.astrologerId}`).emit('TIMER_STARTED', {
                sessionId,
                remainingSeconds,
                isFreeTrial: session.isFreeTrialSession || false
            });
        }

        // FCM BACKUP: Send data-only push to USER so they receive CHAT_STARTED
        // even if their socket connection died (background/killed state)
        notificationService.sendChatStartedNotification(session.userId.toString(), {
            sessionId,
            astrologerId: session.astrologerId.toString(),
            astrologerName: `${astrologer.firstName} ${astrologer.lastName}`,
            ratePerMinute: session.ratePerMinute,
            startTime: session.startTime?.toISOString() || new Date().toISOString(),
            isFreeTrialSession: session.isFreeTrialSession || false,
            freeTrialDurationSeconds: session.freeTrialDurationSeconds || 0,
        }).catch(err => console.error('[ChatService] FCM chat_started push failed:', err));

        // DISMISS SIGNAL: Send a 'cancel' notification to the ASTROLOGER themselves.
        // This ensures the persistent 'incoming call' notification is cleared on ALL their devices.
        notificationService.sendChatCancelNotification(
            session.astrologerId.toString(),
            sessionId,
            'cancelled' // Using 'cancelled' as the reason triggers notification dismissal in the app
        ).catch(err => console.error('[ChatService] FCM dismiss notify failed:', err));

        return session;
    }

    /**
     * Handle participant joining the chat room
     * Start billing when both joined
     */
    async joinSession(sessionId: string, userType: 'user' | 'astrologer'): Promise<void> {
        const session = await ChatSession.findOne({ sessionId });
        if (!session) return; // Should allow re-joins?

        console.log(`[ChatService] ${userType} joined session: ${sessionId}`);

        let stateChanged = false;

        if (userType === 'user' && !session.userJoined) {
            session.userJoined = true;
            stateChanged = true;
        } else if (userType === 'astrologer' && !session.astrologerJoined) {
            session.astrologerJoined = true;
            stateChanged = true;
        }

        if (stateChanged) {
            await session.save();
        }

        // Check if both joined and billing NOT started
        if (session.userJoined && session.astrologerJoined && !session.startTime) {
            session.startTime = new Date();
            await session.save();

            if (session.isFreeTrialSession) {
                console.log(`[ChatService] Both participants joined for session: ${sessionId}. (Free trial timer should already be running)`);
            } else {
                console.log(`[ChatService] Both participants joined for session: ${sessionId}. (Billing timer should already be running)`);
            }

            // Notify clients that timer has started
            if (this.io) {
                this.io.to(`user:${session.userId}`).emit('TIMER_STARTED', {
                    sessionId,
                    startTime: session.startTime
                });
                this.io.to(`astrologer:${session.astrologerId}`).emit('TIMER_STARTED', {
                    sessionId,
                    startTime: session.startTime
                });
            }
        }
    }

    /**
     * Reject a pending chat request
     */
    async rejectChatRequest(sessionId: string): Promise<void> {
        const session = await ChatSession.findOne({ sessionId });
        if (!session) {
            throw new Error('Session not found');
        }

        if (session.status !== 'PENDING') {
            throw new Error(`Cannot reject session with status: ${session.status}`);
        }

        // Clear request timeout
        const timeout = this.requestTimeouts.get(sessionId);
        if (timeout) {
            clearTimeout(timeout);
            this.requestTimeouts.delete(sessionId);
        }

        session.status = 'REJECTED';
        session.endReason = 'ASTROLOGER_REJECTED';
        await session.save();

        console.log(`[ChatService] Chat rejected: ${sessionId}`);

        // Emit CHAT_REJECTED to user
        if (this.io) {
            this.io.to(`user:${session.userId}`).emit('CHAT_REJECTED', {
                sessionId,
                reason: 'Astrologer declined the request'
            });
        }

        // FCM BACKUP: Send to user in case socket is dead
        notificationService.sendChatRejectedNotification(
            session.userId.toString(),
            sessionId,
            'Astrologer declined the request'
        ).catch(err => console.error('[ChatService] FCM chat_rejected push failed:', err));
    }

    /**
     * Auto-timeout a chat request that wasn't responded to
     */
    private async timeoutChatRequest(sessionId: string): Promise<void> {
        // Use atomic operation to handle race condition
        const session = await ChatSession.findOneAndUpdate(
            { sessionId, status: 'PENDING' },
            { 
                status: 'ENDED', 
                endReason: 'ASTROLOGER_TIMEOUT',
                errorDescription: 'request timeout, astrologer hasn\'t picked up, request missed'
            },
            { new: true }
        );

        if (!session) {
            // Session was already accepted/rejected/cancelled
            return;
        }

        this.requestTimeouts.delete(sessionId);
        console.log(`[ChatService] Chat request timed out: ${sessionId}`);

        // Emit CHAT_TIMEOUT to both parties via socket
        if (this.io) {
            this.io.to(`user:${session.userId}`).emit('CHAT_TIMEOUT', {
                sessionId,
                reason: 'Request timed out - Astrologer did not respond in 30 seconds'
            });
            this.io.to(`astrologer:${session.astrologerId}`).emit('CHAT_TIMEOUT', {
                sessionId,
                reason: 'Request timed out'
            });
        }

        // FCM push to dismiss astrologer's incoming chat notification
        notificationService.sendChatCancelNotification(
            session.astrologerId.toString(),
            sessionId,
            'timeout'
        ).catch(err => console.error('[ChatService] FCM timeout push failed:', err));

        let penaltyAmount = 0;
        const astrologer = await Astrologer.findById(session.astrologerId);

        if (session.isFreeTrialSession && astrologer) {
            try {
                const systemSettingModel = mongoose.model('SystemSetting');
                const freeChatRateSetting = await systemSettingModel.findOne({ key: 'freeChatRate' });
                const penaltyEnabledSetting = await systemSettingModel.findOne({ key: 'isFreeChatPenaltyEnabled' });
                const penaltyRateSetting = await systemSettingModel.findOne({ key: 'freeChatPenaltyRate' });

                const isPenaltyEnabled = penaltyEnabledSetting ? (penaltyEnabledSetting.value === true || penaltyEnabledSetting.value === 'true') : true;

                if (isPenaltyEnabled) {
                    const freeChatRate = Number(freeChatRateSetting?.value ?? 4);
                    let freeChatPenaltyRate = penaltyRateSetting?.value;
                    if (freeChatPenaltyRate === undefined || freeChatPenaltyRate === null) {
                        const freeChatCommissionSetting = await systemSettingModel.findOne({ key: 'freeChatCommission' });
                        freeChatPenaltyRate = Number(freeChatCommissionSetting?.value ?? 50);
                    } else {
                        freeChatPenaltyRate = Number(freeChatPenaltyRate);
                    }

                    penaltyAmount = Math.round((freeChatRate * freeChatPenaltyRate / 100) * 100) / 100;

                    if (penaltyAmount > 0) {
                        astrologer.earnings = Math.round(((astrologer.earnings || 0) - penaltyAmount) * 100) / 100;
                        console.log(`[ChatService] Deducting penalty of ₹${penaltyAmount} from astrologer ${astrologer._id} for missed free chat (Rate: ${freeChatPenaltyRate}%).`);

                        const transaction = new Transaction({
                            fromUser: session.userId,
                            toAstrologer: astrologer._id,
                            amount: penaltyAmount,
                            type: 'debit',
                            status: 'success',
                            description: `Penalty for missed free chat session: ${session.sessionId} (Base: ₹${freeChatRate}, Penalty: ₹${penaltyAmount})`
                        });
                        await transaction.save();

                        session.penaltyAmount = penaltyAmount;
                        await session.save();
                    }
                } else {
                    console.log(`[ChatService] Free chat penalty is DISABLED globally. Skipping deduction for astrologer ${astrologer._id}.`);
                }
            } catch (penaltyErr) {
                console.error('[ChatService] Error processing missed free chat penalty:', penaltyErr);
            }
        }

        try {
            const user = await User.findById(session.userId);
            const userName = user ? `${user.name || 'User'}` : 'a user';

            const notificationBody = penaltyAmount > 0
                ? `You missed a free chat request from ${userName}. A penalty of ₹${penaltyAmount} has been deducted from your wallet balance.`
                : `You missed a chat request from ${userName}. Please try to stay online for next requests.`;

            await notificationService.createAndSendNotification(
                session.astrologerId.toString(),
                'astrologer',
                {
                    title: 'Missed Chat Request',
                    body: notificationBody
                },
                {
                    navigateType: 'screen',
                    navigateTarget: 'NotificationList'
                },
                'alert'
            );
        } catch (notifErr) {
            console.error('[ChatService] Failed to send missed chat notification:', notifErr);
        }

        if (astrologer) {
            astrologer.missedChats = (astrologer.missedChats || 0) + 1;

            // AUTO-BLOCK: if astrologer has 2+ warnings and 3+ missed chats
            if (astrologer.warningCount >= 2 && astrologer.missedChats >= 3) {
                console.log(`[ChatService] Auto-blocking astrologer ${astrologer._id} due to 3 missed chats after 2 warnings.`);
                astrologer.isBlocked = true;
                astrologer.isOnline = false;

                if (this.io) {
                    this.io.to(`astrologer:${astrologer._id}`).emit('ASTROLOGER_BLOCKED', {
                        reason: 'Account blocked due to missing 3 chats after receiving 2 official warnings.'
                    });
                }
            }
            await astrologer.save();
        }
    }

    /**
     * Cancel a pending chat request (user initiated)
     * Uses atomic operation to handle race conditions with astrologer accept
     * Returns: { cancelled: boolean, reason?: string }
     */
    async cancelChatRequest(sessionId: string, userId: string): Promise<{ cancelled: boolean; reason?: string }> {
        // Use atomic findOneAndUpdate to prevent race conditions
        // Only cancel if still PENDING and belongs to this user
        const session = await ChatSession.findOneAndUpdate(
            {
                sessionId,
                status: 'PENDING',
                userId: userId
            },
            {
                status: 'ENDED',
                endReason: 'USER_CANCEL_WHILE_PENDING'
            },
            { new: false } // Return the old document to check original status
        );

        if (!session) {
            // Check why we couldn't cancel
            const existingSession = await ChatSession.findOne({ sessionId });
            if (!existingSession) {
                return { cancelled: false, reason: 'session_not_found' };
            }
            if (existingSession.userId.toString() !== userId) {
                return { cancelled: false, reason: 'unauthorized' };
            }
            if (existingSession.status === 'ACTIVE') {
                return { cancelled: false, reason: 'already_started' };
            }
            if (existingSession.status === 'REJECTED' || existingSession.status === 'ENDED') {
                return { cancelled: false, reason: 'already_ended' };
            }
            return { cancelled: false, reason: 'unknown' };
        }

        // Clear the request timeout
        const timeout = this.requestTimeouts.get(sessionId);
        if (timeout) {
            clearTimeout(timeout);
            this.requestTimeouts.delete(sessionId);
        }

        console.log(`[ChatService] Chat request cancelled by user: ${sessionId}`);

        // Emit CHAT_CANCELLED to astrologer via socket
        if (this.io) {
            this.io.to(`astrologer:${session.astrologerId}`).emit('CHAT_CANCELLED', {
                sessionId,
                reason: 'User cancelled the request'
            });
        }

        // Also send FCM push to cancel notification (works even if socket is disconnected)
        notificationService.sendChatCancelNotification(
            session.astrologerId.toString(),
            sessionId,
            'cancelled'
        ).catch(err => console.error('[ChatService] FCM cancel push failed:', err));

        return { cancelled: true };
    }

    /**
     * End an active chat session
     */
    async endChat(
        sessionId: string,
        endReason: 'USER_END' | 'ASTROLOGER_END' | 'INSUFFICIENT_BALANCE' | 'DISCONNECT' | 'FREE_TRIAL_ENDED'
    ): Promise<IChatSession> {
        const session = await ChatSession.findOne({ sessionId });
        if (!session) {
            throw new Error('Session not found');
        }

        if (session.status !== 'ACTIVE') {
            throw new Error(`Cannot end session with status: ${session.status}`);
        }

        // Stop billing timer and free trial timer
        this.stopBillingTimer(sessionId);
        this.stopFreeTrialTimer(sessionId);

        // --- PARTIAL BILLING LOGIC ---
        // Only if billing actually started AND not a free trial session
        if (session.startTime && !session.isFreeTrialSession) {
            // Calculate exact duration and remaining charge
            const endTime = new Date();
            const startTime = session.startTime;
            const durationMs = endTime.getTime() - startTime.getTime();
            const durationMinutes = Math.max(0, durationMs / 60000); // Ensure no negative

            // Calculate total expected cost
            let totalExpectedCost = 0;

            // Per requirement: Billing starts from the first second (per-second billing).
            // Calculate total expected cost based on exact duration.
            totalExpectedCost = durationMinutes * session.ratePerMinute;

            // Calculate what has NOT yet been billed
            const alreadyCharged = session.totalAmount;
            let remainingToCharge = totalExpectedCost - alreadyCharged;

            // Round to 2 decimals
            remainingToCharge = Math.round(remainingToCharge * 100) / 100;

            console.log(`[ChatService] End Chat Billing Calc: Duration=${durationMinutes.toFixed(2)}m, Expected=${totalExpectedCost}, Charged=${alreadyCharged}, Remaining=${remainingToCharge}`);

            if (remainingToCharge > 0) {
                const user = await User.findById(session.userId);
                const astrologer = await Astrologer.findById(session.astrologerId);

                if (user && astrologer) {
                    console.log(`[ChatService] Processing final partial deduction: ${remainingToCharge}`);
                    const paymentResult = await this.processPayment(
                        session,
                        user,
                        astrologer,
                        remainingToCharge,
                        `Chat session: ${sessionId} - Final Partial Settlement`
                    );

                    if (!paymentResult.success) {
                        console.warn(`[ChatService] Failed to capture final partial amount ${remainingToCharge} from user ${user._id}`);
                    }
                }
            }

            // Update totalMinutes to exact duration string for safety (model expects number)
            const finalTotalMinutes = parseFloat(durationMinutes.toFixed(2));

            // Atomic update for Session to mark as ENDED and save final duration
            await ChatSession.findOneAndUpdate(
                { sessionId: session.sessionId },
                {
                    $set: {
                        status: 'ENDED',
                        endTime: new Date(),
                        endReason: endReason,
                        totalMinutes: finalTotalMinutes
                    }
                }
            );

            // Update local object so the emitted CHAT_ENDED event contains accurate data
            session.status = 'ENDED';
            session.endTime = new Date();
            session.endReason = endReason;
            session.totalMinutes = finalTotalMinutes;
        } else {
            let finalDuration = 0;
            if (session.startTime) {
                const endTime = new Date();
                const startTime = session.startTime;
                const durationMs = endTime.getTime() - startTime.getTime();
                finalDuration = parseFloat((durationMs / 60000).toFixed(2));
            }

            if (session.isFreeTrialSession) {
                // ALWAYS mark free trial as used — even if session ended before chat started.
                // This prevents users from exploiting disconnect-reconnect loops for infinite trials.
                console.log(`[ChatService] Ended FREE TRIAL session ${sessionId}. Duration: ${finalDuration}m. Marking free trial as USED for user ${session.userId}.`);
                await User.findByIdAndUpdate(session.userId, { hasUsedFreeTrial: true });

                // Process free chat system payout to astrologer if the chat actually started
                if (session.startTime) {
                    await this.processFreeChatPayout(session);
                }
            } else {
                console.log(`[ChatService] Ended session ${sessionId} (non-trial), duration: ${finalDuration}m.`);
            }

            await ChatSession.findOneAndUpdate(
                { sessionId: session.sessionId },
                {
                    $set: {
                        status: 'ENDED',
                        endTime: new Date(),
                        endReason: endReason,
                        totalMinutes: finalDuration
                    }
                }
            );
            session.status = 'ENDED';
            session.endTime = new Date();
            session.endReason = endReason;
            session.totalMinutes = finalDuration;
        }
        // -----------------------------

        // Unlock astrologer atomically
        await Astrologer.findByIdAndUpdate(session.astrologerId, {
            $set: { isBusy: false, activeSessionId: undefined },
            $inc: { totalChats: 1 }
        });

        // Fetch FINAL fresh user balance to send with end event
        const finalUser = await User.findById(session.userId);

        console.log(`[ChatService] Chat ended: ${sessionId}, reason: ${endReason}`);

        // Emit CHAT_ENDED to both parties
        if (this.io) {
            const endPayload = {
                sessionId,
                endReason,
                totalMinutes: session.totalMinutes,
                totalAmount: session.totalAmount,
                astrologerEarnings: (session as any).astrologerNetEarnings ?? session.astrologerEarnings
            };

            // Send to user with THEIR updated balance
            this.io.to(`user:${session.userId}`).emit('CHAT_ENDED', {
                ...endPayload,
                walletBalance: finalUser?.walletBalance || 0,
                bonusBalance: finalUser?.bonusBalance || 0
            });

            // Send to astrologer (standard payload)
            this.io.to(`astrologer:${session.astrologerId}`).emit('CHAT_ENDED', endPayload);
        }

        // FCM BACKUP: Send to both parties in case their socket is dead
        notificationService.sendChatEndedNotification(
            session.userId.toString(),
            session.astrologerId.toString(),
            {
                sessionId,
                endReason,
                totalMinutes: session.totalMinutes,
                totalAmount: session.totalAmount,
            }
        ).catch(err => console.error('[ChatService] FCM chat_ended push failed:', err));

        return session;
    }

    /**
     * Start the 60-second billing timer for a session
     */
    private async startBillingTimer(sessionId: string): Promise<void> {
        if (this.billingTimers.has(sessionId)) {
            console.log(`[ChatService] Billing timer ALREADY RUNNING for: ${sessionId}. Skipping duplicate start.`);
            return;
        }
        console.log(`[ChatService] Starting billing timer for: ${sessionId}`);

        // Update lastBilledAt in DB to prevent immediate re-billing on restart
        await ChatSession.updateOne({ sessionId }, { $set: { lastBilledAt: new Date() } });

        const timer = setInterval(async () => {
            await this.processBillingCycle(sessionId);
        }, this.BILLING_INTERVAL_MS);

        this.billingTimers.set(sessionId, timer);
    }

    /**
     * Stop the billing timer for a session
     */
    private stopBillingTimer(sessionId: string): void {
        const timer = this.billingTimers.get(sessionId);
        if (timer) {
            clearInterval(timer);
            this.billingTimers.delete(sessionId);
            console.log(`[ChatService] Stopped billing timer for: ${sessionId}`);
        }
    }

    /**
     * Start the free trial countdown timer for a session
     * Auto-ends the session after the trial duration
     */
    private async startFreeTrialTimer(sessionId: string, durationSeconds: number): Promise<void> {
        if (this.freeTrialTimers.has(sessionId)) {
            console.log(`[ChatService] Free trial timer ALREADY RUNNING for: ${sessionId}. Skipping duplicate start.`);
            return;
        }
        console.log(`[ChatService] Starting FREE TRIAL timer for: ${sessionId}, duration: ${durationSeconds}s`);

        const session = await ChatSession.findOne({ sessionId });
        if (!session) return;

        // Timer to end the session
        const endTimer = setTimeout(async () => {
            await this.endFreeTrialSession(sessionId);
        }, durationSeconds * 1000);

        this.freeTrialTimers.set(sessionId, endTimer);

        // Timer to send warning 60s before end (if duration > 60s)
        if (durationSeconds > 60) {
            const warningTimer = setTimeout(() => {
                if (this.io) {
                    this.io.to(`user:${session.userId}`).emit('LAST_MINUTE_WARNING', {
                        sessionId,
                        remainingBalance: 0,
                        ratePerMinute: 0,
                        isFreeTrial: true,
                        isBalanceDepleted: false
                    });
                    console.log(`[ChatService] Free trial last-minute warning sent for: ${sessionId}`);
                }
            }, (durationSeconds - 60) * 1000);
            this.freeTrialWarningTimers.set(sessionId, warningTimer);
        }
    }

    /**
     * Stop the free trial timer for a session
     */
    private stopFreeTrialTimer(sessionId: string): void {
        const timer = this.freeTrialTimers.get(sessionId);
        if (timer) {
            clearTimeout(timer);
            this.freeTrialTimers.delete(sessionId);
            console.log(`[ChatService] Stopped free trial timer for: ${sessionId}`);
        }

        const warningTimer = this.freeTrialWarningTimers.get(sessionId);
        if (warningTimer) {
            clearTimeout(warningTimer);
            this.freeTrialWarningTimers.delete(sessionId);
            console.log(`[ChatService] Stopped free trial warning timer for: ${sessionId}`);
        }
    }

    /**
     * End a free trial session when the trial period expires
     * Marks user as having used their free trial
     */
    private async endFreeTrialSession(sessionId: string): Promise<void> {
        const session = await ChatSession.findOne({ sessionId });
        if (!session || session.status !== 'ACTIVE') {
            console.log(`[ChatService] Free trial session already ended or not found: ${sessionId}`);
            return;
        }

        console.log(`[ChatService] FREE TRIAL ENDED for session: ${sessionId}`);

        // Mark user as having used their free trial
        await User.findByIdAndUpdate(session.userId, { hasUsedFreeTrial: true });
        console.log(`[ChatService] Marked user ${session.userId} as having used free trial`);

        // End the chat with FREE_TRIAL_ENDED reason
        await this.endChat(sessionId, 'FREE_TRIAL_ENDED' as any);
    }

    /**
     * Process one billing cycle (60 seconds)
     * This is the CRITICAL billing logic
     */
    private async processBillingCycle(sessionId: string): Promise<void> {
        const session = await ChatSession.findOne({ sessionId });
        if (!session || session.status !== 'ACTIVE') {
            this.stopBillingTimer(sessionId);
            return;
        }

        // Safety check: Don't bill for free trial sessions
        if (session.isFreeTrialSession) {
            console.log(`[ChatService] processBillingCycle called for FREE TRIAL session: ${sessionId}. Stopping billing timer.`);
            this.stopBillingTimer(sessionId);
            return;
        }

        const user = await User.findById(session.userId);
        const astrologer = await Astrologer.findById(session.astrologerId);

        if (!user || !astrologer) {
            console.error(`[ChatService] Billing error: User or Astrologer not found`);
            await this.endChat(sessionId, 'DISCONNECT');
            return;
        }

        const ratePerMinute = session.ratePerMinute;

        // Fetch bonus usage setting
        const systemSettingModel = mongoose.model('SystemSetting');
        const bonusUsageSetting = await systemSettingModel.findOne({ key: 'bonusUsagePercent' });
        const bonusUsagePercent = Number(bonusUsageSetting?.value ?? 20);

        const realBalance = user.walletBalance || 0;
        const bonusBalance = user.bonusBalance || 0;

        // Duration calculation
        const maxBonusUsage = bonusUsagePercent >= 100 
            ? bonusBalance 
            : realBalance * (bonusUsagePercent / (100 - bonusUsagePercent));
        const effectiveBalance = realBalance + Math.min(bonusBalance, maxBonusUsage);

        console.log(`[ChatService] Billing Cycle Diagnostic [${sessionId}]: ` +
                    `Real:₹${realBalance.toFixed(2)}, Bonus:₹${bonusBalance.toFixed(2)}, ` +
                    `BonusUsage%: ${bonusUsagePercent}%, MaxBonus:₹${maxBonusUsage.toFixed(2)}, ` +
                    `Effective:₹${effectiveBalance.toFixed(2)}, Rate:₹${ratePerMinute}/min`);

        // Terminate if user can no longer afford even 1 minute
        if (effectiveBalance < ratePerMinute) {
            console.log(`[ChatService] Effective balance depleted (${effectiveBalance}), ending chat: ${sessionId}`);
            await this.endChat(sessionId, 'INSUFFICIENT_BALANCE');
            return;
        }

        // Process payment atomically
        const paymentResult = await this.processPayment(session, user, astrologer);

        if (!paymentResult.success) {
            console.error(`[ChatService] Payment failed for: ${sessionId}`);
            await this.endChat(sessionId, 'INSUFFICIENT_BALANCE');
            return;
        }

        // Update lastBilledAt in DB
        await ChatSession.updateOne({ sessionId }, { $set: { lastBilledAt: new Date() } });

        // Reload user to check new balance
        const updatedUser = await User.findById(session.userId);
        if (!updatedUser) return;

        // Emit billing update to both parties with split wallet info
        if (this.io) {
            this.io.to(`user:${session.userId}`).emit('BILLING_UPDATE', {
                sessionId,
                minutesElapsed: session.totalMinutes,
                amountDeducted: session.totalAmount,
                realDeducted: paymentResult.realDeducted || 0,
                bonusDeducted: paymentResult.bonusDeducted || 0,
                realBalance: updatedUser.walletBalance || 0,
                bonusBalance: updatedUser.bonusBalance || 0
            });

            this.io.to(`astrologer:${session.astrologerId}`).emit('BILLING_UPDATE', {
                sessionId,
                minutesElapsed: session.totalMinutes,
                amountDeducted: session.totalAmount,
                astrologerEarnings: (session as any).astrologerNetEarnings ?? session.astrologerEarnings
            });
        }

        // CRITICAL FIX: If combined balance depleted, end chat IMMEDIATELY
        const newCombinedBalance = (updatedUser.walletBalance || 0) + (updatedUser.bonusBalance || 0);
        if (newCombinedBalance <= 0) {
            console.log(`[ChatService] Combined balance depleted (${newCombinedBalance}), ending chat: ${sessionId}`);
            await this.endChat(sessionId, 'INSUFFICIENT_BALANCE');
            return;
        }

        // Check for LAST MINUTE WARNING
        if (newCombinedBalance < ratePerMinute * 2 && newCombinedBalance > 0) {
            console.log(`[ChatService] Sending last minute warning for: ${sessionId}, balance: ${newCombinedBalance}`);
            if (this.io) {
                this.io.to(`user:${session.userId}`).emit('LAST_MINUTE_WARNING', {
                    sessionId,
                    remainingBalance: newCombinedBalance,
                    ratePerMinute
                });
            }
        }
    }

    /**
     * Process payment atomically
     * Deduct from user wallet (split between bonus and real), add to astrologer earnings
     * Astrologer earns only from real money portion based on commission percentage
     */
    private async processPayment(
        session: IChatSession,
        user: any,
        astrologer: any,
        amountOverride?: number,
        descriptionOverride?: string
    ): Promise<{ success: boolean; realDeducted?: number; bonusDeducted?: number }> {
        try {
            // Fetch settings for bonus usage and commission
            const systemSettingModel = mongoose.model('SystemSetting');
            const bonusUsageSetting = await systemSettingModel.findOne({ key: 'bonusUsagePercent' });
            const commissionSetting = await systemSettingModel.findOne({ key: 'astrologerCommission' });

            const bonusUsagePercent = Number(bonusUsageSetting?.value ?? 20); // Default 20%
            const astrologerCommission = Number(commissionSetting?.value ?? 40); // Default 40%

            const ratePerMinute = session.ratePerMinute;
            const rawAmount = amountOverride !== undefined ? amountOverride : ratePerMinute;
            const totalToDeduct = Math.round(rawAmount * 100) / 100;

            // Calculate split: X% from bonus, rest from real
            let bonusDeduction = Math.round((totalToDeduct * bonusUsagePercent / 100) * 100) / 100;
            let realDeduction = Math.round((totalToDeduct - bonusDeduction) * 100) / 100;

            // Adjust if bonus wallet doesn't have enough
            const bonusBalance = user.bonusBalance || 0;
            if (bonusDeduction > bonusBalance) {
                bonusDeduction = Math.round(bonusBalance * 100) / 100;
                realDeduction = Math.round((totalToDeduct - bonusDeduction) * 100) / 100;
            }

            // ATOMIC STEP 1: Deduct from User
            const userUpdate: any = {
                $inc: {
                    walletBalance: -realDeduction,
                    bonusBalance: -bonusDeduction
                }
            };

            // CRITICAL FIX: Build a safe atomic query that handles null/undefined bonusBalance.
            // Old MongoDB documents may not have bonusBalance set (it would be null/undefined).
            // If bonusDeduction == 0 (user has no bonus), we must NOT require bonusBalance >= 0
            // because MongoDB won't match null values with $gte: 0.
            // Solution: Only add the bonusBalance constraint if we are actually deducting from it.
            const atomicQuery: any = {
                _id: user._id,
                walletBalance: { $gte: realDeduction - 0.005 },
            };
            if (bonusDeduction > 0) {
                // Only enforce bonus balance constraint when we're actually deducting from it
                atomicQuery.bonusBalance = { $gte: bonusDeduction - 0.005 };
            }

            const updatedUserDoc = await User.findOneAndUpdate(
                atomicQuery,
                userUpdate,
                { new: true }
            );

            if (!updatedUserDoc) {
                // Re-check real balance to give a proper error message
                const freshUser = await User.findById(user._id);
                const freshCombined = (freshUser?.walletBalance || 0) + (freshUser?.bonusBalance || 0);
                
                console.warn(`[ChatService] Atomic deduction FAILED for user ${user._id}: ` +
                             `Target: Real>=₹${realDeduction}, Bonus>=₹${bonusDeduction}. ` +
                             `Fresh: Wallet:₹${freshUser?.walletBalance}, Bonus:₹${freshUser?.bonusBalance}, Combined:₹${freshCombined.toFixed(2)}. ` +
                             `Total required for cycle: ₹${totalToDeduct}`);
                
                return { success: false };
            }

            // ATOMIC STEP 2: Add to Astrologer Earnings
            const astrologerShare = Math.round((realDeduction * astrologerCommission / 100) * 100) / 100;

            // ============ TDS CALCULATION LOGIC ============
            const tdsThresholdSetting = await systemSettingModel.findOne({ key: 'tdsThreshold' });
            const tdsRateSetting = await systemSettingModel.findOne({ key: 'tdsRate' });
            const tdsThreshold = tdsThresholdSetting?.value ?? 50000;
            const tdsRate = tdsRateSetting?.value ?? 10;

            const now = new Date();
            const currentFYStart = new Date(now.getFullYear(), 3, 1);
            if (now.getMonth() < 3) currentFYStart.setFullYear(now.getFullYear() - 1);

            // Re-fetch astrologer for freshest TDS tracking data
            const freshAstrologer = await Astrologer.findById(astrologer._id);
            if (!freshAstrologer) throw new Error('Astrologer not found');

            let fyResetUpdate: any = {};
            if (!freshAstrologer.yearlyEarningsStartDate || new Date(freshAstrologer.yearlyEarningsStartDate) < currentFYStart) {
                fyResetUpdate = {
                    yearlyEarningsStartDate: currentFYStart,
                    yearlyGrossEarnings: 0,
                    yearlyTdsDeducted: 0
                };
            }

            const previousYearlyEarnings = fyResetUpdate.yearlyGrossEarnings ?? (freshAstrologer.yearlyGrossEarnings || 0);
            const newYearlyEarnings = previousYearlyEarnings + astrologerShare;

            let tdsDeduction = 0;
            let netAstrologerShare = astrologerShare;

            if (newYearlyEarnings > tdsThreshold) {
                if (previousYearlyEarnings <= tdsThreshold) {
                    tdsDeduction = Math.round((newYearlyEarnings * tdsRate / 100) * 100) / 100;
                } else {
                    tdsDeduction = Math.round((astrologerShare * tdsRate / 100) * 100) / 100;
                }
                netAstrologerShare = Math.round((astrologerShare - tdsDeduction) * 100) / 100;
            }

            // Atomic update for Astrologer earnings and FY tracking
            await Astrologer.updateOne(
                { _id: astrologer._id },
                {
                    $inc: {
                        earnings: netAstrologerShare,
                        yearlyGrossEarnings: astrologerShare,
                        yearlyTdsDeducted: tdsDeduction
                    },
                    $set: {
                        yearlyEarningsStartDate: fyResetUpdate.yearlyEarningsStartDate || freshAstrologer.yearlyEarningsStartDate
                    }
                }
            );

            // ATOMIC STEP 3: Update Session Totals
            const sessionUpdate: any = {
                $inc: {
                    totalAmount: totalToDeduct,
                    astrologerEarnings: astrologerShare,
                    astrologerNetEarnings: netAstrologerShare
                }
            };
            if (amountOverride === undefined) {
                sessionUpdate.$inc.totalMinutes = 1;
            }

            const updatedSessionDoc = await ChatSession.findOneAndUpdate(
                { sessionId: session.sessionId },
                sessionUpdate,
                { new: true }
            );

            // Update local session object for caller
            if (updatedSessionDoc) {
                session.totalMinutes = updatedSessionDoc.totalMinutes;
                session.totalAmount = updatedSessionDoc.totalAmount;
                session.astrologerEarnings = updatedSessionDoc.astrologerEarnings;
                (session as any).astrologerNetEarnings = (updatedSessionDoc as any).astrologerNetEarnings;
            }

            // ATOMIC STEP 4: Create Transaction Record
            const transaction = new Transaction({
                fromUser: user._id,
                toAstrologer: astrologer._id,
                amount: totalToDeduct,
                type: 'debit',
                status: 'success',
                description: descriptionOverride || `Chat: ${session.sessionId} - Min ${updatedSessionDoc?.totalMinutes} (Real: ₹${realDeduction}, Bonus: ₹${bonusDeduction}, Astro: ₹${astrologerShare})`
            });
            await transaction.save();

            console.log(`[ChatService] Billing processed: Real=-${realDeduction}, Bonus=-${bonusDeduction}, AstroEarns=${astrologerShare}`);
            return { success: true, realDeducted: realDeduction, bonusDeducted: bonusDeduction };

        } catch (error: any) {
            console.error('[ChatService] Payment process failed:', error?.message || error);
            return { success: false };
        }
    }

    /**
     * Process system payout to astrologer for a completed free chat
     */
    private async processFreeChatPayout(session: IChatSession): Promise<void> {
        try {
            const systemSettingModel = mongoose.model('SystemSetting');
            const freeChatRateSetting = await systemSettingModel.findOne({ key: 'freeChatRate' });
            const freeChatCommissionSetting = await systemSettingModel.findOne({ key: 'freeChatCommission' });
            const payoutEnabledSetting = await systemSettingModel.findOne({ key: 'isFreeChatPayoutEnabled' });

            // Check if payout is enabled (defaulting to true if not set)
            const isPayoutEnabled = payoutEnabledSetting ? (payoutEnabledSetting.value === true || payoutEnabledSetting.value === 'true') : true;

            if (!isPayoutEnabled) {
                console.log(`[ChatService] Free chat payout is DISABLED. Skipping payout for session: ${session.sessionId}`);
                return;
            }

            const freeChatRate = Number(freeChatRateSetting?.value ?? 4); // Default ₹4 gross flat rate
            const freeChatCommission = Number(freeChatCommissionSetting?.value ?? 50);

            if (freeChatRate <= 0) return; // No payout configured

            const astrologerShare = Math.round((freeChatRate * freeChatCommission / 100) * 100) / 100;
            const astrologer = await Astrologer.findById(session.astrologerId);
            if (!astrologer) return;

            // ============ TDS CALCULATION LOGIC ============
            const tdsThresholdSetting = await systemSettingModel.findOne({ key: 'tdsThreshold' });
            const tdsRateSetting = await systemSettingModel.findOne({ key: 'tdsRate' });
            const tdsThreshold = tdsThresholdSetting?.value ?? 50000;
            const tdsRate = tdsRateSetting?.value ?? 10;

            const now = new Date();
            const currentFYStart = new Date(now.getFullYear(), 3, 1);
            if (now.getMonth() < 3) currentFYStart.setFullYear(now.getFullYear() - 1);

            let fyResetUpdate: any = {};
            if (!astrologer.yearlyEarningsStartDate || new Date(astrologer.yearlyEarningsStartDate) < currentFYStart) {
                fyResetUpdate = {
                    yearlyEarningsStartDate: currentFYStart,
                    yearlyGrossEarnings: 0,
                    yearlyTdsDeducted: 0
                };
            }

            const previousYearlyEarnings = fyResetUpdate.yearlyGrossEarnings ?? (astrologer.yearlyGrossEarnings || 0);
            const newYearlyEarnings = previousYearlyEarnings + astrologerShare;

            let tdsDeduction = 0;
            let netAstrologerShare = astrologerShare;

            if (newYearlyEarnings > tdsThreshold) {
                if (previousYearlyEarnings <= tdsThreshold) {
                    tdsDeduction = Math.round((newYearlyEarnings * tdsRate / 100) * 100) / 100;
                } else {
                    tdsDeduction = Math.round((astrologerShare * tdsRate / 100) * 100) / 100;
                }
                netAstrologerShare = Math.round((astrologerShare - tdsDeduction) * 100) / 100;
            }

            // Atomic update for Astrologer earnings and FY tracking
            await Astrologer.updateOne(
                { _id: astrologer._id },
                {
                    $inc: {
                        earnings: netAstrologerShare,
                        yearlyGrossEarnings: astrologerShare,
                        yearlyTdsDeducted: tdsDeduction
                    },
                    $set: {
                        yearlyEarningsStartDate: fyResetUpdate.yearlyEarningsStartDate || astrologer.yearlyEarningsStartDate
                    }
                }
            );

            // ATOMIC STEP: Update Session Totals
            const updatedSessionDoc = await ChatSession.findOneAndUpdate(
                { sessionId: session.sessionId },
                {
                    $inc: {
                        astrologerEarnings: astrologerShare,
                        astrologerNetEarnings: netAstrologerShare
                    }
                },
                { new: true }
            );

            if (updatedSessionDoc) {
                session.astrologerEarnings = updatedSessionDoc.astrologerEarnings;
                (session as any).astrologerNetEarnings = (updatedSessionDoc as any).astrologerNetEarnings;
            }

            // ATOMIC STEP: Create Transaction Record
            const transaction = new Transaction({
                fromUser: session.userId,
                toAstrologer: astrologer._id,
                amount: freeChatRate, // Gross amount mapping
                type: 'credit', // Mark as credit so it doesn't appear as a debit to the user, or it appears as a payout
                status: 'success',
                description: `Free Chat System Payment: ${session.sessionId} (Base: ₹${freeChatRate}, Astro: ₹${astrologerShare})`
            });
            await transaction.save();

            console.log(`[ChatService] Free Chat Payout processed: Base=₹${freeChatRate}, AstroEarns=₹${astrologerShare}`);
        } catch (error: any) {
            console.error('[ChatService] Free Chat Payout failed:', error?.message || error);
        }
    }

    /**
     * Save a message to the database
     */
    async saveMessage(
        sessionId: string,
        senderId: string,
        senderType: 'user' | 'astrologer',
        text: string,
        type: 'text' | 'image' | 'file' | 'profile_data' = 'text',
        fileData?: { url: string; name?: string; size?: number },
        replyToId?: string
    ): Promise<any> {
        const message = new ChatMessage({
            sessionId,
            senderId,
            senderType,
            text,
            type,
            fileUrl: fileData?.url,
            fileName: fileData?.name,
            fileSize: fileData?.size,
            replyToId: replyToId ? new mongoose.Types.ObjectId(replyToId) : undefined,
            timestamp: new Date(),
            status: 'sent'
        });
        return await message.save();
    }

    /**
     * Update message status (e.g. delivered, read)
     */
    async updateMessageStatus(messageId: string, status: 'delivered' | 'read'): Promise<void> {
        await ChatMessage.findByIdAndUpdate(messageId, { status });
    }

    /**
     * Get messages for a session
     */
    async getMessages(sessionId: string): Promise<any[]> {
        return ChatMessage.find({ sessionId }).sort({ timestamp: 1 }).populate('replyToId');
    }

    /**
     * Get a single message by ID (for populating replyTo)
     */
    async getMessage(messageId: string): Promise<any> {
        return ChatMessage.findById(messageId);
    }

    /**
     * Get ALL messages between a user-astrologer pair (across all sessions)
     * Supports pagination for "load earlier" functionality
     */
    async getConversation(
        userId: string,
        astrologerId: string,
        limit: number = 50,
        before?: Date
    ): Promise<{ messages: any[]; hasMore: boolean }> {
        // Find all sessions between this user and astrologer
        const sessions = await ChatSession.find({
            userId,
            astrologerId,
            status: { $in: ['ACTIVE', 'ENDED'] }
        }).select('sessionId');

        const sessionIds = sessions.map(s => s.sessionId);

        if (sessionIds.length === 0) {
            return { messages: [], hasMore: false };
        }

        // Build query
        const query: any = { sessionId: { $in: sessionIds } };
        if (before) {
            query.timestamp = { $lt: before };
        }

        // Get messages (fetch limit + 1 to check if there are more)
        const messages = await ChatMessage.find(query)
            .sort({ timestamp: -1 }) // Newest first for "load earlier"
            .limit(limit + 1)
            .populate('replyToId');

        const hasMore = messages.length > limit;
        const resultMessages = hasMore ? messages.slice(0, limit) : messages;

        // Reverse to get chronological order (oldest first)
        return {
            messages: resultMessages.reverse(),
            hasMore
        };
    }

    /**
     * Submit a review for a session
     */
    async submitReview(
        sessionId: string,
        userId: string,
        rating: number,
        reviewText?: string
    ): Promise<void> {
        const session = await ChatSession.findOne({ sessionId });
        if (!session) {
            throw new Error('Session not found');
        }

        if (session.userId.toString() !== userId) {
            throw new Error('Unauthorized');
        }

        if (session.status !== 'ENDED') {
            throw new Error('Can only review ended sessions');
        }

        // Check if already reviewed
        const existingReview = await ChatReview.findOne({ sessionId });
        if (existingReview) {
            throw new Error('Session already reviewed');
        }

        // Create review
        const review = new ChatReview({
            sessionId,
            userId,
            astrologerId: session.astrologerId,
            rating,
            reviewText,
            status: 'pending' // Always start as pending
        });
        await review.save();

        console.log(`[ChatService] Review submitted for session: ${sessionId} (pending admin approval)`);
    }

    /**
     * Update astrologer's average rating based on approved reviews
     * Ensures summary fields (reviewsCount, totalRatingSum) are in sync
     */
    async updateAstrologerAverageRating(astrologerId: string | mongoose.Types.ObjectId): Promise<void> {
        if (!astrologerId) {
            console.warn('[ChatService] updateAstrologerAverageRating called with no astrologerId');
            return;
        }

        // Include both explicitly approved reviews and legacy reviews (those without a status field)
        const approvedReviews = await ChatReview.find({ 
            astrologerId, 
            $or: [
                { status: 'approved' },
                { status: { $exists: false } }
            ]
        });

        if (approvedReviews.length === 0) {
            await Astrologer.findByIdAndUpdate(astrologerId, {
                rating: 0,
                reviewsCount: 0,
                totalRatingSum: 0
            });
            return;
        }

        const totalRatingSum = approvedReviews.reduce((sum, r) => sum + r.rating, 0);
        const reviewsCount = approvedReviews.length;
        const avgRating = totalRatingSum / reviewsCount;

        await Astrologer.findByIdAndUpdate(astrologerId, {
            rating: Math.round(avgRating * 10) / 10,
            reviewsCount: reviewsCount,
            totalRatingSum: totalRatingSum
        });

        console.log(`[ChatService] Updated ratings for astrologer ${astrologerId}: ${(Math.round(avgRating * 10) / 10).toFixed(1)} (${reviewsCount} approved reviews)`);
    }

    /**
     * Handle participant disconnect
     * Chats are NEVER force-ended on disconnect — only wallet depletion, free trial expiry,
     * or explicit user/astrologer end can terminate a session.
     */
    async handleDisconnect(userId: string, isAstrologer: boolean): Promise<void> {
        const userType = isAstrologer ? 'astrologer' : 'user';
        console.log(`[ChatService] ${userType} disconnected: ${userId}`);

        // Update lastSeen on any ACTIVE session so we have an audit trail
        const session = isAstrologer
            ? await ChatSession.findOne({ astrologerId: userId, status: 'ACTIVE' })
            : await ChatSession.findOne({ userId: userId, status: 'ACTIVE' });

        if (session) {
            const updateField = isAstrologer ? { astrologerLastSeen: new Date() } : { userLastSeen: new Date() };
            await ChatSession.updateOne({ sessionId: session.sessionId }, { $set: updateField });
            console.log(`[ChatService] Updated lastSeen for ${userType} in session: ${session.sessionId}. Chat continues (wallet-only ending).`);
            return;
        }

        // PENDING/ONLINE session: astrologer disconnected.
        if (isAstrologer) {
            const pendingSession = await ChatSession.findOne({ astrologerId: userId, status: 'PENDING' });
            
            // 1. PENDING Request Grace Window (10 seconds)
            if (pendingSession) {
                console.log(`[ChatService] Astrologer ${userId} disconnected with PENDING request ${pendingSession.sessionId}. Starting 10s grace window.`);

                // Immediately cancel the auto-reject timeout so it cannot race with the grace
                // window. Previously this clearTimeout was inside the 10s callback, which meant
                // the 30s request timeout could fire before we had a chance to cancel it —
                // causing a spurious "missed chat" notification on every late disconnect.
                const pendingTimeout = this.requestTimeouts.get(pendingSession.sessionId);
                if (pendingTimeout) {
                    clearTimeout(pendingTimeout);
                    this.requestTimeouts.delete(pendingSession.sessionId);
                }

                setTimeout(async () => {
                    try {
                        // Re-check: has the session already been resolved during the grace window?
                        const stillPending = await ChatSession.findOne({ sessionId: pendingSession.sessionId, status: 'PENDING' });
                        if (!stillPending) return;

                        // Re-check: did the astrologer reconnect?
                        const room = this.io?.sockets.adapter.rooms.get(`astrologer:${userId}`);
                        if (room && room.size > 0) return;

                        // Astrologer is still offline — cancel the request
                        console.log(`[ChatService] Grace window expired: astrologer ${userId} still offline. Cancelling PENDING request ${pendingSession.sessionId}.`);

                        const cancelled = await ChatSession.findOneAndUpdate(
                            { sessionId: pendingSession.sessionId, status: 'PENDING' },
                            { $set: { status: 'ENDED', endReason: 'ASTROLOGER_OFFLINE_DURING_REQUEST' } }
                        );

                        if (cancelled && this.io) {
                            this.io.to(`user:${pendingSession.userId}`).emit('CHAT_REJECTED', {
                                sessionId: pendingSession.sessionId,
                                reason: 'Astrologer went offline'
                            });
                        }
                    } catch (graceErr) {
                        console.error(`[ChatService] Error in disconnect grace window for ${pendingSession.sessionId}:`, graceErr);
                    }
                }, 10000);
            }

            // 2. Global "Zombie Detection"
            // If an astrologer is marked ONLINE but disconnects their socket, 
            // they might have uninstalled the app or lost connection forever.
            // We wait for a grace period; if they don't reconnect and aren't in an ACTIVE chat, we mark them offline.
            const astrologer = await Astrologer.findById(userId);
            if (astrologer && astrologer.isOnline) {
                const isManual = !!astrologer.isManualOverride;
                const hasFCM = !!astrologer.fcmToken;
                
                // --- PERSISTENCE LOGIC ---
                // If it's a manual override, they stay online INDEFINITELY until they manually toggle off.
                // This satisfies the requirement: "he will be online until he get do manual offline".
                if (isManual) {
                    console.log(`[ChatService] Manual Online Astrologer ${userId} disconnected. PERSISTING online status until manual logout.`);
                    return;
                }

                // For Auto-online (schedule based) or missing manual flag:
                // We use a grace period (15m if FCM exists, 5m if not).
                let gracePeriodMinutes = hasFCM ? 15 : 5;

                console.log(`[ChatService] Auto-Online astrologer ${userId} disconnected. (hasFCM=${hasFCM}). Starting ${gracePeriodMinutes}-minute Zombie Detection timer.`);
                
                setTimeout(async () => {
                    try {
                        // Re-fetch current state
                        const currentAstro = await Astrologer.findById(userId);
                        if (!currentAstro || !currentAstro.isOnline || currentAstro.isManualOverride) return;

                        // Check if they reconnected
                        const roomName = `astrologer:${userId}`;
                        const room = this.io?.sockets.adapter.rooms.get(roomName);
                        if (room && room.size > 0) {
                            console.log(`[ChatService] Zombie Detection: Astrologer ${userId} reconnected. Keeping online.`);
                            return;
                        }

                        // Check if they are in an ACTIVE session
                        const activeSession = await ChatSession.findOne({ astrologerId: userId, status: 'ACTIVE' });
                        if (activeSession) {
                            console.log(`[ChatService] Zombie Detection: Astrologer ${userId} still disconnected but in ACTIVE chat. Preserving online status.`);
                            return;
                        }

                        // If still disconnected and no active session, mark offline
                        console.log(`[ChatService] Zombie Detection: Astrologer ${userId} persistently disconnected for ${gracePeriodMinutes}m. Marking OFFLINE.`);
                        await Astrologer.findByIdAndUpdate(userId, { $set: { isOnline: false } });
                        await availabilityService.recordOffline(userId);

                        if (this.io) {
                            this.io.to(roomName).emit('ASTROLOGER_STATUS_UPDATED', { isOnline: false });
                        }
                    } catch (zombieErr) {
                        console.error(`[ChatService] Error in Zombie Detection for ${userId}:`, zombieErr);
                    }
                }, gracePeriodMinutes * 60 * 1000);
            }
        }
    }

    /**
     * Handle participant reconnect — update lastSeen and re-deliver missed messages
     */
    async handleReconnect(userId: string, isAstrologer: boolean): Promise<void> {
        const userType = isAstrologer ? 'astrologer' : 'user';
        console.log(`[ChatService] ${userType} reconnected: ${userId}`);

        // Find active session for this user
        const session = isAstrologer
            ? await ChatSession.findOne({ astrologerId: userId, status: 'ACTIVE' })
            : await ChatSession.findOne({ userId: userId, status: 'ACTIVE' });

        if (!session) {
            // No ACTIVE session. Check if there is a PENDING request waiting for this astrologer.
            // This handles the reconnect-after-disconnect scenario: the astrologer's socket died,
            // the disconnect handler started the grace window, and now they are back online.
            if (isAstrologer && this.io) {
                const pendingSession = await ChatSession.findOne({ astrologerId: userId, status: 'PENDING' });
                if (pendingSession) {
                    const elapsed = Date.now() - pendingSession.createdAt.getTime();
                    const remaining = this.REQUEST_TIMEOUT_MS - elapsed;
                    if (remaining > 5000) {
                        const pendingUser = await User.findById(pendingSession.userId);
                        const roomName = `astrologer:${userId}`;
                        this.io.to(roomName).emit('CHAT_REQUEST', {
                            sessionId: pendingSession.sessionId,
                            userId: pendingSession.userId.toString(),
                            userName: pendingUser?.name || 'User',
                            userMobile: (pendingUser as any)?.mobile,
                            intakeDetails: pendingSession.intakeDetails,
                            ratePerMinute: pendingSession.ratePerMinute,
                            createdAt: pendingSession.createdAt.toISOString(),
                            isRedelivered: true,
                            remainingSeconds: Math.floor(remaining / 1000)
                        });
                        console.log(`[ChatService] Re-delivered PENDING request ${pendingSession.sessionId} to reconnected astrologer ${userId} (${Math.floor(remaining / 1000)}s remaining)`);
                    } else {
                        console.log(`[ChatService] PENDING request ${pendingSession.sessionId} has only ${remaining}ms remaining — not re-delivering, timeout will fire.`);
                    }
                }
            }
            return;
        }

        // Update last seen in DB
        const updateField = isAstrologer ? { astrologerLastSeen: new Date() } : { userLastSeen: new Date() };
        await ChatSession.updateOne({ sessionId: session.sessionId }, { $set: updateField });

        // Re-deliver missed messages on reconnect
        try {
            // Get messages from the last 10 minutes that might have been missed
            const tenMinutesAgo = new Date(Date.now() - 600000);
            const missedMessages = await ChatMessage.find({
                sessionId: session.sessionId,
                timestamp: { $gte: tenMinutesAgo },
                senderType: { $ne: userType } // Only messages from the OTHER party
            }).sort({ timestamp: 1 }).limit(50);

            if (missedMessages.length > 0 && this.io) {
                const roomName = `${userType}:${userId}`;
                console.log(`[ChatService] Re-delivering ${missedMessages.length} missed messages to ${roomName}`);

                for (const msg of missedMessages) {
                    this.io.to(roomName).emit('RECEIVE_MESSAGE', {
                        sessionId: session.sessionId,
                        messageId: msg._id.toString(),
                        senderId: msg.senderId?.toString(),
                        senderType: msg.senderType,
                        text: msg.text,
                        type: msg.type,
                        fileUrl: msg.fileUrl,
                        fileName: msg.fileName,
                        fileSize: msg.fileSize,
                        timestamp: msg.timestamp.toISOString(),
                        status: msg.status || 'sent',
                        isRedelivered: true // Flag so frontend can deduplicate
                    });
                }
            }
        } catch (redeliveryError) {
            console.error(`[ChatService] Error re-delivering messages:`, redeliveryError);
        }
    }

    /**
     * Resume billing timers for all ACTIVE sessions
     * Called by scheduler to handle server restarts
     */
    async resumeActiveSessions(): Promise<void> {
        console.log('[ChatService] Resuming active sessions...');
        const activeSessions = await ChatSession.find({ status: 'ACTIVE' });

        for (const session of activeSessions) {
            // Restart billing timer if not running
            if (!session.isFreeTrialSession && !this.billingTimers.has(session.sessionId)) {
                console.log(`[ChatService] Resuming billing timer for session: ${session.sessionId}`);
                
                // Calculate elapsed time since last bill (or start)
                const lastBillTime = session.lastBilledAt || session.startTime || session.createdAt;
                const elapsedMs = Date.now() - lastBillTime.getTime();
                
                if (elapsedMs >= 60000) {
                    const missedCycles = Math.floor(elapsedMs / 60000);
                    console.log(`[ChatService] Missed ${missedCycles} billing cycles for session: ${session.sessionId} during delay/restart.`);
                    
                    // Immediately process one cycle and schedule the next one correctly
                    // For massive gaps, we just process one and reset the timer to prevent instant depletion
                    this.processBillingCycle(session.sessionId);
                    this.startBillingTimer(session.sessionId);
                } else {
                    // Start timer for the remaining time of the current cycle
                    const remainingMs = 60000 - elapsedMs;
                    console.log(`[ChatService] Starting resumed billing timer in ${remainingMs}ms for session: ${session.sessionId}`);
                    
                    const timeout = setTimeout(() => {
                        this.processBillingCycle(session.sessionId);
                        this.startBillingTimer(session.sessionId);
                    }, remainingMs);
                    
                    this.billingTimers.set(session.sessionId, timeout);
                }
            }

            // Also check for free trial timers
            if (session.isFreeTrialSession && !this.freeTrialTimers.has(session.sessionId)) {
                const startTime = session.startTime || session.createdAt;
                const elapsedSeconds = Math.floor((Date.now() - startTime.getTime()) / 1000);
                const remainingSeconds = (session.freeTrialDurationSeconds || 120) - elapsedSeconds;

                if (remainingSeconds > 0) {
                    console.log(`[ChatService] Resuming free trial timer for session: ${session.sessionId} (${remainingSeconds}s remaining)`);
                    this.startFreeTrialTimer(session.sessionId, remainingSeconds);
                } else {
                    console.log(`[ChatService] Free trial expired during downtime for session: ${session.sessionId}. Ending.`);
                    await this.endChat(session.sessionId, 'FREE_TRIAL_ENDED'); // Accurate reason
                }
            }
        }
    }

    /**
     * Periodic verification of all active sessions to ensure billing continuity.
     * Prevents cases where a timer might have been silently dropped.
     */
    async verifyBillingConsistency(): Promise<void> {
        const activeSessions = await ChatSession.find({ 
            status: 'ACTIVE', 
            isFreeTrialSession: { $ne: true } 
        });

        for (const session of activeSessions) {
            const lastBillTime = session.lastBilledAt || session.startTime || session.createdAt;
            const elapsedMs = Date.now() - lastBillTime.getTime();

            // If it's been more than 75 seconds (60s + 15s buffer), the timer is likely dead
            if (elapsedMs > 75000 && !this.billingTimers.has(session.sessionId)) {
                console.warn(`[ChatService] !! Billing Drift Alert !! Session ${session.sessionId} is active but has no timer. Manually triggering cycle.`);
                this.processBillingCycle(session.sessionId);
                this.startBillingTimer(session.sessionId);
            }
        }
    }

    /**
     * Cleanup sessions that have been disconnected for too long
     * Called by scheduler every minute
     */
    async cleanupStaleSessions(): Promise<void> {
        // NOTE: ACTIVE sessions should NEVER be force-ended on disconnect per requirements.
        // We only clean up stale PENDING requests here.
        // Billing timers handle wallet depletion and explicit session endings.

        // Clean up stale PENDING requests older than REQUEST_TIMEOUT_MS + 5s buffer.
        // Must be > REQUEST_TIMEOUT_MS so the in-memory timer fires first.
        const requestTimeoutCutoff = new Date(Date.now() - (this.REQUEST_TIMEOUT_MS + 5000));
        const staleRequests = await ChatSession.find({
            status: 'PENDING',
            createdAt: { $lt: requestTimeoutCutoff }
        });

        for (const request of staleRequests) {
            console.log(`[ChatService] Cleaning up stale pending request: ${request.sessionId}`);
            await this.timeoutChatRequest(request.sessionId);
        }

    }

    /**
     * Get session by ID
     */
    async getSession(sessionId: string): Promise<IChatSession | null> {
        return ChatSession.findOne({ sessionId });
    }

    /**
     * Get active session for a user
     */
    async getActiveSessionForUser(userId: string): Promise<IChatSession | null> {
        return ChatSession.findOne({
            userId,
            status: { $in: ['ACTIVE', 'PENDING'] }
        })
            .sort({ createdAt: -1 }) // Get the most recent one
            .populate('astrologerId', 'firstName lastName');
    }

    /**
     * Get active session for an astrologer
     */
    async getActiveSessionForAstrologer(astrologerId: string): Promise<IChatSession | null> {
        return ChatSession.findOne({ astrologerId, status: 'ACTIVE' })
            .populate('userId', 'name')
            .select('+sharedProfiles'); // Ensure sharedProfiles is selected if it was excluded by default (though it's not)
    }

    /**
     * Create a continue chat request
     * Called when user wants to continue a recently ended chat session
     */
    async createContinueChatRequest(
        userId: string,
        astrologerId: string,
        previousSessionId: string
    ): Promise<IChatSession> {
        // Validate user exists and has sufficient balance
        const user = await User.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        // Get astrologer and validate
        const astrologer = await Astrologer.findById(astrologerId);
        if (!astrologer) {
            throw new Error('Astrologer not found');
        }

        if (!astrologer.isOnline) {
            throw new Error('Astrologer is offline');
        }

        if (astrologer.status !== 'approved') {
            throw new Error('Astrologer is not approved');
        }

        // Check astrologer is not busy
        if (astrologer.isBusy) {
            throw new Error('Astrologer is busy with another chat');
        }

        const ratePerMinute = astrologer.pricePerMin;
        const minBalanceRequired = ratePerMinute * 5; // 5 minutes minimum

        // Check if user has enough balance for at least 5 minutes
        if (user.walletBalance < minBalanceRequired) {
            throw new Error(`Insufficient balance. Minimum ₹${minBalanceRequired} required for 5 minutes.`);
        }

        // Verify the previous session exists and is ended
        const previousSession = await ChatSession.findOne({ sessionId: previousSessionId });
        if (!previousSession) {
            throw new Error('Previous session not found');
        }
        if (previousSession.status !== 'ENDED') {
            throw new Error('Previous session is not ended');
        }
        if (previousSession.userId.toString() !== userId) {
            throw new Error('Previous session does not belong to this user');
        }
        if (previousSession.astrologerId.toString() !== astrologerId) {
            throw new Error('Previous session is with a different astrologer');
        }

        // Check for existing pending request from this user
        const existingRequest = await ChatSession.findOne({
            userId,
            status: 'PENDING'
        });
        if (existingRequest) {
            throw new Error('You already have a pending chat request');
        }

        // Create new chat session marked as continuation (NOT a free trial)
        const session = new ChatSession({
            userId,
            astrologerId,
            ratePerMinute,
            status: 'PENDING',
            isContinuation: true,
            previousSessionId,
            intakeDetails: previousSession.intakeDetails, // Carry forward intake details
            isFreeTrialSession: false, // Explicitly NOT a free trial
        });

        await session.save();

        console.log(`[ChatService] Continue chat request created: ${session.sessionId} (continues ${previousSessionId})`);

        // Set auto-reject timeout
        const timeout = setTimeout(async () => {
            await this.timeoutChatRequest(session.sessionId);
        }, this.REQUEST_TIMEOUT_MS);
        this.requestTimeouts.set(session.sessionId, timeout);

        // Send FCM wake-up + socket notification to astrologer
        if (this.io) {
            const roomName = `astrologer:${astrologerId}`;

            const requestPayload = {
                sessionId: session.sessionId,
                userId: user._id.toString(),
                userName: user.name || 'User',
                previousSessionId,
                ratePerMinute,
                userMobile: user.mobile,
                intakeDetails: previousSession.intakeDetails
            };

            // FCM wake-up (best-effort)
            notificationService.sendHighPriorityChatRequest(astrologerId, {
                sessionId: session.sessionId,
                userId: user._id.toString(),
                userName: user.name || 'User',
                userMobile: user.mobile,
                ratePerMinute,
                intakeDetails: previousSession.intakeDetails,
            }).catch(e => console.error('[ChatService] FCM continue chat request send failed:', e));

            // Socket emit — fire and forget, no ACK, no retry
            this.io.to(roomName).emit('CONTINUE_CHAT_REQUEST', requestPayload);
            console.log(`[ChatService] CONTINUE_CHAT_REQUEST sent to room: ${roomName}`);
        }

        return session;
    }



    /**
     * Share a profile in the chat session
     */
    async shareProfile(sessionId: string, profile: any, text?: string): Promise<void> {
        const session = await ChatSession.findOne({ sessionId });
        if (!session) return;

        // Add to sharedProfiles list
        await ChatSession.updateOne(
            { sessionId },
            { $push: { sharedProfiles: profile } }
        );
        console.log(`[ChatService] Profile shared in session ${sessionId}`);

        // Create a ChatMessage in DB so it's persisted in history and allows status updates
        const ChatMessageModel = mongoose.model('ChatMessage');
        const chatMsg = new ChatMessageModel({
            sessionId,
            senderId: session.userId,
            senderType: 'user',
            text: text || (profile.name ? `Shared Profile: ${profile.name}` : 'Shared Profile'),
            type: 'profile_data',
            status: 'sent',
            timestamp: new Date()
        });
        await chatMsg.save();

        // Broadcast to both parties so they receive it in real-time
        // Emitting 'RECEIVE_MESSAGE' ensures the sender's UI updates from 'pending' to 'sent'
        if (this.io) {
            const payload = {
                messageId: chatMsg._id,
                sessionId,
                text: chatMsg.text,
                senderType: 'user',
                type: 'profile_data',
                timestamp: chatMsg.timestamp,
                profile: profile // Attach profile data for rich rendering
            };

            this.io.to(`user:${session.userId}`).emit('RECEIVE_MESSAGE', payload);
            this.io.to(`astrologer:${session.astrologerId}`).emit('RECEIVE_MESSAGE', payload);
            
            // Still emit legacy 'SHARE_PROFILE' for compatibility with any state listeners
            this.io.to(`user:${session.userId}`).emit('SHARE_PROFILE', profile);
            this.io.to(`astrologer:${session.astrologerId}`).emit('SHARE_PROFILE', profile);
        }
    }
}

// Export singleton instance
export const chatService = new ChatService();
export default chatService;
