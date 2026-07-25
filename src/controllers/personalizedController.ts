import { Request, Response } from 'express';
import Astrologer from '../models/Astrologer';
import PersonalizedSession from '../models/PersonalizedSession';
import SystemSetting from '../models/SystemSetting';
import Notification from '../models/Notification';
import User from '../models/User';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import notificationService from '../services/notificationService';
import chatService from '../services/chatService';
import { sendPersonalizedHoroscopeEmail } from '../services/pdfService';

const DEFAULT_CONFIG = {
    timers: [
        { minutes: 15, chatPrice: 200, callPrice: 300, videoPrice: 500 },
        { minutes: 30, chatPrice: 350, callPrice: 550, videoPrice: 900 },
        { minutes: 60, chatPrice: 600, callPrice: 1000, videoPrice: 1600 },
        { minutes: 120, chatPrice: 1100, callPrice: 1900, videoPrice: 3000 }
    ],
    defaultCommissions: {
        chat: 20,
        call: 20,
        video: 25
    },
    gstPercentage: 18,
    sendEmailHoroscopeEnabled: true
};

// Helper: Get or Init System Config
const getPersonalizedConfig = async () => {
    let setting = await SystemSetting.findOne({ key: 'personalized_service_config' });
    if (!setting) {
        setting = new SystemSetting({
            key: 'personalized_service_config',
            value: DEFAULT_CONFIG,
            description: 'Timer slots, pricing and commission config for Personalized Service'
        });
        await setting.save();
    }
    return setting.value;
};

// ==================== ADMIN ENDPOINTS ====================

