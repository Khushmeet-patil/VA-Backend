import express from 'express';
import { applyForAstrologer, getApprovedAstrologers } from '../controllers/astrologerController';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();

// Public route: Get list of approved astrologers
router.get('/list', getApprovedAstrologers);

// Protected route: Apply to become an astrologer
router.post('/apply', authMiddleware, applyForAstrologer);

export default router;
