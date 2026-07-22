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

const router = Router();

// Admin Routes
router.get('/admin/config', getConfig);
router.post('/admin/config', updateConfig);
router.get('/admin/astrologers', getAstrologersAdmin);
router.post('/admin/astrologer-status', updateAstrologerStatusAdmin);
router.get('/admin/history', getSessionHistoryAdmin);
router.get('/admin/live', getLiveSessionsAdmin);
router.get('/admin/missed', getMissedRequestsAdmin);

// Astrologer Routes
router.get('/astrologer/settings', getAstrologerSettings);
router.post('/astrologer/settings', updateAstrologerSettings);
router.get('/astrologer/earnings', getAstrologerEarnings);

// User & Session Routes
router.get('/user/astrologers', getPersonalizedAstrologersUser);
router.post('/user/create-order', createBookingOrder);
router.post('/user/verify-payment', verifyBookingPayment);
router.post('/user/re-request', reRequestSession);

// Session Action Routes
router.post('/session/accept', acceptSession);
router.post('/session/miss', missSession);
router.post('/session/complete', completeSession);

export default router;
