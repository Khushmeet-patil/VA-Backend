import { Router } from 'express';
import {
    getConfig,
    updateConfig,
    getAstrologersAdmin,
    updateAstrologerStatusAdmin,
    getSessionHistoryAdmin,
    getLiveSessionsAdmin,
    getMissedRequestsAdmin,
    getAstrologerSettings,
    updateAstrologerSettings,
    getAstrologerEarnings,
    getPersonalizedAstrologersUser,
    createBookingOrder,
    verifyBookingPayment,
    reRequestSession,
    acceptSession,
    missSession,
    completeSession
} from '../controllers/personalizedController';

import { authMiddleware } from '../middleware/auth';

const router = Router();

// Admin Routes
router.get('/admin/config', getConfig);
router.post('/admin/config', updateConfig);
router.get('/admin/astrologers', getAstrologersAdmin);
router.post('/admin/astrologer-status', updateAstrologerStatusAdmin);
router.get('/admin/history', getSessionHistoryAdmin);
router.get('/admin/live', getLiveSessionsAdmin);
router.get('/admin/missed', getMissedRequestsAdmin);

// Astrologer Routes (require auth)
router.get('/astrologer/settings', authMiddleware, getAstrologerSettings);
router.post('/astrologer/settings', authMiddleware, updateAstrologerSettings);
router.get('/astrologer/earnings', authMiddleware, getAstrologerEarnings);

// User & Session Routes
router.get('/user/astrologers', getPersonalizedAstrologersUser);
router.post('/user/create-order', authMiddleware, createBookingOrder);
router.post('/user/verify-payment', authMiddleware, verifyBookingPayment);
router.post('/user/re-request', authMiddleware, reRequestSession);

// Session Action Routes
router.post('/session/accept', authMiddleware, acceptSession);
router.post('/session/miss', authMiddleware, missSession);
router.post('/session/complete', authMiddleware, completeSession);

export default router;
