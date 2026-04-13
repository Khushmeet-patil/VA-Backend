import express from 'express';
import {
    getGiftItems,
    sendGift,
    getSentGifts,
    getReceivedGifts,
    adminGetGiftItems,
    adminCreateGiftItem,
    adminUpdateGiftItem,
    adminDeleteGiftItem,
    adminGetGiftSettings,
    adminUpdateGiftSettings,
    adminGetGiftTransactions,
} from '../controllers/giftController';
import { authMiddleware, adminMiddleware } from '../middleware/auth';

const router = express.Router();

// ── Public ──────────────────────────────────────────
router.get('/items', getGiftItems);

// ── User (authenticated) ─────────────────────────────
router.post('/send', authMiddleware, sendGift);
router.get('/sent', authMiddleware, getSentGifts);

// ── Astrologer panel ─────────────────────────────────
router.get('/received', authMiddleware, getReceivedGifts);

// ── Admin ─────────────────────────────────────────────
router.get('/admin/items', authMiddleware, adminMiddleware, adminGetGiftItems);
router.post('/admin/items', authMiddleware, adminMiddleware, adminCreateGiftItem);
router.put('/admin/items/:id', authMiddleware, adminMiddleware, adminUpdateGiftItem);
router.delete('/admin/items/:id', authMiddleware, adminMiddleware, adminDeleteGiftItem);
router.get('/admin/settings', authMiddleware, adminMiddleware, adminGetGiftSettings);
router.put('/admin/settings', authMiddleware, adminMiddleware, adminUpdateGiftSettings);
router.get('/admin/transactions', authMiddleware, adminMiddleware, adminGetGiftTransactions);

export default router;
