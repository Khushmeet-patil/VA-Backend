import express from 'express';
import { authMiddleware } from '../middleware/auth';
import { getDetailedMatchingReport } from '../controllers/matchingController';

const router = express.Router();

// Protected route for detailed matching report
router.post('/detailed-report', authMiddleware, getDetailedMatchingReport);

export default router;
