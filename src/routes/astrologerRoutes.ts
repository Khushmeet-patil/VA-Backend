import express from 'express';
import {
    applyForAstrologer,
    getApprovedAstrologers,
    getAstrologerProfile,
    getAstrologerReviews,
    followAstrologer,
    unfollowAstrologer,
    checkFollowStatus,
    rateAstrologer,
    getAllSkills
} from '../controllers/astrologerController';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth';

const router = express.Router();

// Public routes
router.get('/list', getApprovedAstrologers);
router.get('/profile/:id', optionalAuthMiddleware, getAstrologerProfile);
router.get('/reviews/:id', getAstrologerReviews);
router.get('/skills', getAllSkills);

// Protected routes
router.post('/apply', authMiddleware, applyForAstrologer);
router.post('/follow', authMiddleware, followAstrologer);
router.post('/unfollow', authMiddleware, unfollowAstrologer);
router.post('/rate', authMiddleware, rateAstrologer);
router.get('/follow-status/:astrologerId', authMiddleware, checkFollowStatus);

export default router;
