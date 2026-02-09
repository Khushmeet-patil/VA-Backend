import { Server as SocketIOServer, Socket } from 'socket.io';
import mongoose from 'mongoose';
import ChatSession, { IChatSession } from '../models/ChatSession';
import ChatMessage from '../models/ChatMessage';
import ChatReview from '../models/ChatReview';
import User from '../models/User';
import Astrologer from '../models/Astrologer';
import Transaction from '../models/Transaction';
import notificationService from './notificationService';

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
    private io: SocketIOServer | null = null;

    // Map of active billing timers: sessionId -> NodeJS.Timeout
    private billingTimers: Map<string, NodeJS.Timeout> = new Map();

    // Map of disconnect grace timers: sessionId -> NodeJS.Timeout
    private gracePeriodTimers: Map<string, NodeJS.Timeout> = new Map();

    // Grace period for disconnections (15 seconds)
    private readonly GRACE_PERIOD_MS = 15000;

    // Billing cycle interval (60 seconds)
    private readonly BILLING_INTERVAL_MS = 60000;

    // Request timeout (30 seconds - auto-reject if not accepted)
    private readonly REQUEST_TIMEOUT_MS = 30000;

    // Map of request timeout timers: sessionId -> NodeJS.Timeout
    private requestTimeouts: Map<string, NodeJS.Timeout> = new Map();

    // Map of free trial timers: sessionId -> NodeJS.Timeout
    private freeTrialTimers: Map<string, NodeJS.Timeout> = new Map();

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

        // Self-healing: Check if the "busy" state is actually due to an old/stuck session with THIS user
        if (astrologer.isBusy) {
            if (astrologer.activeSessionId) {
                const blockingSession = await ChatSession.findOne({ sessionId: astrologer.activeSessionId });

                // If the blocking session exists and belongs to THIS user, end it and proceed
                if (blockingSession && blockingSession.userId.toString() === userId) {
                    console.log(`[ChatService] Found stuck session ${blockingSession.sessionId} for user ${userId}. Auto-ending it.`);
                    try {
                        // Force end the old session
                        await this.endChat(blockingSession.sessionId, 'USER_END');

                        // Re-fetch astrologer to ensure state is clear
                        const refreshedAstrologer = await Astrologer.findById(astrologerId);
                        if (refreshedAstrologer && refreshedAstrologer.isBusy) {
                            // Should not happen if endChat works, but safety check
                            throw new Error('Astrologer is still busy after cleanup. Please try again.');
                        }
                    } catch (err) {
                        console.error('[ChatService] Failed to clean up stuck session:', err);
                        // Continue anyway if possible? No, safer to error if cleanup failed
                        throw new Error('Failed to close previous session. Please try again.');
                    }
                } else {
                    throw new Error('Astrologer is busy with another chat');
                }
            } else {
                // isBusy is true but no activeSessionId? Inconsistent state.
                // We should probably clear it, but safer to block for now unless we are sure.
                // Let's assume it's a valid busy state with missing ID (shouldn't happen).
                throw new Error('Astrologer is busy with another call');
            }
        }

        const ratePerMinute = astrologer.pricePerMin;

        // Check if user is eligible for free trial (first-time user)
        const isEligibleForFreeTrial = !user.hasUsedFreeTrial;

        // Check if user has enough balance for at least 1 minute (skip for free trial users)
        if (!isEligibleForFreeTrial && user.walletBalance < ratePerMinute) {
            throw new Error(`Insufficient balance. Minimum ₹${ratePerMinute} required.`);
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

        // Emit CHAT_REQUEST to astrologer
        if (this.io) {
            const roomName = `astrologer:${astrologerId}`;
            const room = this.io.sockets.adapter.rooms.get(roomName);
            const roomSize = room ? room.size : 0;
            console.log(`[ChatService] Emitting CHAT_REQUEST to room: ${roomName}, connected sockets in room: ${roomSize}`);

            if (roomSize === 0) {
                console.warn(`[ChatService] WARNING: No sockets in room ${roomName}. Astrologer may be disconnected.`);
            }

            this.io.to(roomName).emit('CHAT_REQUEST', {
                sessionId: session.sessionId,
                userId: user._id,
                userName: user.name || 'User',
                intakeDetails,
                ratePerMinute,
                userMobile: user.mobile
            });
            console.log(`[ChatService] CHAT_REQUEST emitted successfully`);
        } else {
            console.error(`[ChatService] ERROR: Socket.IO instance not initialized!`);
        }

        // Send high-priority FCM notification to astrologer
        // This ensures the astrologer receives the request even if app is killed/background
        try {
            const fcmSuccess = await notificationService.sendHighPriorityChatRequest(astrologerId, {
                sessionId: session.sessionId,
                userId: userId,
                userName: user.name || 'User',
                userMobile: user.mobile,
                ratePerMinute,
                intakeDetails,
            });

            if (fcmSuccess) {
                console.log(`[ChatService] High-priority FCM sent to astrologer ${astrologerId}`);
            } else {
                console.warn(`[ChatService] Failed to send high-priority FCM to astrologer ${astrologerId}`);
            }
        } catch (fcmError) {
            // Don't fail the request if FCM fails - socket might still work
            console.error(`[ChatService] FCM notification error:`, fcmError);
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

        if (!session.isFreeTrialSession && user.walletBalance < session.ratePerMinute) {
            // Atomic update to fail
            await ChatSession.findOneAndUpdate(
                { sessionId, status: 'PENDING' },
                { status: 'ENDED', endReason: 'INSUFFICIENT_BALANCE' }
            );
            throw new Error('User has insufficient balance');
        }

        // Lock astrologer (prevent concurrent chats)
        const astrologer = await Astrologer.findById(session.astrologerId);
        if (!astrologer) {
            throw new Error('Astrologer not found');
        }

        if (astrologer.isBusy) {
            await ChatSession.findOneAndUpdate(
                { sessionId, status: 'PENDING' },
                { status: 'REJECTED' }
            );
            throw new Error('Already in another chat');
        }

        // Update astrologer status first
        astrologer.isBusy = true;
        astrologer.activeSessionId = sessionId;
        await astrologer.save();

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
            // The session is no longer PENDING (likely cancelled by user).
            // Revert astrologer state
            astrologer.isBusy = false;
            astrologer.activeSessionId = undefined;
            await astrologer.save();

            throw new Error('Chat request was cancelled or expired');
        }

        // Use the updated session object from here
        session = updatedSession;

        // Start appropriate timer based on session type
        if (session.isFreeTrialSession) {
            // Free trial - start countdown timer instead of billing
            this.startFreeTrialTimer(sessionId, session.freeTrialDurationSeconds || 120);
            console.log(`[ChatService] Chat accepted - FREE TRIAL STARTED: ${sessionId}`);
        } else {
            // Regular paid session - start billing timer immediately
            this.startBillingTimer(sessionId);
            console.log(`[ChatService] Chat accepted and BILLING STARTED: ${sessionId}`);
        }

        // Emit CHAT_STARTED to both user and astrologer with startTime
        if (this.io) {
            this.io.to(`user:${session.userId}`).emit('CHAT_STARTED', {
                sessionId,
                startTime: session.startTime,
                ratePerMinute: session.ratePerMinute,
                astrologerId: session.astrologerId,
                astrologerName: `${astrologer.firstName} ${astrologer.lastName}`,
                status: 'ACTIVE',
                intakeDetails: session.intakeDetails, // Pass for auto-message
                sharedProfiles: session.sharedProfiles, // Pass shared profiles to frontend
                // Free trial info
                isFreeTrialSession: session.isFreeTrialSession || false,
                freeTrialDurationSeconds: session.freeTrialDurationSeconds || 0,
            });

            this.io.to(`astrologer:${session.astrologerId}`).emit('CHAT_STARTED', {
                sessionId,
                startTime: session.startTime,
                ratePerMinute: session.ratePerMinute,
                userId: session.userId,
                userName: user.name || 'User',
                status: 'ACTIVE',
                // Free trial info for astrologer
                isFreeTrialSession: session.isFreeTrialSession || false,
                freeTrialDurationSeconds: session.freeTrialDurationSeconds || 0,
            });

            // Also emit TIMER_STARTED immediately
            this.io.to(`user:${session.userId}`).emit('TIMER_STARTED', {
                sessionId,
                startTime: session.startTime
            });
            this.io.to(`astrologer:${session.astrologerId}`).emit('TIMER_STARTED', {
                sessionId,
                startTime: session.startTime
            });
        }

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
            console.log(`[ChatService] Both participants joined. STARTING BILLING for: ${sessionId}`);

            session.startTime = new Date();
            await session.save();

            this.startBillingTimer(sessionId);

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
        await session.save();

        console.log(`[ChatService] Chat rejected: ${sessionId}`);

        // Emit CHAT_REJECTED to user
        if (this.io) {
            this.io.to(`user:${session.userId}`).emit('CHAT_REJECTED', {
                sessionId,
                reason: 'Astrologer declined the request'
            });
        }
    }

    /**
     * Auto-timeout a chat request that wasn't responded to
     */
    private async timeoutChatRequest(sessionId: string): Promise<void> {
        // Use atomic operation to handle race condition
        const session = await ChatSession.findOneAndUpdate(
            { sessionId, status: 'PENDING' },
            { status: 'ENDED', endReason: 'TIMEOUT' },
            { new: true }
        );

        if (!session) {
            // Session was already accepted/rejected/cancelled
            return;
        }

        this.requestTimeouts.delete(sessionId);

        console.log(`[ChatService] Chat request timed out: ${sessionId}`);

        // Emit CHAT_TIMEOUT to both parties
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

        // Increment missedChats for astrologer
        await Astrologer.findByIdAndUpdate(session.astrologerId, { $inc: { missedChats: 1 } });
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
                endReason: 'USER_END'
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

        // Emit CHAT_CANCELLED to astrologer
        if (this.io) {
            this.io.to(`astrologer:${session.astrologerId}`).emit('CHAT_CANCELLED', {
                sessionId,
                reason: 'User cancelled the request'
            });
        }

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
        this.clearGracePeriod(sessionId);

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
                    const success = await this.processPayment(
                        session,
                        user,
                        astrologer,
                        remainingToCharge,
                        `Chat session: ${sessionId} - Final Partial Settlement`
                    );

                    if (!success) {
                        console.warn(`[ChatService] Failed to capture final partial amount ${remainingToCharge} from user ${user._id}`);
                    }
                }
            }

            // Update totalMinutes
            session.totalMinutes = parseFloat(durationMinutes.toFixed(2));
        } else {
            console.log(`[ChatService] Ended session ${sessionId} before billing started.`);
            // Ensure session.totalMinutes is set to 0 if not started
            session.totalMinutes = 0;
        }
        // -----------------------------

        // Update session
        session.status = 'ENDED';
        session.endTime = new Date();
        session.endReason = endReason;
        // Update totalMinutes to reflect the actual duration (e.g. 3.5 mins) or keep as "billed minutes count"?
        // Let's store actual duration in minutes (float) for analytics, but TS model might expect number.
        // If totalMinutes is used for "number of full minutes charged", we might leave it or update it.
        // Let's update it to round up to nearest minute for display, or keeping it as is from processPayment?
        // processPayment increments it. If we ran 3m 30s, processPayment ran 3 times. totalMinutes=3.
        // It's better to store exact duration somewhere or just update totalMinutes to be accurate float.
        // Assuming session.totalMinutes is a Number.
        // Total minutes already updated in if/else block above

        await session.save();

        // Unlock astrologer
        const astrologer = await Astrologer.findById(session.astrologerId);
        if (astrologer) {
            astrologer.isBusy = false;
            astrologer.activeSessionId = undefined;
            astrologer.totalChats += 1;
            await astrologer.save();
        }

        console.log(`[ChatService] Chat ended: ${sessionId}, reason: ${endReason}`);

        // Emit CHAT_ENDED to both parties
        if (this.io) {
            const endPayload = {
                sessionId,
                endReason,
                totalMinutes: session.totalMinutes,
                totalAmount: session.totalAmount,
                astrologerEarnings: session.astrologerEarnings
            };

            this.io.to(`user:${session.userId}`).emit('CHAT_ENDED', endPayload);
            this.io.to(`astrologer:${session.astrologerId}`).emit('CHAT_ENDED', endPayload);
        }

        return session;
    }

    /**
     * Start the 60-second billing timer for a session
     */
    private startBillingTimer(sessionId: string): void {
        console.log(`[ChatService] Starting billing timer for: ${sessionId}`);

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
    private startFreeTrialTimer(sessionId: string, durationSeconds: number): void {
        console.log(`[ChatService] Starting FREE TRIAL timer for: ${sessionId}, duration: ${durationSeconds}s`);

        const timer = setTimeout(async () => {
            await this.endFreeTrialSession(sessionId);
        }, durationSeconds * 1000);

        this.freeTrialTimers.set(sessionId, timer);
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

        const user = await User.findById(session.userId);
        const astrologer = await Astrologer.findById(session.astrologerId);

        if (!user || !astrologer) {
            console.error(`[ChatService] Billing error: User or Astrologer not found`);
            await this.endChat(sessionId, 'DISCONNECT');
            return;
        }

        const ratePerMinute = session.ratePerMinute;

        // CRITICAL: Check if user can afford BEFORE deducting (combined wallets)
        const combinedBalance = (user.walletBalance || 0) + (user.bonusBalance || 0);
        if (combinedBalance < ratePerMinute) {
            console.log(`[ChatService] Insufficient combined balance, ending chat: ${sessionId}`);
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
                astrologerEarnings: session.astrologerEarnings
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
        const mongoSession = await mongoose.startSession();
        mongoSession.startTransaction();

        try {
            // Fetch settings for bonus usage and commission
            const SystemSetting = mongoose.model('SystemSetting');
            const bonusUsageSetting = await SystemSetting.findOne({ key: 'bonusUsagePercent' });
            const commissionSetting = await SystemSetting.findOne({ key: 'astrologerCommission' });

            const bonusUsagePercent = bonusUsageSetting?.value ?? 20; // Default 20%
            const astrologerCommission = commissionSetting?.value ?? 40; // Default 40%

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

            // Check if user can afford the real portion
            const realBalance = user.walletBalance || 0;
            if (realDeduction > realBalance) {
                // Not enough in real wallet
                await mongoSession.abortTransaction();
                return { success: false };
            }

            // Deduct from both wallets
            user.bonusBalance = Math.round((bonusBalance - bonusDeduction) * 100) / 100;
            user.walletBalance = Math.round((realBalance - realDeduction) * 100) / 100;
            await user.save({ session: mongoSession });

            // Astrologer earns only from REAL money portion (commission %)
            const astrologerShare = Math.round((realDeduction * astrologerCommission / 100) * 100) / 100;

            // ============ TDS CALCULATION LOGIC ============
            // Fetch TDS settings
            const tdsThresholdSetting = await SystemSetting.findOne({ key: 'tdsThreshold' });
            const tdsRateSetting = await SystemSetting.findOne({ key: 'tdsRate' });
            const tdsThreshold = tdsThresholdSetting?.value ?? 50000; // Default ₹50,000
            const tdsRate = tdsRateSetting?.value ?? 10; // Default 10%

            // Check if financial year needs to be reset (April 1 is new FY)
            const now = new Date();
            const currentFYStart = new Date(now.getFullYear(), 3, 1); // April 1 of current year
            if (now.getMonth() < 3) { // If before April, FY started last year
                currentFYStart.setFullYear(now.getFullYear() - 1);
            }

            // Reset yearly tracking if new financial year
            if (!astrologer.yearlyEarningsStartDate || new Date(astrologer.yearlyEarningsStartDate) < currentFYStart) {
                astrologer.yearlyEarningsStartDate = currentFYStart;
                astrologer.yearlyGrossEarnings = 0;
                astrologer.yearlyTdsDeducted = 0;
                console.log(`[ChatService] Reset FY tracking for astrologer ${astrologer._id}, new FY: ${currentFYStart.toISOString()}`);
            }

            // Track previous yearly earnings to determine if this transaction crosses threshold
            const previousYearlyEarnings = astrologer.yearlyGrossEarnings || 0;
            const newYearlyEarnings = previousYearlyEarnings + astrologerShare;

            let tdsDeduction = 0;
            let netAstrologerShare = astrologerShare;

            if (newYearlyEarnings > tdsThreshold) {
                // TDS is applicable
                if (previousYearlyEarnings <= tdsThreshold) {
                    // Just crossed the threshold - TDS on ENTIRE amount that crossed (including previous earnings)
                    tdsDeduction = Math.round((newYearlyEarnings * tdsRate / 100) * 100) / 100;
                    console.log(`[ChatService] Crossed TDS threshold! Yearly: ₹${newYearlyEarnings}, TDS on full amount: ₹${tdsDeduction}`);
                } else {
                    // Already above threshold - TDS only on this earning
                    tdsDeduction = Math.round((astrologerShare * tdsRate / 100) * 100) / 100;
                    console.log(`[ChatService] TDS on earning: ₹${astrologerShare}, TDS: ₹${tdsDeduction}`);
                }
                netAstrologerShare = Math.round((astrologerShare - tdsDeduction) * 100) / 100;
            }

            // Update astrologer yearly tracking
            astrologer.yearlyGrossEarnings = Math.round(newYearlyEarnings * 100) / 100;
            astrologer.yearlyTdsDeducted = Math.round(((astrologer.yearlyTdsDeducted || 0) + tdsDeduction) * 100) / 100;

            // Add NET earnings (after TDS) to astrologer's withdrawable balance
            astrologer.earnings = Math.round((astrologer.earnings + netAstrologerShare) * 100) / 100;
            await astrologer.save({ session: mongoSession });

            // Update session totals
            if (amountOverride === undefined) {
                session.totalMinutes += 1;
            }
            session.totalAmount = Math.round((session.totalAmount + totalToDeduct) * 100) / 100;
            session.astrologerEarnings = Math.round((session.astrologerEarnings + astrologerShare) * 100) / 100;
            await session.save({ session: mongoSession });

            // Create transaction record with split info
            const transaction = new Transaction({
                fromUser: user._id,
                toAstrologer: astrologer._id,
                amount: totalToDeduct,
                type: 'debit',
                status: 'success',
                description: descriptionOverride || `Chat: ${session.sessionId} - Min ${session.totalMinutes} (Real: ₹${realDeduction}, Bonus: ₹${bonusDeduction}, Astro: ₹${astrologerShare})`
            });
            await transaction.save({ session: mongoSession });

            await mongoSession.commitTransaction();

            console.log(`[ChatService] Billing processed: Real=-${realDeduction}, Bonus=-${bonusDeduction}, AstroEarns=${astrologerShare}`);
            return { success: true, realDeducted: realDeduction, bonusDeducted: bonusDeduction };

        } catch (error) {
            await mongoSession.abortTransaction();
            console.error('[ChatService] Payment transaction failed:', error);
            return { success: false };
        } finally {
            mongoSession.endSession();
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
        type: 'text' | 'image' | 'file' = 'text',
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
            reviewText
        });
        await review.save();

        // Update astrologer's average rating
        const allReviews = await ChatReview.find({ astrologerId: session.astrologerId });
        const avgRating = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;

        await Astrologer.findByIdAndUpdate(session.astrologerId, {
            rating: Math.round(avgRating * 10) / 10 // Round to 1 decimal
        });

        console.log(`[ChatService] Review submitted for session: ${sessionId}`);
    }

    /**
     * Handle user disconnect - NO AUTO-END
     * Chat continues until explicitly ended by user/astrologer or insufficient balance
     */
    handleDisconnect(userId: string, isAstrologer: boolean): void {
        const userType = isAstrologer ? 'astrologer' : 'user';
        console.log(`[ChatService] ${userType} disconnected: ${userId} (chat continues, no auto-end)`);
        // No grace period timer - chat stays active until:
        // 1. User clicks "End Chat"
        // 2. Astrologer clicks "End Chat"
        // 3. User runs out of balance
    }

    /**
     * Handle user reconnect - clear grace period
     */
    handleReconnect(userId: string, isAstrologer: boolean): void {
        const userType = isAstrologer ? 'astrologer' : 'user';
        console.log(`[ChatService] ${userType} reconnected: ${userId}`);

        // Find active session for this user
        const findSession = isAstrologer
            ? ChatSession.findOne({ astrologerId: userId, status: 'ACTIVE' })
            : ChatSession.findOne({ userId, status: 'ACTIVE' });

        findSession.then(session => {
            if (!session) return;
            this.clearGracePeriod(session.sessionId);
        });
    }

    /**
     * Clear grace period timer for a session
     */
    private clearGracePeriod(sessionId: string): void {
        const timer = this.gracePeriodTimers.get(sessionId);
        if (timer) {
            clearTimeout(timer);
            this.gracePeriodTimers.delete(sessionId);
            console.log(`[ChatService] Cleared grace period for: ${sessionId}`);
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

        // Emit CONTINUE_CHAT_REQUEST to astrologer (different event for clarity)
        if (this.io) {
            const roomName = `astrologer:${astrologerId}`;
            const room = this.io.sockets.adapter.rooms.get(roomName);
            const roomSize = room ? room.size : 0;
            console.log(`[ChatService] Emitting CONTINUE_CHAT_REQUEST to room: ${roomName}, connected sockets: ${roomSize}`);

            this.io.to(roomName).emit('CONTINUE_CHAT_REQUEST', {
                sessionId: session.sessionId,
                userId: user._id,
                userName: user.name || 'User',
                previousSessionId,
                ratePerMinute,
                userMobile: user.mobile,
                intakeDetails: previousSession.intakeDetails // Include intake details for the modal
            });
        }

        // Send high-priority FCM notification to astrologer
        // This ensures the astrologer receives the request even if app is killed/background
        try {
            await notificationService.sendHighPriorityChatRequest(astrologerId, {
                sessionId: session.sessionId,
                userId: userId,
                userName: user.name || 'User',
                userMobile: user.mobile,
                ratePerMinute,
                intakeDetails: previousSession.intakeDetails,
            });
            console.log(`[ChatService] High-priority FCM sent for continue chat to astrologer ${astrologerId}`);
        } catch (fcmError) {
            // Don't fail the request if FCM fails - socket might still work
            console.error(`[ChatService] FCM notification error for continue chat:`, fcmError);
        }

        return session;
    }



    /**
     * Share a profile in the chat session
     */
    async shareProfile(sessionId: string, profile: any): Promise<void> {
        const session = await ChatSession.findOne({ sessionId });
        if (!session) return;

        // Add to sharedProfiles list
        await ChatSession.updateOne(
            { sessionId },
            { $push: { sharedProfiles: profile } }
        );
        console.log(`[ChatService] Profile shared in session ${sessionId}`);

        // Broadcast to both parties so they receive it in real-time
        // Emitting 'SHARE_PROFILE' as expected by frontend
        if (this.io) {
            this.io.to(`user:${session.userId}`).emit('SHARE_PROFILE', profile);
            this.io.to(`astrologer:${session.astrologerId}`).emit('SHARE_PROFILE', profile);
        }
    }
}

// Export singleton instance
export const chatService = new ChatService();
export default chatService;
