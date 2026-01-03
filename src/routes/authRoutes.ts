
import express from 'express';
import { checkUser, sendOtp, verifyOtp, signup, login, resetPassword, getWalletBalance } from '../controllers/authController';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();

router.post('/check-user', checkUser);
router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);
router.post('/signup', signup);
router.post('/login', login);
router.post('/reset-password', resetPassword);

// Protected route - requires authentication
router.get('/wallet-balance', authMiddleware, getWalletBalance);

export default router;
