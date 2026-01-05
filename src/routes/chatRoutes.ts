import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import {
    requestChat,
    acceptChat,
    rejectChat,
    endChat,
    submitReview,
    getSession,
    getChatHistory,
    getActiveSession,
    getPendingRequests,
    getConversation
} from '../controllers/chatController';

const router = Router();

/**
 * Chat Routes
 * All routes require authentication
 */

// User initiates chat request
router.post('/request', authMiddleware, requestChat);

// Astrologer accepts/rejects chat request
router.post('/accept', authMiddleware, acceptChat);
router.post('/reject', authMiddleware, rejectChat);

// Either party ends chat
router.post('/end', authMiddleware, endChat);

// User submits review after chat
router.post('/review', authMiddleware, submitReview);

// Get session details
router.get('/session/:sessionId', authMiddleware, getSession);

// Get chat message history
router.get('/history/:sessionId', authMiddleware, getChatHistory);

// Get current active session (if any)
router.get('/active', authMiddleware, getActiveSession);

// Get pending requests (for astrologers)
router.get('/pending', authMiddleware, getPendingRequests);

// Get conversation messages (all messages between user-astrologer pair)
router.get('/conversation/:partnerId', authMiddleware, getConversation);

export default router;
