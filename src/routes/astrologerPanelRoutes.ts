import express from 'express';
import {
    checkAstrologer,
    sendAstrologerOtp,
    verifyAstrologerOtp,
    getProfile,
    updateProfile,
    toggleStatus,
    getStats,
    getChats,
    updateChatRate,
    requestWithdrawal,
    getWithdrawalHistory,
    getSessionHistory
} from '../controllers/astrologerPanelController';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();

// Public routes (authentication)
router.post('/check', checkAstrologer);
router.post('/send-otp', sendAstrologerOtp);
router.post('/verify-otp', verifyAstrologerOtp);

// Protected routes (require token)
router.get('/profile', authMiddleware, getProfile);
router.put('/profile', authMiddleware, updateProfile);
router.put('/status', authMiddleware, toggleStatus);
router.put('/rate', authMiddleware, updateChatRate);
router.get('/stats', authMiddleware, getStats);
router.get('/chats', authMiddleware, getChats);

// Withdrawal routes
router.post('/withdraw', authMiddleware, requestWithdrawal);
router.get('/withdrawals', authMiddleware, getWithdrawalHistory);

// Session history route
router.get('/sessions', authMiddleware, getSessionHistory);

export default router;
