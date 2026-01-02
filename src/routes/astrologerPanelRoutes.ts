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
    updateChatRate
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

export default router;

