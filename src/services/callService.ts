import { Server as SocketIOServer } from 'socket.io';
import mongoose from 'mongoose';
import CallSession, { ICallSession } from '../models/CallSession';
import User from '../models/User';
import Astrologer from '../models/Astrologer';
import Transaction from '../models/Transaction';
import notificationService from './notificationService';
import redisClient from '../config/redis';
import { getSettingValue } from '../controllers/systemSettingController';

class CallService {
    public io: SocketIOServer | null = null;

    // Map of call timers: sessionId -> NodeJS.Timeout
    private callTimers: Map<string, NodeJS.Timeout> = new Map();

    // Map of call warning timers: sessionId -> NodeJS.Timeout
    private callWarningTimers: Map<string, NodeJS.Timeout> = new Map();

    // Request timeout — 35 seconds
    private readonly REQUEST_TIMEOUT_MS = 35000;
    private requestTimeouts: Map<string, NodeJS.Timeout> = new Map();

    // Map of active disconnect timers: sessionId -> NodeJS.Timeout
    private activeDisconnectTimers: Map<string, NodeJS.Timeout> = new Map();
    private readonly ACTIVE_DISCONNECT_GRACE_MS = 30000; // 30 seconds

    // Redis session cache TTL
    private readonly SESSION_CACHE_TTL_SECS = 300;

    /**
     * Initialize the call service with Socket.IO instance
     */
    initialize(io: SocketIOServer) {
        this.io = io;
        console.log('[CallService] Initialized');
    }

