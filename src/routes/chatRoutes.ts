import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import {
    requestChat,
    acceptChat,
    rejectChat,
    cancelChat,
    endChat,
    submitReview,
    getSession,
    getChatHistory,
    getActiveSession,
    getPendingRequests,
    getConversation,
    getUserSessions
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

// User cancels pending chat request
router.post('/cancel', authMiddleware, cancelChat);

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

// Get all user sessions (for history screen)
router.get('/sessions', authMiddleware, getUserSessions);

// Get pending requests (for astrologers)
router.get('/pending', authMiddleware, getPendingRequests);

// Get conversation messages (all messages between user-astrologer pair)
router.get('/conversation/:partnerId', authMiddleware, getConversation);

export default router;