export const getConfig = async (req: Request, res: Response) => {
    try {
        const config = await getPersonalizedConfig();
        return res.json({ success: true, config });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const updateConfig = async (req: Request, res: Response) => {
    try {
        const { timers, defaultCommissions, gstPercentage, sendEmailHoroscopeEnabled } = req.body;
        let setting = await SystemSetting.findOne({ key: 'personalized_service_config' });
        if (!setting) {
            setting = new SystemSetting({ key: 'personalized_service_config', value: DEFAULT_CONFIG });
        }
        setting.value = {
            timers: timers || setting.value.timers,
            defaultCommissions: defaultCommissions || setting.value.defaultCommissions,
            gstPercentage: gstPercentage !== undefined ? gstPercentage : setting.value.gstPercentage,
            sendEmailHoroscopeEnabled: sendEmailHoroscopeEnabled !== undefined ? sendEmailHoroscopeEnabled : (setting.value.sendEmailHoroscopeEnabled !== false)
        };
        setting.markModified('value');
        await setting.save();
        return res.json({ success: true, message: 'Configuration updated successfully', config: setting.value });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getAstrologersAdmin = async (req: Request, res: Response) => {
    try {
        const astrologers = await Astrologer.find({ status: 'approved' })
            .select('firstName lastName email mobileNumber profilePhoto personalizedServiceEnabled personalizedChatEnabled personalizedVoiceCallEnabled personalizedVideoCallEnabled personalizedChatPricePerMin personalizedCallPricePerMin personalizedVideoPricePerMin rating reviewsCount')
            .lean();
        return res.json({ success: true, astrologers });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const updateAstrologerStatusAdmin = async (req: Request, res: Response) => {
    try {
        const { astrologerId, enabled, chatPricePerMin, callPricePerMin, videoPricePerMin } = req.body;
        const astro = await Astrologer.findById(astrologerId);
        if (!astro) {
            return res.status(404).json({ success: false, message: 'Astrologer not found' });
        }

        if (enabled !== undefined) {
            astro.personalizedServiceEnabled = enabled;
        }
        if (chatPricePerMin !== undefined) {
            astro.personalizedChatPricePerMin = chatPricePerMin;
        }
        if (callPricePerMin !== undefined) {
            astro.personalizedCallPricePerMin = callPricePerMin;
        }
        if (videoPricePerMin !== undefined) {
            astro.personalizedVideoPricePerMin = videoPricePerMin;
        }

        await astro.save();
        return res.json({ success: true, message: 'Astrologer personalized status updated', astrologer: astro });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getSessionHistoryAdmin = async (req: Request, res: Response) => {
    try {
        const { status, serviceType, search } = req.query;
        const filter: any = {};

        if (status) filter.status = status;
        if (serviceType) filter.serviceType = serviceType;

        const sessions = await PersonalizedSession.find(filter)
            .populate('userId', 'name email phone')
            .populate('astrologerId', 'firstName lastName profilePhoto mobileNumber')
            .sort({ createdAt: -1 })
            .lean();

        // Calculate Analytics Stats for Completed vs Uncompleted User Sessions
        const allSessions = await PersonalizedSession.find({}).lean();
        const completedSessions = allSessions.filter(s => s.status === 'COMPLETED');
        const uncompletedSessions = allSessions.filter(s => s.status === 'PAID_PENDING_ACCEPT' || s.status === 'MISSED');

        const stats = {
            totalCompleted: completedSessions.length,
            totalUncompleted: uncompletedSessions.length,
            completedChat: completedSessions.filter(s => s.serviceType === 'chat').length,
            completedCall: completedSessions.filter(s => s.serviceType === 'call').length,
            completedVideo: completedSessions.filter(s => s.serviceType === 'video').length,
            uncompletedChat: uncompletedSessions.filter(s => s.serviceType === 'chat').length,
            uncompletedCall: uncompletedSessions.filter(s => s.serviceType === 'call').length,
            uncompletedVideo: uncompletedSessions.filter(s => s.serviceType === 'video').length,
        };

        return res.json({ success: true, sessions, stats });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getLiveSessionsAdmin = async (req: Request, res: Response) => {
    try {
        const liveSessions = await PersonalizedSession.find({ status: 'ACTIVE' })
            .populate('userId', 'name phone')
            .populate('astrologerId', 'firstName lastName profilePhoto')
            .sort({ startTime: -1 })
            .lean();
        return res.json({ success: true, liveSessions });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getMissedRequestsAdmin = async (req: Request, res: Response) => {
    try {
        const missedSessions = await PersonalizedSession.find({ status: 'MISSED' })
            .populate('userId', 'name phone')
            .populate('astrologerId', 'firstName lastName mobileNumber profilePhoto')
            .sort({ missedAt: -1, createdAt: -1 })
            .lean();

        return res.json({
            success: true,
            count: missedSessions.length,
            missedSessions
        });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ==================== ASTROLOGER PANEL ENDPOINTS ====================

export const getAstrologerSettings = async (req: Request, res: Response) => {
    try {
        const astrologerId = (req as any).userId || req.query.astrologerId;
        const astro = await Astrologer.findById(astrologerId);
        if (!astro) {
            return res.status(404).json({ success: false, message: 'Astrologer not found' });
        }
        return res.json({
            success: true,
            personalizedServiceEnabled: !!astro.personalizedServiceEnabled,
            personalizedChatEnabled: astro.personalizedChatEnabled !== false,
            personalizedVoiceCallEnabled: astro.personalizedVoiceCallEnabled !== false,
            personalizedVideoCallEnabled: astro.personalizedVideoCallEnabled !== false
        });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const updateAstrologerSettings = async (req: Request, res: Response) => {
    try {
        const astrologerId = (req as any).userId || req.body.astrologerId;
        const { chatEnabled, voiceCallEnabled, videoCallEnabled } = req.body;

        const astro = await Astrologer.findById(astrologerId);
        if (!astro) {
            return res.status(404).json({ success: false, message: 'Astrologer not found' });
        }

        if (!astro.personalizedServiceEnabled) {
            return res.status(403).json({ success: false, message: 'Personalized service is disabled by admin for your account' });
        }

        const newChat = chatEnabled !== undefined ? chatEnabled : (astro.personalizedChatEnabled !== false);
        const newVoice = voiceCallEnabled !== undefined ? voiceCallEnabled : (astro.personalizedVoiceCallEnabled !== false);
        const newVideo = videoCallEnabled !== undefined ? videoCallEnabled : (astro.personalizedVideoCallEnabled !== false);

        // Validation: At least 1 service must remain enabled
        if (!newChat && !newVoice && !newVideo) {
            return res.status(400).json({
                success: false,
                message: 'At least one service (Chat, Voice Call, or Video Call) must remain enabled.'
            });
        }

        astro.personalizedChatEnabled = newChat;
        astro.personalizedVoiceCallEnabled = newVoice;
        astro.personalizedVideoCallEnabled = newVideo;
        await astro.save();

        return res.json({
            success: true,
            message: 'Personalized service settings updated successfully',
            personalizedChatEnabled: astro.personalizedChatEnabled,
            personalizedVoiceCallEnabled: astro.personalizedVoiceCallEnabled,
            personalizedVideoCallEnabled: astro.personalizedVideoCallEnabled
        });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getAstrologerEarnings = async (req: Request, res: Response) => {
    try {
        const astrologerId = (req as any).userId || req.query.astrologerId;
        const sessions = await PersonalizedSession.find({
            astrologerId,
            $or: [{ status: 'COMPLETED' }, { usedDurationSeconds: { $gt: 0 } }]
        })
            .populate('userId', 'name mobile email')
            .sort({ createdAt: -1 })
            .lean();

        let totalGross = 0;
        let totalNetEarning = 0;
        let chatCount = 0;
        let callCount = 0;
        let videoCount = 0;

        const history = sessions.map((s: any) => {
            const userObj = typeof s.userId === 'object' ? s.userId : null;
            const userName = s.profileData?.name || userObj?.name || 'User';
            totalGross += (s.basePrice || 0);
            totalNetEarning += (s.astrologerEarning || 0);
            if (s.serviceType === 'chat') chatCount++;
            else if (s.serviceType === 'call') callCount++;
            else if (s.serviceType === 'video') videoCount++;

            return {
                ...s,
                userName
            };
        });

        return res.json({
            success: true,
            totalGross,
            totalNetEarning,
            chatCount,
            callCount,
            videoCount,
            totalSessions: history.length,
            history
        });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ==================== USER & BOOKING ENDPOINTS ====================

export const getPersonalizedAstrologersUser = async (req: Request, res: Response) => {
    try {
        const config = await getPersonalizedConfig();
        const astrologers = await Astrologer.find({
            status: 'approved',
            personalizedServiceEnabled: true,
            isBlocked: false,
            $or: [
                { personalizedChatEnabled: { $ne: false } },
                { personalizedVoiceCallEnabled: { $ne: false } },
                { personalizedVideoCallEnabled: { $ne: false } }
            ]
        })
            .select('firstName lastName profilePhoto rating reviewsCount specialties experience isOnline personalizedServiceEnabled personalizedChatEnabled personalizedVoiceCallEnabled personalizedVideoCallEnabled bio aboutMe')
            .lean();

        const activeAstrologers = astrologers.filter((a: any) =>
            a.personalizedChatEnabled !== false ||
            a.personalizedVoiceCallEnabled !== false ||
            a.personalizedVideoCallEnabled !== false
        );

        return res.json({
            success: true,
            config,
            astrologers: activeAstrologers
        });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const createBookingOrder = async (req: Request, res: Response) => {
    try {
        const { astrologerId, serviceType, durationMinutes } = req.body;
        const astro = await Astrologer.findById(astrologerId);
        if (!astro || !astro.personalizedServiceEnabled) {
            return res.status(400).json({ success: false, message: 'Astrologer is not available for personalized service' });
        }

        // Check if service is enabled by astrologer
        if (serviceType === 'chat' && astro.personalizedChatEnabled === false) {
            return res.status(400).json({ success: false, message: 'Astrologer has disabled personalized chat' });
        }
        if (serviceType === 'call' && astro.personalizedVoiceCallEnabled === false) {
            return res.status(400).json({ success: false, message: 'Astrologer has disabled personalized voice call' });
        }
        if (serviceType === 'video' && astro.personalizedVideoCallEnabled === false) {
            return res.status(400).json({ success: false, message: 'Astrologer has disabled personalized video call' });
        }

        const config = await getPersonalizedConfig();
        const slot = config.timers.find((t: any) => t.minutes === Number(durationMinutes));
        if (!slot) {
            return res.status(400).json({ success: false, message: 'Invalid timer duration selected' });
        }

        let basePrice = 0;
        if (serviceType === 'chat') {
            basePrice = astro.personalizedChatPricePerMin !== null && astro.personalizedChatPricePerMin !== undefined
                ? Number(durationMinutes) * astro.personalizedChatPricePerMin
                : slot.chatPrice;
        } else if (serviceType === 'call') {
            basePrice = astro.personalizedCallPricePerMin !== null && astro.personalizedCallPricePerMin !== undefined
                ? Number(durationMinutes) * astro.personalizedCallPricePerMin
                : slot.callPrice;
        } else if (serviceType === 'video') {
            basePrice = astro.personalizedVideoPricePerMin !== null && astro.personalizedVideoPricePerMin !== undefined
                ? Number(durationMinutes) * astro.personalizedVideoPricePerMin
                : slot.videoPrice;
        }

        const gstAmount = Math.round((basePrice * (config.gstPercentage || 18)) / 100);
        const totalAmountPaid = basePrice + gstAmount;

        // Create Razorpay Order
        const razorpayKey = process.env.RAZORPAY_KEY_ID;
        const razorpaySecret = process.env.RAZORPAY_KEY_SECRET;

        let razorpayOrderId = 'order_mock_' + Date.now();
        if (razorpayKey && razorpaySecret) {
            const instance = new Razorpay({ key_id: razorpayKey, key_secret: razorpaySecret });
            const order = await instance.orders.create({
                amount: Math.round(totalAmountPaid * 100), // in paise
                currency: 'INR',
                receipt: 'receipt_pers_' + Date.now()
            });
            razorpayOrderId = order.id;
        }

        return res.json({
            success: true,
            orderId: razorpayOrderId,
            amount: totalAmountPaid,
            basePrice,
            gstAmount,
            durationMinutes,
            serviceType,
            razorpayKeyId: razorpayKey || 'rzp_test_mock'
        });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const verifyBookingPayment = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId || (req as any).user?.id || req.body.userId;
        const {
            astrologerId,
            serviceType,
            durationMinutes,
            basePrice,
            gstAmount,
            totalAmountPaid,
            razorpayOrderId,
            razorpayPaymentId,
            profileData
        } = req.body;

        const astro = await Astrologer.findById(astrologerId);
        if (!astro) {
            return res.status(404).json({ success: false, message: 'Astrologer not found' });
        }

        const config = await getPersonalizedConfig();

        // Calculate Commission & Astrologer Earning using Global Commission Only
        const commPercentage = config.defaultCommissions[serviceType] || 20;

        const platformCommission = Math.round(((basePrice * commPercentage) / 100) * 100) / 100;
        const astrologerEarning = Math.round((basePrice - platformCommission) * 100) / 100;

        const totalAllocatedSec = durationMinutes * 60;

        const session = new PersonalizedSession({
            userId,
            astrologerId,
            profileData,
            serviceType,
            durationMinutes,
            remainingDurationSeconds: totalAllocatedSec,
            usedDurationSeconds: 0,
            basePrice,
            gstAmount,
            totalAmountPaid,
            astrologerEarning,
            platformCommission,
            commissionPercentage: commPercentage,
            status: 'PAID_PENDING_ACCEPT',
            razorpayOrderId,
            razorpayPaymentId,
            zegoRoomId: `pers_${serviceType}_${Date.now()}`
        });

        await session.save();

        const userObj = await User.findById(userId);
        const userName = userObj?.name || profileData?.name || 'User';
        const userEmail = profileData?.email || userObj?.email;

        // Async: Send basic horoscope email to user ONLY if email available AND admin feature is enabled
        if (userEmail && config.sendEmailHoroscopeEnabled !== false) {
            sendPersonalizedHoroscopeEmail(userEmail, userName, profileData)
                .catch(err => console.error('[Personalized] Failed to send horoscope email:', err));
        }

        const remainingSec = session.remainingDurationSeconds ?? (durationMinutes * 60);

        // 1. Send High-Priority Ringing FCM Notification to Astrologer's Device
        notificationService.sendHighPriorityChatRequest(astrologerId.toString(), {
            sessionId: session.sessionId,
            userId: userId.toString(),
            userName,
            ratePerMinute: session.basePrice,
            intakeDetails: profileData,
            sessionType: 'personalized_' + serviceType,
        }).catch(e => console.error('[Personalized] FCM request failed:', e));

        // 2. Emit Socket.IO CHAT_REQUEST event to Astrologer's rooms for instant ringing & modal popup
        if (chatService.io) {
            const requestPayload = {
                sessionId: session.sessionId,
                userId: userId.toString(),
                userName,
                intakeDetails: profileData,
                ratePerMinute: session.basePrice,
                createdAt: session.createdAt.toISOString(),
                sessionType: 'personalized_' + serviceType,
                serviceType,
                durationMinutes: Math.ceil(remainingSec / 60),
                remainingDurationSeconds: remainingSec,
                isPersonalized: true,
                isFreeTrialSession: false,
                freeTrialDurationSeconds: 0
            };
            chatService.io.to(`astrologer:${astro.userId}`).emit('CHAT_REQUEST', requestPayload);
            chatService.io.to(`astrologer:${astrologerId}`).emit('CHAT_REQUEST', requestPayload);
            chatService.io.to(`astrologer_${astrologerId}`).emit('CHAT_REQUEST', requestPayload);
        }

        // 3. Store Database Notification ONLY for that targeted Astrologer (Audience: 'user', userId: astro.userId)
        await Notification.create({
            recipient: astro.userId,
            recipientType: 'astrologer',
            title: `New Personalized ${serviceType.toUpperCase()} Request!`,
            message: `You have received a paid ${durationMinutes} min personalized ${serviceType} request. Open dashboard to accept!`,
            type: 'PERSONALIZED_REQUEST',
            audience: 'user',
            userId: astro.userId,
            metadata: { sessionId: session.sessionId, serviceType, durationMinutes }
        });

        return res.json({
            success: true,
            message: 'Payment verified and booking request sent to astrologer',
            session
        });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const reRequestSession = async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.body;
        const session = await PersonalizedSession.findOne({ sessionId });
        if (!session) {
            return res.status(404).json({ success: false, message: 'Session not found' });
        }

        if (session.status !== 'MISSED' && session.status !== 'PAID_PENDING_ACCEPT') {
            return res.status(400).json({ success: false, message: 'Cannot re-request an active or completed session' });
        }

        session.status = 'PAID_PENDING_ACCEPT';
        session.missedAt = undefined;
        await session.save();

        const astro = await Astrologer.findById(session.astrologerId);
        if (astro) {
            const userObj = await User.findById(session.userId);
            const userName = userObj?.name || 'User';

            // 1. FCM High-Priority Ringing Notification
            notificationService.sendHighPriorityChatRequest(session.astrologerId.toString(), {
                sessionId: session.sessionId,
                userId: session.userId.toString(),
                userName,
                ratePerMinute: session.basePrice,
                intakeDetails: session.profileData,
                sessionType: 'personalized_' + session.serviceType,
            }).catch(e => console.error('[Personalized] FCM re-request failed:', e));

            // 2. Socket.IO Emit
            if (chatService.io) {
                const requestPayload = {
                    sessionId: session.sessionId,
                    userId: session.userId.toString(),
                    userName,
                    intakeDetails: session.profileData,
                    ratePerMinute: session.basePrice,
                    createdAt: new Date().toISOString(),
                    sessionType: 'personalized_' + session.serviceType,
                    serviceType: session.serviceType,
                    durationMinutes: session.durationMinutes,
                    isPersonalized: true
                };
                chatService.io.to(`astrologer:${astro.userId}`).emit('CHAT_REQUEST', requestPayload);
                chatService.io.to(`astrologer:${session.astrologerId}`).emit('CHAT_REQUEST', requestPayload);
                chatService.io.to(`astrologer_${session.astrologerId}`).emit('CHAT_REQUEST', requestPayload);
            }

            // 3. Database Notification ONLY for targeted Astrologer (Audience: 'user', userId: astro.userId)
            await Notification.create({
                recipient: astro.userId,
                recipientType: 'astrologer',
                title: `Re-requested Personalized ${session.serviceType.toUpperCase()}!`,
                message: `User re-sent their paid ${session.durationMinutes} min request. Please accept!`,
                type: 'PERSONALIZED_REQUEST',
                audience: 'user',
                userId: astro.userId,
                metadata: { sessionId: session.sessionId }
            });
        }

        return res.json({ success: true, message: 'Request sent to astrologer again!', session });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getSessionStatusUser = async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        const session = await PersonalizedSession.findOne({ sessionId });
        if (!session) {
            return res.status(404).json({ success: false, message: 'Session not found' });
        }
        return res.json({ success: true, session });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const acceptSession = async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.body;
        const session = await PersonalizedSession.findOne({ sessionId });
        if (!session) {
            return res.status(404).json({ success: false, message: 'Session not found' });
        }

        const remainingSec = (session.remainingDurationSeconds !== undefined && session.remainingDurationSeconds !== null)
            ? session.remainingDurationSeconds
            : (session.durationMinutes * 60);

        session.status = 'ACTIVE';
        session.startTime = new Date();
        session.endTime = new Date(Date.now() + remainingSec * 1000);
        await session.save();

        const astro = await Astrologer.findById(session.astrologerId);
        const astroUserId = astro?.userId || (session.astrologerId as any)?.userId;

        // Emit CHAT_STARTED socket event to User and Astrologer rooms so both apps transition to active screen
        if (chatService.io) {
            const startPayload = {
                sessionId: session.sessionId,
                status: 'ACTIVE',
                startTime: session.startTime.toISOString(),
                endTime: session.endTime.toISOString(),
                durationMinutes: session.durationMinutes,
                remainingDurationSeconds: remainingSec,
                serviceType: session.serviceType,
                sessionType: session.serviceType === 'call' ? 'voice_call' : session.serviceType === 'video' ? 'video_call' : 'chat',
                intakeDetails: session.profileData,
                ratePerMinute: session.basePrice,
                isPersonalized: true
            };

            // Emit to User
            chatService.io.to(`user:${session.userId}`).emit('CHAT_STARTED', startPayload);
            chatService.io.to(`user_${session.userId}`).emit('CHAT_STARTED', startPayload);

            // Emit to Astrologer
            if (astroUserId) {
                chatService.io.to(`astrologer:${astroUserId}`).emit('CHAT_STARTED', startPayload);
                chatService.io.to(`astrologer_${astroUserId}`).emit('CHAT_STARTED', startPayload);
            }
            chatService.io.to(`astrologer:${session.astrologerId}`).emit('CHAT_STARTED', startPayload);
            chatService.io.to(`astrologer_${session.astrologerId}`).emit('CHAT_STARTED', startPayload);
        }

        return res.json({
            success: true,
            message: 'Session accepted and started!',
            session
        });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const missSession = async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.body;
        const session = await PersonalizedSession.findOne({ sessionId })
            .populate('astrologerId', 'firstName lastName')
            .populate('userId', 'name');
        if (!session) {
            return res.status(404).json({ success: false, message: 'Session not found' });
        }

        session.status = 'MISSED';
        session.missedAt = new Date();
        await session.save();

        const astro = await Astrologer.findById(session.astrologerId);
        const astroUserId = astro?.userId || (session.astrologerId as any)?.userId;

        // Send Push & DB Notification ONLY to THAT specific astrologer who missed the request
        if (astroUserId) {
            await Notification.create({
                recipient: astroUserId,
                recipientType: 'astrologer',
                userId: astroUserId,
                audience: 'user',
                title: 'Missed Personalized Request',
                message: `You missed a personalized ${session.serviceType} request (${session.durationMinutes} mins).`,
                type: 'MISSED_PERSONALIZED_REQUEST',
                metadata: { sessionId: session.sessionId, astrologerId: session.astrologerId }
            });

            notificationService.sendToAstrologer(astroUserId.toString(), {
                title: 'Missed Personalized Request',
                body: `You missed a personalized ${session.serviceType} request (${session.durationMinutes} mins).`
            }, {
                type: 'MISSED_PERSONALIZED_REQUEST',
                sessionId: session.sessionId
            }).catch(e => console.error('[Personalized] FCM miss notification failed:', e));
        }

        // Emit CHAT_REJECTED to user socket room
        if (chatService.io) {
            const astroName = (session.astrologerId as any)?.firstName
                ? `${(session.astrologerId as any).firstName} ${(session.astrologerId as any).lastName || ''}`.trim()
                : 'Astrologer';
            chatService.io.to(`user:${session.userId}`).emit('CHAT_REJECTED', {
                sessionId: session.sessionId,
                reason: `${astroName} declined your request. Your paid token is saved!`,
                astrologerName: astroName,
                isPersonalized: true
            });
        }

        return res.json({ success: true, message: 'Session marked as missed and astrologer notified', session });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const completeSession = async (req: Request, res: Response) => {
    try {
        const { sessionId, notes, chatMessages } = req.body;
        const session = await PersonalizedSession.findOne({ sessionId });
        if (!session) {
            return res.status(404).json({ success: false, message: 'Session not found' });
        }

        // Calculate elapsed time from session start
        const now = new Date();
        let sessionElapsedSec = 0;
        if (session.startTime) {
            sessionElapsedSec = Math.max(0, Math.round((now.getTime() - new Date(session.startTime).getTime()) / 1000));
        }

        const totalAllocatedSec = session.durationMinutes * 60;
        const previousUsedSec = session.usedDurationSeconds || 0;
        const totalUsedSec = previousUsedSec + sessionElapsedSec;
        const remainingSec = Math.max(0, totalAllocatedSec - totalUsedSec);

        session.usedDurationSeconds = totalUsedSec;
        session.remainingDurationSeconds = remainingSec;
        session.endTime = now;
        if (notes) session.notes = notes;
        if (chatMessages) session.chatMessages = chatMessages;

        // Calculate earnings pro-rated as per actual duration talked vs total allocated duration
        const commPercentage = session.commissionPercentage || 20;
        const earnedRatio = totalAllocatedSec > 0 ? Math.min(1, totalUsedSec / totalAllocatedSec) : 1;
        const proRatedBasePrice = Math.round((session.basePrice || 0) * earnedRatio * 100) / 100;
        const platformCommission = Math.round(((proRatedBasePrice * commPercentage) / 100) * 100) / 100;
        const netEarningToCredit = Math.max(0, Math.round((proRatedBasePrice - platformCommission) * 100) / 100);

        session.astrologerEarning = netEarningToCredit;
        session.platformCommission = platformCommission;

        const wasCompleted = session.status === 'COMPLETED';

        // Threshold Rule: If remaining time is less than 60 seconds (1 minute), mark COMPLETED
        if (remainingSec < 60) {
            session.status = 'COMPLETED';
        } else {
            // User still has remaining time (e.g., 5 mins) to chat/call with any astrologer
            session.status = 'PAID_PENDING_ACCEPT';
        }

        await session.save();

        // Credit earnings to Astrologer if session completed and not credited before
        if (netEarningToCredit > 0 && session.status === 'COMPLETED' && !wasCompleted) {
            await Astrologer.findByIdAndUpdate(session.astrologerId, {
                $inc: { 
                    personalizedEarnings: netEarningToCredit, 
                    earnings: netEarningToCredit,
                    yearlyGrossEarnings: netEarningToCredit
                }
            });
        }

        return res.json({
            success: true,
            message: session.status === 'COMPLETED'
                ? 'Personalized service completed successfully'
                : `Session ended. ${Math.ceil(remainingSec / 60)} minutes remaining in your paid slot!`,
            session
        });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getActiveTokenUser = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId || (req as any).user?.id;
        if (!userId) {
            return res.json({ success: true, token: null });
        }
        // Find any unredeemed paid session for this user (status: PAID_PENDING_ACCEPT or MISSED)
        const tokenSession = await PersonalizedSession.findOne({
            userId,
            status: { $in: ['PAID_PENDING_ACCEPT', 'MISSED'] },
            $or: [
                { remainingDurationSeconds: { $gte: 60 } },
                { remainingDurationSeconds: null },
                { remainingDurationSeconds: { $exists: false } }
            ]
        }).sort({ createdAt: -1 });

        return res.json({
            success: true,
            token: tokenSession || null
        });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const reassignSessionUser = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId || (req as any).user?.id;
        // FIX Bug 4: Do NOT accept durationMinutes from the request body.
        // The user has already paid for a fixed duration — that allocation must be preserved.
        // Only astrologerId, serviceType, and profileData can change on re-assign.
        const { sessionId, newAstrologerId, serviceType, profileData } = req.body;

        let session = await PersonalizedSession.findOne({ sessionId, userId });
        if (!session) {
            return res.status(404).json({ success: false, message: 'Saved token session not found' });
        }

        if (serviceType && serviceType !== session.serviceType) {
            return res.status(400).json({
                success: false,
                message: `This session was paid for ${session.serviceType.toUpperCase()} service. You cannot switch to ${serviceType.toUpperCase()} using remaining minutes.`
            });
        }

        const astro = await Astrologer.findById(newAstrologerId);
        if (!astro) {
            return res.status(404).json({ success: false, message: 'New astrologer not found' });
        }

        session.astrologerId = newAstrologerId;
        // NOTE: serviceType and durationMinutes are intentionally NOT updated — original paid service allocation is locked.
        if (profileData) session.profileData = profileData;
        session.status = 'PAID_PENDING_ACCEPT';
        session.missedAt = undefined;
        await session.save();

        const userObj = await User.findById(userId);
        const userName = userObj?.name || 'User';

        const remainingSec = session.remainingDurationSeconds ?? (session.durationMinutes * 60);

        // 1. High-Priority Ringing FCM Push to New Astrologer
        notificationService.sendHighPriorityChatRequest(newAstrologerId.toString(), {
            sessionId: session.sessionId,
            userId: userId.toString(),
            userName,
            ratePerMinute: session.basePrice,
            intakeDetails: profileData || session.profileData,
            sessionType: 'personalized_' + session.serviceType,
        }).catch(e => console.error('[Personalized] FCM reassign request failed:', e));

        // 2. Socket.IO CHAT_REQUEST Emit to New Astrologer
        if (chatService.io) {
            const requestPayload = {
                sessionId: session.sessionId,
                userId: userId.toString(),
                userName,
                intakeDetails: profileData || session.profileData,
                ratePerMinute: session.basePrice,
                createdAt: new Date().toISOString(),
                sessionType: 'personalized_' + session.serviceType,
                serviceType: session.serviceType,
                durationMinutes: Math.ceil(remainingSec / 60),
                remainingDurationSeconds: remainingSec,
                isPersonalized: true,
                isFreeTrialSession: false,
                freeTrialDurationSeconds: 0
            };
            chatService.io.to(`astrologer:${astro.userId}`).emit('CHAT_REQUEST', requestPayload);
            chatService.io.to(`astrologer:${newAstrologerId}`).emit('CHAT_REQUEST', requestPayload);
            chatService.io.to(`astrologer_${newAstrologerId}`).emit('CHAT_REQUEST', requestPayload);
        }

        // 3. Database Notification ONLY for targeted Astrologer (Audience: 'user', userId: astro.userId)
        await Notification.create({
            recipient: astro.userId,
            recipientType: 'astrologer',
            title: `New Personalized ${session.serviceType.toUpperCase()} Request!`,
            message: `You have received a paid ${session.durationMinutes} min personalized ${session.serviceType} request. Open dashboard to accept!`,
            type: 'PERSONALIZED_REQUEST',
            audience: 'user',
            userId: astro.userId,
            metadata: { sessionId: session.sessionId, serviceType: session.serviceType, durationMinutes: session.durationMinutes }
        });

        return res.json({
            success: true,
            message: 'Session reassigned and request sent to astrologer!',
            session
        });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getUserPersonalizedHistory = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const sessions = await PersonalizedSession.find({ userId })
            .populate('astrologerId', 'firstName lastName profilePhoto systemKnown specialties rating reviewsCount')
            .sort({ createdAt: -1 })
            .lean();

        return res.json({ success: true, sessions });
    } catch (error: any) {
        console.error('Error fetching user personalized history:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};
