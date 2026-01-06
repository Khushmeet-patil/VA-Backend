
import express from 'express';
import { checkUser, sendOtp, verifyOtp, updateProfile, getWalletBalance } from '../controllers/authController';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();

// Auth Routes
router.post('/check-user', checkUser);
router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);
router.post('/update-profile', authMiddleware, updateProfile);
router.get('/wallet-balance', authMiddleware, getWalletBalance);

export default router;
