
import express from 'express';
import { checkUser, sendOtp, verifyOtp, updateProfile, getWalletBalance, getWalletTransactions, registerFcmToken, processRecharge, createOrder, verifyPayment, adminLogin, logoutUser } from '../controllers/authController';
import { authMiddleware, adminMiddleware } from '../middleware/auth';

const router = express.Router();

// Auth Routes
router.post('/check-user', checkUser);
router.post('/admin/login', adminLogin); // Admin Login
router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);
router.post('/logout', authMiddleware, logoutUser); // Logout (clear device ID)
router.post('/update-profile', authMiddleware, updateProfile);
router.get('/wallet-balance', authMiddleware, getWalletBalance);
router.get('/transactions', authMiddleware, getWalletTransactions);
router.post('/fcm-token', authMiddleware, registerFcmToken);
router.post('/recharge', authMiddleware, adminMiddleware, processRecharge); // Restricted to Admin
router.post('/create-order', authMiddleware, createOrder);
router.post('/verify-payment', authMiddleware, verifyPayment);

export default router;
