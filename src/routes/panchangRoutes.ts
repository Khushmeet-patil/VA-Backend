import express from 'express';
import { authMiddleware } from '../middleware/auth';
import panchangController from '../controllers/panchangController';

const router = express.Router();

/**
 * POST /api/panchang/advanced-panchang
 * Protected route to fetch detailed panchang for any given date/location
 */
router.post('/advanced-panchang', authMiddleware, panchangController.getAdvancedPanchang);

export default router;
