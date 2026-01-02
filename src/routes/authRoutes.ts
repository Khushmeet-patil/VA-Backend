
import express from 'express';
import { checkUser, sendOtp, verifyOtp, signup, login, resetPassword } from '../controllers/authController';

const router = express.Router();

router.post('/check-user', checkUser);
router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);
router.post('/signup', signup);
router.post('/login', login);
router.post('/reset-password', resetPassword);

export default router;
