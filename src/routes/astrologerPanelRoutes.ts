import express from 'express';
import {
    checkAstrologer,
    sendAstrologerOtp,
    verifyAstrologerOtp,
    logoutAstrologer,
    getProfile,
    updateProfile,
    toggleStatus,
    getStats,
    getChats,
    updateChatRate,
    requestWithdrawal,
    getWithdrawalHistory,
    getSessionHistory,
    getPanelReviews,
    getUserProfileForAstrologer,
    requestAccountDeletion,
    getTodayHours,
    getNotificationTemplates,
    getAstrologerAudience,
    sendPersonalizedNotification
} from '../controllers/astrologerPanelController';
import {
    getSchedule,
    updateSchedule
} from '../controllers/astrologerController';
import { authMiddleware } from '../middleware/auth';
import { getPrewrittenMessages } from '../controllers/prewrittenMessageController';

import heartbeatService from '../services/heartbeatService';

const router = express.Router();

// Public routes (authentication)
router.post('/check', checkAstrologer);
router.post('/send-otp', sendAstrologerOtp);
router.post('/verify-otp', verifyAstrologerOtp);
router.post('/heartbeat-ping', async (req, res) => {
    try {
        const { astrologerId } = req.body;
        if (!astrologerId) {
            return res.status(400).json({ success: false, message: 'astrologerId is required' });
        }
        heartbeatService.resolvePing(astrologerId);
        await heartbeatService.registerHeartbeat(astrologerId);
        await heartbeatService.restoreOnlineStatus(astrologerId);
        return res.status(200).json({ success: true });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
});
router.post('/logout', authMiddleware, logoutAstrologer); // Logout (clear device ID)
router.post('/request-deletion', authMiddleware, requestAccountDeletion); // Request Account Deletion

// Protected routes (require token)
router.get('/profile', authMiddleware, getProfile);
router.put('/profile', authMiddleware, updateProfile);
router.put('/status', authMiddleware, toggleStatus);
router.put('/rate', authMiddleware, updateChatRate);
router.get('/stats', authMiddleware, getStats);
router.get('/chats', authMiddleware, getChats);
router.get('/reviews', authMiddleware, getPanelReviews);
router.get('/today-hours', authMiddleware, getTodayHours);

// Notification routes
router.get('/notification-templates', authMiddleware, getNotificationTemplates);
router.get('/audience', authMiddleware, getAstrologerAudience);
router.post('/send-notification', authMiddleware, sendPersonalizedNotification);

// Withdrawal routes
router.post('/withdraw', authMiddleware, requestWithdrawal);
router.get('/withdrawals', authMiddleware, getWithdrawalHistory);

// Session history route
// Session history route
router.get('/sessions', authMiddleware, getSessionHistory);

// Get User Profile for Chat
router.get('/user-profile/:userId/:profileId?', authMiddleware, getUserProfileForAstrologer);

// Prewritten Messages
router.get('/prewritten-messages', authMiddleware, getPrewrittenMessages);

// Schedule routes (Explicitly redefined)
router.get('/schedule', authMiddleware, getSchedule);
router.put('/schedule', authMiddleware, updateSchedule);

// Settings
import { getSettingByKey } from '../controllers/systemSettingController';
router.get('/settings/:key', getSettingByKey);

export default router;
