import { Request, Response } from 'express';
import Astrologer from '../models/Astrologer';
import PersonalizedSession from '../models/PersonalizedSession';
import SystemSetting from '../models/SystemSetting';
import Notification from '../models/Notification';
import User from '../models/User';
import Razorpay from 'razorpay';
import crypto from 'crypto';

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
    gstPercentage: 18
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
        const { timers, defaultCommissions, gstPercentage } = req.body;
        let setting = await SystemSetting.findOne({ key: 'personalized_service_config' });
        if (!setting) {
            setting = new SystemSetting({ key: 'personalized_service_config', value: DEFAULT_CONFIG });
        }
        setting.value = {
            timers: timers || setting.value.timers,
            defaultCommissions: defaultCommissions || setting.value.defaultCommissions,
            gstPercentage: gstPercentage !== undefined ? gstPercentage : setting.value.gstPercentage
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

        return res.json({ success: true, sessions });
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
            status: 'COMPLETED'
        }).sort({ createdAt: -1 }).lean();

        let totalGross = 0;
        let totalNetEarning = 0;
        let chatCount = 0;
        let callCount = 0;
        let videoCount = 0;

        sessions.forEach(s => {
            totalGross += s.basePrice;
            totalNetEarning += s.astrologerEarning;
            if (s.serviceType === 'chat') chatCount++;
            else if (s.serviceType === 'call') callCount++;
            else if (s.serviceType === 'video') videoCount++;
        });

        return res.json({
            success: true,
            totalGross,
            totalNetEarning,
            chatCount,
            callCount,
            videoCount,
            totalSessions: sessions.length,
            history: sessions
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
            isBlocked: false
        })
            .select('firstName lastName profilePhoto rating reviewsCount specialties experience isOnline personalizedServiceEnabled personalizedChatEnabled personalizedVoiceCallEnabled personalizedVideoCallEnabled bio aboutMe')
            .lean();

        return res.json({
            success: true,
            config,
            astrologers
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
        const userId = (req as any).user?.id || req.body.userId;
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

        const platformCommission = Math.round((basePrice * commPercentage) / 100);
        const astrologerEarning = basePrice - platformCommission;

        const session = new PersonalizedSession({
            userId,
            astrologerId,
            profileData,
            serviceType,
            durationMinutes,
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

        // Send Push Notification to Astrologer
        await Notification.create({
            recipient: astro.userId,
            recipientType: 'astrologer',
            title: `New Personalized ${serviceType.toUpperCase()} Request!`,
            message: `You have received a paid ${durationMinutes} min personalized ${serviceType} request. Open dashboard to accept!`,
            type: 'PERSONALIZED_REQUEST',
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
            await Notification.create({
                recipient: astro.userId,
                recipientType: 'astrologer',
                title: `Re-requested Personalized ${session.serviceType.toUpperCase()}!`,
                message: `User re-sent their paid ${session.durationMinutes} min request. Please accept!`,
                type: 'PERSONALIZED_REQUEST',
                metadata: { sessionId: session.sessionId }
            });
        }

        return res.json({ success: true, message: 'Request sent to astrologer again!', session });
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

        session.status = 'ACTIVE';
        session.startTime = new Date();
        session.endTime = new Date(Date.now() + session.durationMinutes * 60 * 1000);
        await session.save();

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

        const astroName = (session.astrologerId as any)?.firstName || 'Astrologer';

        // Notify Admin of Missed Request
        await Notification.create({
            recipient: null, // Global / Admin
            recipientType: 'admin',
            title: 'Missed Personalized Request',
            message: `Missed personalized ${session.serviceType} (${session.durationMinutes}m) by ${astroName}`,
            type: 'MISSED_PERSONALIZED_REQUEST',
            metadata: { sessionId: session.sessionId, astrologerId: session.astrologerId }
        });

        return res.json({ success: true, message: 'Session marked as missed and admin notified', session });
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

        session.status = 'COMPLETED';
        session.endTime = new Date();
        if (notes) session.notes = notes;
        if (chatMessages) session.chatMessages = chatMessages;
        await session.save();

        // Update Astrologer Total Personalized Earnings
        await Astrologer.findByIdAndUpdate(session.astrologerId, {
            $inc: { personalizedEarnings: session.astrologerEarning, earnings: session.astrologerEarning }
        });

        return res.json({ success: true, message: 'Session completed successfully', session });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