    /**
     * Create a new call request
     */
    async createCallRequest(
        userId: string,
        astrologerId: string,
        intakeDetails?: object,
        sessionType: 'voice_call' | 'video_call' = 'voice_call'
    ): Promise<ICallSession> {
        const user = await User.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }

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
            throw new Error('ASTROLOGER_BUSY: Astrologer is busy with another session');
        }

        // Check if astrologer has a PENDING request in ChatSession OR CallSession
        const chatSessionModel = mongoose.model('ChatSession');
        const existingChatPending = await chatSessionModel.findOne({
            astrologerId,
            userId: { $ne: userId },
            status: 'PENDING',
        });
        const existingCallPending = await CallSession.findOne({
            astrologerId,
            userId: { $ne: userId },
            status: 'PENDING',
        });

        if (existingChatPending || existingCallPending) {
            throw new Error('ASTROLOGER_BUSY_PENDING: Astrologer is currently handling another incoming request. Please stay tuned.');
        }

        let ratePerMinute = astrologer.pricePerMin;
        if (sessionType === 'voice_call') {
            ratePerMinute = astrologer.voiceCallPricePerMin || astrologer.pricePerMin;
        } else if (sessionType === 'video_call') {
            ratePerMinute = astrologer.videoCallPricePerMin || (astrologer.pricePerMin * 1.5);
        }
        const minTotalBalanceRequired = ratePerMinute * 5;

        // Intro rate eligibility check
        const newUserIntroRate = await getSettingValue('newUserIntroRate', 5);
        const newUserMinRecharge = await getSettingValue('newUserMinRecharge', 15);
        const isEligibleForIntroRate = !user.hasUsedFreeTrial;

        if (isEligibleForIntroRate) {
            ratePerMinute = newUserIntroRate;
            const combinedBalance = user.walletBalance + (user.bonusBalance || 0);
            const fiveMinRequirement = ratePerMinute * 5;
            const finalMinRequired = Math.max(newUserMinRecharge, fiveMinRequirement);
            
            if (combinedBalance < finalMinRequired) {
                throw new Error(`Insufficient balance. Minimum ₹${finalMinRequired} required for 5 minutes of call at intro rate. Current total balance: ₹${combinedBalance.toFixed(2)}`);
            }
        } else {
            const combinedBalance = user.walletBalance + (user.bonusBalance || 0);
            if (combinedBalance < minTotalBalanceRequired) {
                throw new Error(`Insufficient balance. Minimum ₹${minTotalBalanceRequired} required for 5 minutes of call.`);
            }
        }

        // Check if user already has an active or pending session in either chat or call
        const userChatActive = await chatSessionModel.findOne({
            userId,
            status: { $in: ['PENDING', 'ACTIVE'] }
        });
        const userCallActive = await CallSession.findOne({
            userId,
            status: { $in: ['PENDING', 'ACTIVE'] }
        });

        if (userChatActive || userCallActive) {
            throw new Error('You already have an active or pending consultation request');
        }

        // Create new CallSession
        const session = new CallSession({
            userId,
            astrologerId,
            ratePerMinute,
            status: 'PENDING',
            intakeDetails,
            profileId: (intakeDetails as any)?.profileId || 'default',
            isFreeTrialSession: false,
            isIntroSession: isEligibleForIntroRate,
            sessionType,
        });

        await session.save();
        console.log(`[CallService] Call request created: ${session.sessionId}`);

        // Set auto-reject timeout
        const timeout = setTimeout(async () => {
            await this.timeoutCallRequest(session.sessionId);
        }, this.REQUEST_TIMEOUT_MS);
        this.requestTimeouts.set(session.sessionId, timeout);

        if (this.io) {
            const roomName = `astrologer:${astrologerId}`;
            const rawName = user.name || 'User';
            const isNamePhone = /\d{10,}/.test(rawName.replace(/[\s-]/g, ''));
            const sanitizedName = isNamePhone ? 'User' : rawName;

            const sanitizedIntake = intakeDetails ? { ...intakeDetails } : {};
            if ((sanitizedIntake as any).name) {
                if (/\d{10,}/.test((sanitizedIntake as any).name.replace(/[\s-]/g, ''))) {
                    (sanitizedIntake as any).name = 'User';
                }
            }

            const requestPayload = {
                sessionId: session.sessionId,
                userId: user._id.toString(),
                userName: sanitizedName,
                intakeDetails: sanitizedIntake,
                ratePerMinute,
                userMobile: '', // REDACTED
                createdAt: session.createdAt.toISOString(),
                isFreeTrialSession: false,
                freeTrialDurationSeconds: 0,
                sessionType,
            };

            // FCM wake-up
            notificationService.sendHighPriorityChatRequest(astrologerId, {
                sessionId: session.sessionId,
                userId: user._id.toString(),
                userName: sanitizedName,
                userMobile: '',
                ratePerMinute,
                intakeDetails: sanitizedIntake,
                sessionType,
            }).catch(e => console.error('[CallService] FCM call request send failed:', e));

            // Socket emit (using CHAT_REQUEST so client is notified seamlessly)
            this.io.to(roomName).emit('CHAT_REQUEST', requestPayload);
            console.log(`[CallService] CHAT_REQUEST socket emit sent for call ${session.sessionId}`);
        }

        return session;
    }

    /**
     * Accept a pending call request
     */
    async acceptCallRequest(sessionId: string): Promise<ICallSession> {
        let session = await CallSession.findOne({ sessionId });
        if (!session) {
            throw new Error('Session not found');
        }

        if (session.status === 'ACTIVE') {
            return session;
        }

        if (session.status !== 'PENDING') {
            if (session.status === 'ENDED' && session.endReason === 'ASTROLOGER_TIMEOUT') {
                throw new Error('Call request expired before you could accept');
            }
            if (session.status === 'ENDED' && session.endReason === 'USER_CANCEL_WHILE_PENDING') {
                throw new Error('cancelled or expired');
            }
            throw new Error(`Cannot accept session with status: ${session.status}`);
        }

        const timeout = this.requestTimeouts.get(sessionId);
        if (timeout) {
            clearTimeout(timeout);
            this.requestTimeouts.delete(sessionId);
        }

        const user = await User.findById(session.userId);
        if (!user) {
            throw new Error('User not found');
        }

        const systemSettingModel = mongoose.model('SystemSetting');
        const bonusUsageSetting = await systemSettingModel.findOne({ key: 'bonusUsagePercent' });
        const bonusUsagePercent = Number(bonusUsageSetting?.value ?? 20);

        const realBalance = user.walletBalance || 0;
        const bonusBalance = user.bonusBalance || 0;
        const ratePerMinute = session.ratePerMinute;

        const targetBonusDeduction = ratePerMinute * (bonusUsagePercent / 100);
        const targetRealDeduction = ratePerMinute - targetBonusDeduction;

        let bonusDeduction = 0;
        let realDeduction = 0;

        if (targetBonusDeduction > bonusBalance) {
            bonusDeduction = bonusBalance;
            realDeduction = Math.round((ratePerMinute - bonusDeduction) * 100) / 100;
        } else if (targetRealDeduction > realBalance) {
            realDeduction = realBalance;
            bonusDeduction = Math.round((ratePerMinute - realDeduction) * 100) / 100;
        } else {
            bonusDeduction = Math.round(targetBonusDeduction * 100) / 100;
            realDeduction = Math.round((ratePerMinute - bonusDeduction) * 100) / 100;
        }

        const isEligible = realBalance >= realDeduction && bonusBalance >= bonusDeduction && (realBalance + bonusBalance) >= ratePerMinute;

        if (!isEligible) {
            const errorMsg = `Insufficient balance. Minimum ₹${ratePerMinute} required for 1 minute (Real: ₹${realDeduction}, Bonus: ₹${bonusDeduction}).`;
            await CallSession.findOneAndUpdate(
                { sessionId, status: 'PENDING' },
                {
                    status: 'ENDED',
                    endReason: 'INSUFFICIENT_BALANCE_AT_ACCEPT',
                    errorDescription: errorMsg
                }
            );
            throw new Error(errorMsg);
        }

        const astrologer = await Astrologer.findOneAndUpdate(
            {
                _id: session.astrologerId,
                $or: [
                    { isBusy: { $ne: true } },
                    { activeSessionId: sessionId }
                ]
            },
            { $set: { isBusy: true, activeSessionId: sessionId } },
            { new: true }
        );

        if (!astrologer) {
            throw new Error('Astrologer is busy with another session');
        }

        const updatedSession = await CallSession.findOneAndUpdate(
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
            const checkSession = await CallSession.findOne({ sessionId });
            if (checkSession?.status === 'ACTIVE') {
                 return checkSession;
            }

            await Astrologer.findOneAndUpdate(
                { _id: session.astrologerId, activeSessionId: sessionId },
                { $set: { isBusy: false, activeSessionId: undefined } }
            );

            throw new Error('Call request was cancelled or expired');
        }

        session = updatedSession;
        void this.updateSessionCache(session);

        // Call has 2 minute (120s) hard limit
        this.startCallTimer(sessionId, 120);
        console.log(`[CallService] Call accepted - starting 120s timer for sessionId: ${sessionId}`);

        // Emit CHAT_STARTED (reused event name so frontend transitions screen)
        if (this.io) {
            const chatStartedData = {
                sessionId,
                startTime: session.startTime,
                ratePerMinute: session.ratePerMinute,
                status: 'ACTIVE',
                isFreeTrialSession: false,
                freeTrialDurationSeconds: 0,
                sessionType: session.sessionType,
            };

            this.io.to(`user:${session.userId}`).emit('CHAT_STARTED', {
                ...chatStartedData,
                astrologerId: session.astrologerId.toString(),
                astrologerName: astrologer.firstName + ' ' + astrologer.lastName,
                status: 'ACTIVE'
            });

            this.io.to(`astrologer:${session.astrologerId}`).emit('CHAT_STARTED', {
                ...chatStartedData,
                userId: session.userId.toString(),
                userName: user.name || 'User',
                status: 'ACTIVE'
            });
        }

        // FCM BACKUP: Send data-only push to USER so they receive CHAT_STARTED (which navigates them to UserCallScreen or ChatScreen)
        // even if their socket connection died (background/killed state)
        notificationService.sendChatStartedNotification(session.userId.toString(), {
            sessionId,
            astrologerId: session.astrologerId.toString(),
            astrologerName: `${astrologer.firstName} ${astrologer.lastName}`,
            ratePerMinute: session.ratePerMinute,
            startTime: session.startTime?.toISOString() || new Date().toISOString(),
            isFreeTrialSession: false,
            freeTrialDurationSeconds: 0,
            sessionType: session.sessionType,
        }).catch(err => console.error('[CallService] FCM chat_started push failed:', err));

        // DISMISS SIGNAL: Send a 'cancel' notification to the ASTROLOGER themselves.
        // This ensures the persistent 'incoming call' notification is cleared on ALL their devices.
        notificationService.sendChatCancelNotification(
            session.astrologerId.toString(),
            sessionId,
            'cancelled'
        ).catch(err => console.error('[CallService] FCM dismiss notify failed:', err));

        return session;
    }

    /**
     * Reject call request (astrologer initiated)
     */
    async rejectCallRequest(sessionId: string): Promise<void> {
        void this.invalidateSessionCache(sessionId);

        const session = await CallSession.findOne({ sessionId });
        if (!session) {
            throw new Error('Session not found');
        }

        if (session.status !== 'PENDING') {
            throw new Error(`Cannot reject session with status: ${session.status}`);
        }

        const timeout = this.requestTimeouts.get(sessionId);
        if (timeout) {
            clearTimeout(timeout);
            this.requestTimeouts.delete(sessionId);
        }

        session.status = 'REJECTED';
        session.endReason = 'ASTROLOGER_REJECTED';
        await session.save();

        console.log(`[CallService] Call rejected: ${sessionId}`);
        await this.incrementMissedCalls(session.astrologerId);

        if (this.io) {
            this.io.to(`user:${session.userId}`).emit('CHAT_REJECTED', {
                sessionId,
                reason: 'Astrologer declined the request'
            });
        }

        notificationService.sendChatRejectedNotification(
            session.userId.toString(),
            sessionId,
            'Astrologer declined the request'
        ).catch(err => console.error('[CallService] FCM push failed:', err));
    }

    /**
     * Cancel call request (user initiated)
     */
    async cancelCallRequest(sessionId: string, userId: string): Promise<{ cancelled: boolean; reason?: string }> {
        void this.invalidateSessionCache(sessionId);

        const session = await CallSession.findOneAndUpdate(
            {
                sessionId,
                status: 'PENDING',
                userId
            },
            {
                status: 'ENDED',
                endReason: 'USER_CANCEL_WHILE_PENDING'
            },
            { new: false }
        );

        if (!session) {
            const existingSession = await CallSession.findOne({ sessionId });
            if (!existingSession) return { cancelled: false, reason: 'session_not_found' };
            if (existingSession.userId.toString() !== userId) return { cancelled: false, reason: 'unauthorized' };
            if (existingSession.status === 'ACTIVE') return { cancelled: false, reason: 'already_started' };
            return { cancelled: false, reason: 'already_ended' };
        }

        const pendingDuration = Date.now() - session.createdAt.getTime();
        if (pendingDuration > 25000) {
            await CallSession.findByIdAndUpdate(session._id, {
                $set: { endReason: 'ASTROLOGER_TIMEOUT' }
            });
            await this.incrementMissedCalls(session.astrologerId);
        }

        const timeout = this.requestTimeouts.get(sessionId);
        if (timeout) {
            clearTimeout(timeout);
            this.requestTimeouts.delete(sessionId);
        }

        console.log(`[CallService] Call request cancelled by user: ${sessionId}`);

        if (this.io) {
            this.io.to(`astrologer:${session.astrologerId}`).emit('CHAT_CANCELLED', {
                sessionId,
                reason: 'User cancelled the request'
            });
        }

        notificationService.sendChatCancelNotification(
            session.astrologerId.toString(),
            sessionId,
            'cancelled'
        ).catch(err => console.error('[CallService] FCM cancel push failed:', err));

        return { cancelled: true };
    }

    /**
     * End active call session
     */
    async endCall(
        sessionId: string,
        endReason: 'USER_END' | 'ASTROLOGER_END' | 'INSUFFICIENT_BALANCE' | 'DISCONNECT' | 'TIMEOUT'
    ): Promise<ICallSession> {
        void this.invalidateSessionCache(sessionId);

        const graceTimer = this.activeDisconnectTimers.get(sessionId);
        if (graceTimer) {
            clearTimeout(graceTimer);
            this.activeDisconnectTimers.delete(sessionId);
        }

        const session = await CallSession.findOne({ sessionId });
        if (!session) {
            throw new Error('Session not found');
        }

        if (session.status === 'ENDED' || session.status === 'REJECTED') {
            console.log(`[CallService] endCall called on session ${sessionId} which is already ${session.status}`);
            return session;
        }

        if (session.status === 'PENDING') {
            console.log(`[CallService] endCall called on PENDING session ${sessionId}. Cancelling request.`);
            session.status = 'ENDED';
            session.endReason = 'USER_CANCEL_WHILE_PENDING';
            await session.save();

            const timeout = this.requestTimeouts.get(sessionId);
            if (timeout) {
                clearTimeout(timeout);
                this.requestTimeouts.delete(sessionId);
            }

            if (this.io) {
                this.io.to(`astrologer:${session.astrologerId}`).emit('CHAT_CANCELLED', {
                    sessionId,
                    reason: 'User ended the request'
                });
            }

            notificationService.sendChatCancelNotification(
                session.astrologerId.toString(),
                sessionId,
                'cancelled'
            ).catch(err => console.error('[CallService] FCM cancel push failed in endCall:', err));

            return session;
        }

        if (session.status !== 'ACTIVE') {
            throw new Error(`Cannot end session with status: ${session.status}`);
        }

        this.stopCallTimer(sessionId);

        // Process Billing at Call End (Per-second Billing based on Duration)
        if (session.startTime) {
            const endTime = new Date();
            const startTime = session.startTime;
            const durationMs = endTime.getTime() - startTime.getTime();
            const durationMinutes = Math.max(0, durationMs / 60000);

            const totalExpectedCost = durationMinutes * session.ratePerMinute;
            const remainingToCharge = Math.round(totalExpectedCost * 100) / 100;

            console.log(`[CallService] End Call Billing: Duration=${durationMinutes.toFixed(2)}m, ExpectedCost=${totalExpectedCost}, Charging=${remainingToCharge}`);

            if (remainingToCharge > 0) {
                const user = await User.findById(session.userId);
                const astrologer = await Astrologer.findById(session.astrologerId);

                if (user && astrologer) {
                    const paymentResult = await this.processPayment(
                        session,
                        user,
                        astrologer,
                        remainingToCharge,
                        `Call session: ${sessionId} - Final Settlement`
                    );
                    if (!paymentResult.success) {
                        console.warn(`[CallService] Failed to charge final call amount: ${remainingToCharge}`);
                    }
                }
            }

            const finalMinutes = parseFloat(durationMinutes.toFixed(2));
            const updatedSession = await CallSession.findOneAndUpdate(
                { sessionId },
                {
                    $set: {
                        status: 'ENDED',
                        endTime: new Date(),
                        endReason,
                        totalMinutes: finalMinutes
                    }
                },
                { new: true }
            );

            session.status = 'ENDED';
            session.endTime = new Date();
            session.endReason = endReason;
            session.totalMinutes = finalMinutes;

            if (updatedSession) {
                session.totalAmount = updatedSession.totalAmount;
                session.astrologerEarnings = updatedSession.astrologerEarnings;
                session.astrologerNetEarnings = updatedSession.astrologerNetEarnings;
            }
        }

        const freedAstrologer = await Astrologer.findByIdAndUpdate(session.astrologerId, {
            $set: { isBusy: false, activeSessionId: undefined },
            $inc: { totalChats: 1 } // count as consult
        }, { new: false });

        // Waitlist notify
        if (freedAstrologer) {
            // Re-use waitlist logic if any, otherwise skip
        }

        const finalUser = await User.findById(session.userId);
        console.log(`[CallService] Call ended: ${sessionId}, reason: ${endReason}`);

        if (this.io) {
            const endPayload = {
                sessionId,
                endReason,
                totalMinutes: session.totalMinutes,
                totalAmount: session.totalAmount,
                astrologerEarnings: session.astrologerNetEarnings ?? session.astrologerEarnings
            };

            this.io.to(`user:${session.userId}`).emit('CHAT_ENDED', {
                ...endPayload,
                walletBalance: finalUser?.walletBalance || 0,
                bonusBalance: finalUser?.bonusBalance || 0
            });

            this.io.to(`astrologer:${session.astrologerId}`).emit('CHAT_ENDED', endPayload);
        }

        notificationService.sendChatEndedNotification(
            session.userId.toString(),
            session.astrologerId.toString(),
            {
                sessionId,
                endReason,
                totalMinutes: session.totalMinutes,
                totalAmount: session.totalAmount,
            }
        ).catch(err => console.error('[CallService] FCM push failed:', err));

        return session;
    }

    /**
     * Start Call Timer (120s limit)
     */
    private async startCallTimer(sessionId: string, durationSeconds: number): Promise<void> {
        if (this.callTimers.has(sessionId)) return;

        console.log(`[CallService] Starting call timer for ${sessionId}, duration: ${durationSeconds}s`);
        const session = await CallSession.findOne({ sessionId });
        if (!session) return;

        const endTimer = setTimeout(async () => {
            console.log(`[CallService] Call limit reached, ending session: ${sessionId}`);
            try {
                await this.endCall(sessionId, 'TIMEOUT');
            } catch (err: any) {
                console.error(`[CallService] Error ending timed out call: ${err.message}`);
            }
        }, durationSeconds * 1000);

        this.callTimers.set(sessionId, endTimer);

        if (durationSeconds > 60) {
            const warningTimer = setTimeout(() => {
                if (this.io) {
                    const payload = {
                        sessionId,
                        remainingBalance: 0,
                        ratePerMinute: 0,
                        isCall: true,
                        isBalanceDepleted: false
                    };
                    this.io.to(`user:${session.userId}`).emit('LAST_MINUTE_WARNING', payload);
                    this.io.to(`astrologer:${session.astrologerId}`).emit('LAST_MINUTE_WARNING', payload);
                }
            }, (durationSeconds - 60) * 1000);
            this.callWarningTimers.set(sessionId, warningTimer);
        }
    }

    /**
     * Stop Call Timer
     */
    private stopCallTimer(sessionId: string): void {
        const timer = this.callTimers.get(sessionId);
        if (timer) {
            clearTimeout(timer);
            this.callTimers.delete(sessionId);
        }
        const warningTimer = this.callWarningTimers.get(sessionId);
        if (warningTimer) {
            clearTimeout(warningTimer);
            this.callWarningTimers.delete(sessionId);
        }
    }

    /**
     * Timeout call request (astrologer timeout)
     */
    private async timeoutCallRequest(sessionId: string): Promise<void> {
        void this.invalidateSessionCache(sessionId);

        const session = await CallSession.findOneAndUpdate(
            { sessionId, status: 'PENDING' },
            {
                status: 'ENDED',
                endReason: 'ASTROLOGER_TIMEOUT',
                errorDescription: 'request timeout, astrologer has not picked up, call request missed'
            },
            { new: true }
        );

        if (!session) return;

        this.requestTimeouts.delete(sessionId);
        console.log(`[CallService] Call request timed out: ${sessionId}`);
        await this.incrementMissedCalls(session.astrologerId);

        if (this.io) {
            this.io.to(`user:${session.userId}`).emit('CHAT_TIMEOUT', {
                sessionId,
                reason: 'Request timed out - Astrologer did not respond in 30 seconds'
            });
            this.io.to(`astrologer:${session.astrologerId}`).emit('CHAT_TIMEOUT', {
                sessionId,
                reason: 'You missed a call request.'
            });
        }
    }

    /**
     * Helpers for checking active calls
     */
    async getActiveCallForUser(userId: string): Promise<ICallSession | null> {
        return CallSession.findOne({ userId, status: { $in: ['ACTIVE', 'PENDING'] } })
            .sort({ createdAt: -1 })
            .populate('astrologerId', 'firstName lastName');
    }

    async getActiveCallForAstrologer(astrologerId: string): Promise<ICallSession | null> {
        return CallSession.findOne({ astrologerId, status: 'ACTIVE' })
            .populate('userId', 'name');
    }

    async getPendingCallsForAstrologer(astrologerId: string): Promise<ICallSession[]> {
        return CallSession.find({ astrologerId, status: 'PENDING' });
    }

    async getSession(sessionId: string): Promise<ICallSession | null> {
        const cached = await redisClient.get(`callSession:${sessionId}`);
        if (cached) {
            try {
                return new CallSession(JSON.parse(cached));
            } catch (e) {
                console.error('[CallService] Redis parse error:', e);
            }
        }

        const session = await CallSession.findOne({ sessionId });
        if (session) {
            void this.updateSessionCache(session);
        }
        return session;
    }

    async updateSessionCache(session: ICallSession): Promise<void> {
        await redisClient.setex(
            `callSession:${session.sessionId}`,
            this.SESSION_CACHE_TTL_SECS,
            JSON.stringify(session.toJSON())
        );
    }

    async invalidateSessionCache(sessionId: string): Promise<void> {
        await redisClient.del(`callSession:${sessionId}`);
    }

    private async incrementMissedCalls(astrologerId: string | mongoose.Types.ObjectId): Promise<void> {
        try {
            const astrologer = await Astrologer.findByIdAndUpdate(
                astrologerId,
                { $inc: { missedChats: 1 } }, // Re-use missedChats count for auto-blocking
                { new: true }
            );

            if (!astrologer) return;
            console.log(`[CallService] Incremented missed consultations for astrologer ${astrologer._id}. New count: ${astrologer.missedChats}`);

            if ((astrologer.warningCount || 0) >= 2 && (astrologer.missedChats || 0) >= 3) {
                console.log(`[CallService] Auto-blocking astrologer ${astrologer._id} due to 3 missed sessions.`);
                await Astrologer.findByIdAndUpdate(astrologer._id, {
                    $set: { isBlocked: true, isOnline: false }
                });

                if (this.io) {
                    this.io.to(`astrologer:${astrologer._id}`).emit('ASTROLOGER_BLOCKED', {
                        reason: 'Account blocked due to missing 3 consultations after receiving 2 official warnings.'
                    });
                }
            }
        } catch (error) {
            console.error('[CallService] Error incrementing missed consultations:', error);
        }
    }

    private async processPayment(
        session: ICallSession,
        user: any,
        astrologer: any,
        amount: number,
        description: string
    ): Promise<{ success: boolean; realDeducted?: number; bonusDeducted?: number }> {
        try {
            const systemSettingModel = mongoose.model('SystemSetting');
            const bonusUsageSetting = await systemSettingModel.findOne({ key: 'bonusUsagePercent' });
            const commissionSetting = await systemSettingModel.findOne({ key: 'astrologerCommission' });

            const bonusUsagePercent = Number(bonusUsageSetting?.value ?? 20);
            const astrologerCommission = Number(commissionSetting?.value ?? 40);

            const totalToDeduct = Math.round(amount * 100) / 100;
            const realBalance = user.walletBalance || 0;
            const bonusBalance = user.bonusBalance || 0;

            const targetBonusDeduction = totalToDeduct * (bonusUsagePercent / 100);
            const targetRealDeduction = totalToDeduct - targetBonusDeduction;

            let bonusDeduction = 0;
            let realDeduction = 0;

            if (targetBonusDeduction > bonusBalance) {
                bonusDeduction = bonusBalance;
                realDeduction = Math.round((totalToDeduct - bonusDeduction) * 100) / 100;
            } else if (targetRealDeduction > realBalance) {
                realDeduction = realBalance;
                bonusDeduction = Math.round((totalToDeduct - realDeduction) * 100) / 100;
            } else {
                bonusDeduction = Math.round(targetBonusDeduction * 100) / 100;
                realDeduction = Math.round((totalToDeduct - bonusDeduction) * 100) / 100;
            }

            if (bonusDeduction < 0) bonusDeduction = 0;
            if (realDeduction < 0) realDeduction = 0;

            const userUpdate = {
                $inc: {
                    walletBalance: -realDeduction,
                    bonusBalance: -bonusDeduction
                }
            };

            const atomicQuery: any = {
                _id: user._id,
                walletBalance: { $gte: realDeduction - 0.005 },
            };
            if (bonusDeduction > 0) {
                atomicQuery.bonusBalance = { $gte: bonusDeduction - 0.005 };
            }

            const updatedUserDoc = await User.findOneAndUpdate(
                atomicQuery,
                userUpdate,
                { new: true }
            );

            if (!updatedUserDoc) {
                console.warn(`[CallService] Atomic deduction FAILED for user ${user._id}.`);
                return { success: false };
            }

            const freshAstrologer = await Astrologer.findById(astrologer._id);
            if (!freshAstrologer) throw new Error('Astrologer not found');

            const activeCommission = (freshAstrologer.commissionPercentage !== undefined && freshAstrologer.commissionPercentage !== null)
                ? freshAstrologer.commissionPercentage
                : astrologerCommission;

            const astrologerShare = Math.round((realDeduction * activeCommission / 100) * 100) / 100;

            // TDS calculations
            const tdsThresholdSetting = await systemSettingModel.findOne({ key: 'tdsThreshold' });
            const tdsRateSetting = await systemSettingModel.findOne({ key: 'tdsRate' });
            const tdsThreshold = tdsThresholdSetting?.value ?? 50000;
            const tdsRate = tdsRateSetting?.value ?? 10;

            const now = new Date();
            const currentFYStart = new Date(now.getFullYear(), 3, 1);
            if (now.getMonth() < 3) currentFYStart.setFullYear(now.getFullYear() - 1);

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

            const updatedSessionDoc = await CallSession.findOneAndUpdate(
                { sessionId: session.sessionId },
                {
                    $inc: {
                        totalAmount: totalToDeduct,
                        astrologerEarnings: astrologerShare,
                        astrologerNetEarnings: netAstrologerShare
                    }
                },
                { new: true }
            );

            if (updatedSessionDoc) {
                session.totalAmount = updatedSessionDoc.totalAmount;
                session.astrologerEarnings = updatedSessionDoc.astrologerEarnings;
                session.astrologerNetEarnings = updatedSessionDoc.astrologerNetEarnings;
            }

            const transaction = new Transaction({
                fromUser: user._id,
                toAstrologer: astrologer._id,
                amount: totalToDeduct,
                type: 'debit',
                status: 'success',
                description: description || `Call: ${session.sessionId} (Real: ₹${realDeduction}, Bonus: ₹${bonusDeduction}, Astro: ₹${astrologerShare})`
            });
            await transaction.save();

            return { success: true, realDeducted: realDeduction, bonusDeducted: bonusDeduction };
        } catch (error: any) {
            console.error('[CallService] Payment processing error:', error?.message);
            return { success: false };
        }
    }

    /**
     * Resumes timers for ACTIVE sessions on server restart
     */
    async resumeActiveCalls(): Promise<void> {
        console.log('[CallService] Resuming active call sessions...');
        const activeCalls = await CallSession.find({ status: 'ACTIVE' });

        for (const session of activeCalls) {
            if (!this.callTimers.has(session.sessionId)) {
                const startTime = session.startTime || session.createdAt;
                const elapsedSeconds = Math.floor((Date.now() - startTime.getTime()) / 1000);
                const remainingSeconds = 120 - elapsedSeconds;

                if (remainingSeconds > 0) {
                    console.log(`[CallService] Resuming call timer for: ${session.sessionId} (${remainingSeconds}s remaining)`);
                    this.startCallTimer(session.sessionId, remainingSeconds);
                } else {
                    console.log(`[CallService] Call expired during downtime: ${session.sessionId}. Ending.`);
                    await this.endCall(session.sessionId, 'TIMEOUT');
                }
            }
        }
    }

    /**
     * Clean up stale pending requests
     */
    async cleanupStaleCalls(): Promise<void> {
        const cutoff = new Date(Date.now() - (this.REQUEST_TIMEOUT_MS + 5000));
        const staleRequests = await CallSession.find({
            status: 'PENDING',
            createdAt: { $lt: cutoff }
        });

        for (const req of staleRequests) {
            console.log(`[CallService] Cleaning up stale call request: ${req.sessionId}`);
            await this.timeoutCallRequest(req.sessionId);
        }
    }

    /**
     * Handle Disconnect
     */
    async handleDisconnect(userId: string, isAstrologer: boolean): Promise<void> {
        // Calls end immediately upon disconnect or when the express room is left.
        // We can check if there's an active call and trigger a grace period or end it.
        const session = isAstrologer
            ? await this.getActiveCallForAstrologer(userId)
            : await this.getActiveCallForUser(userId);

        if (!session) return;

        console.log(`[CallService] Participant disconnected from call ${session.sessionId}. Starting 30s grace timer.`);
        
        const timer = setTimeout(async () => {
            this.activeDisconnectTimers.delete(session.sessionId);
            try {
                console.log(`[CallService] Grace timer expired. Ending call ${session.sessionId}.`);
                await this.endCall(session.sessionId, 'DISCONNECT');
            } catch (err: any) {
                console.error(`[CallService] Error auto-ending call after disconnect: ${err.message}`);
            }
        }, this.ACTIVE_DISCONNECT_GRACE_MS);

        this.activeDisconnectTimers.set(session.sessionId, timer);
    }

    /**
     * Handle Reconnect
     */
    async handleReconnect(userId: string, isAstrologer: boolean): Promise<void> {
        const session = isAstrologer
            ? await this.getActiveCallForAstrologer(userId)
            : await this.getActiveCallForUser(userId);

        if (!session) return;

        const graceTimer = this.activeDisconnectTimers.get(session.sessionId);
        if (graceTimer) {
            console.log(`[CallService] Participant reconnected to call ${session.sessionId}. Clearing grace timer.`);
            clearTimeout(graceTimer);
            this.activeDisconnectTimers.delete(session.sessionId);
        }
    }
}

export const callService = new CallService();
export default callService;
