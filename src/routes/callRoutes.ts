import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import {
    requestCall,
    acceptCall,
    rejectCall,
    cancelCall,
    endCall,
    getActiveCall,
    getPendingRequests,
    getCallSession,
    getUserCalls
} from '../controllers/callController';

const router = Router();

/**
 * Call Routes
 * All routes require authentication
 */

// User initiates call request
router.post('/request', authMiddleware, requestCall);

// Astrologer accepts/rejects call request
router.post('/accept', authMiddleware, acceptCall);
router.post('/reject', authMiddleware, rejectCall);

// User cancels pending call request
router.post('/cancel', authMiddleware, cancelCall);

// Either party ends call
router.post('/end', authMiddleware, endCall);

// Get current active call session (if any)
router.get('/active', authMiddleware, getActiveCall);

// Get pending request (for astrologer)
router.get('/pending', authMiddleware, getPendingRequests);

// Get call session details
router.get('/session/:sessionId', authMiddleware, getCallSession);

// Get user/astrologer call history
router.get('/sessions', authMiddleware, getUserCalls);

export default router;
