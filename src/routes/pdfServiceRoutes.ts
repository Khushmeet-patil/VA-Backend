import express from 'express';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import { createPdfOrder, verifyPdfPayment, getPdfOrders, downloadPdfFile } from '../controllers/pdfServiceController';

const router = express.Router();

// User routes (Authenticated)
router.post('/create-order', authMiddleware, createPdfOrder);
router.post('/verify-payment', authMiddleware, verifyPdfPayment);

// Public route to trigger browser file download via attachment headers
router.get('/download-file', downloadPdfFile);

// Admin routes (Admin Authenticated)
router.get('/orders', authMiddleware, adminMiddleware, getPdfOrders);

export default router;
