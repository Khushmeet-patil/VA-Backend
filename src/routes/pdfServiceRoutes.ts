import express from 'express';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import { createPdfOrder, verifyPdfPayment, getPdfOrders } from '../controllers/pdfServiceController';

const router = express.Router();

// User routes (Authenticated)
router.post('/create-order', authMiddleware, createPdfOrder);
router.post('/verify-payment', authMiddleware, verifyPdfPayment);

// Admin routes (Admin Authenticated)
router.get('/orders', authMiddleware, adminMiddleware, getPdfOrders);

export default router;
