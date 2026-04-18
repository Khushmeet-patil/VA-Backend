import { Request, Response } from 'express';
import mongoose from 'mongoose';
import GiftItem from '../models/GiftItem';
import GiftTransaction from '../models/GiftTransaction';
import GiftSettings from '../models/GiftSettings';
import User from '../models/User';
import Astrologer from '../models/Astrologer';
import Transaction from '../models/Transaction';
import { AuthRequest } from '../middleware/auth';

// Helper: get or create gift settings
const getGiftSettings = async () => {
    let settings = await GiftSettings.findOne();
    if (!settings) {
        settings = await GiftSettings.create({ commissionPercent: 20 });
    }
    return settings;
};

// ─────────────────────────────────────────────
// PUBLIC / USER ENDPOINTS
// ─────────────────────────────────────────────

// GET /api/gifts/items  — all active gift items (public, no auth needed)
export const getGiftItems = async (req: Request, res: Response) => {
    try {
        const items = await GiftItem.find({ isActive: true }).sort({ sortOrder: 1, amount: 1 });
        const settings = await getGiftSettings();
        res.json({ success: true, data: items, commissionPercent: settings.commissionPercent });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch gift items' });
    }
};

// POST /api/gifts/send  — user sends a gift to astrologer
export const sendGift = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;
        const { astrologerId, giftItemId, sessionId } = req.body;

        if (!astrologerId || !giftItemId) {
            return res.status(400).json({ success: false, message: 'astrologerId and giftItemId are required' });
        }

        // Validate gift item
        const giftItem = await GiftItem.findById(giftItemId);
        if (!giftItem || !giftItem.isActive) {
            return res.status(404).json({ success: false, message: 'Gift item not found or inactive' });
        }

        // Validate astrologer
        const astrologer = await Astrologer.findById(astrologerId);
        if (!astrologer) {
            return res.status(404).json({ success: false, message: 'Astrologer not found' });
        }

        // Re-fetch user with fresh balance using findOneAndUpdate with optimistic check
        // This prevents double-spend: only deduct if balance is sufficient
        const giftAmount = giftItem.amount;

        // Deduct ONLY from real wallet — bonus money NOT allowed for gifts
        const updatedUser = await User.findOneAndUpdate(
            { _id: userId, walletBalance: { $gte: giftAmount } },
            { $inc: { walletBalance: -giftAmount } },
            { new: true }
        );

        if (!updatedUser) {
            const user = await User.findById(userId);
            return res.status(400).json({
                success: false,
                message: 'Insufficient wallet balance. Gifts can only be sent using real money.',
                code: 'INSUFFICIENT_BALANCE',
                required: giftAmount,
                available: user?.walletBalance || 0,
            });
        }

        let deductFromReal = giftAmount;
        let deductFromBonus = 0;

        // Calculate commission
        const settings = await getGiftSettings();
        const commissionPercent = settings.commissionPercent;
        const commissionAmount = Math.round((giftAmount * commissionPercent) / 100);
        const astrologerAmount = giftAmount - commissionAmount;

        // Get current financial year start date for yearly gift earnings tracking
        const now = new Date();
        const currentFYStart = new Date(now.getFullYear(), 3, 1);
        if (now.getMonth() < 3) currentFYStart.setFullYear(now.getFullYear() - 1);

        // Fetch fresh astrologer data for yearly tracking
        const freshAstrologer = await Astrologer.findById(astrologerId);
        if (!freshAstrologer) {
            return res.status(404).json({ success: false, message: 'Astrologer not found' });
        }

        // Check if we need to reset yearly gift earnings (new financial year)
        let fyResetUpdate: any = {};
        if (!freshAstrologer.yearlyEarningsStartDate || new Date(freshAstrologer.yearlyEarningsStartDate) < currentFYStart) {
            fyResetUpdate = {
                yearlyEarningsStartDate: currentFYStart,
                yearlyGiftEarnings: 0
            };
        }

        // Credit astrologer gift earnings (NOT included in TDS calculation)
        await Astrologer.findByIdAndUpdate(astrologerId, {
            $inc: {
                giftEarnings: astrologerAmount,
                yearlyGiftEarnings: astrologerAmount
            },
            $set: {
                yearlyEarningsStartDate: fyResetUpdate.yearlyEarningsStartDate || freshAstrologer.yearlyEarningsStartDate
            }
        });

        // Record gift transaction
        const giftTx = await GiftTransaction.create({
            fromUser: userId,
            toAstrologer: astrologerId,
            giftItem: giftItemId,
            giftName: giftItem.name,
            giftEmoji: giftItem.emoji,
            amount: giftAmount,
            commissionPercent,
            commissionAmount,
            astrologerAmount,
            sessionId: sessionId || undefined,
        });

        // Record in Transaction history for user expense history (DEBIT)
        // Record debit in user's transaction history
        await Transaction.create({
            fromUser: userId,
            toAstrologer: astrologerId,
            amount: giftAmount,
            type: 'debit',
            status: 'success',
            description: `Gift sent: ${giftItem.emoji} ${giftItem.name} to ${astrologer.firstName} ${astrologer.lastName}`,
        });
        // Note: No separate credit Transaction for the astrologer — GiftTransaction already
        // records the full breakdown (astrologerAmount, commissionAmount). Creating a credit
        // Transaction with fromUser = userId would pollute the user's wallet history.

        // Verify the update actually happened
        const verifyAstrologer = await Astrologer.findById(astrologerId);
        if (!verifyAstrologer || verifyAstrologer.giftEarnings < astrologerAmount) {
            console.error(`[Gift] VERIFICATION FAILED: Gift earnings not properly credited for astrologer ${astrologerId}`);
        } else {
            console.log(`[Gift] VERIFIED: Astrologer ${astrologerId} now has giftEarnings: ₹${verifyAstrologer.giftEarnings}`);
        }

        res.json({
            success: true,
            message: `${giftItem.emoji} ${giftItem.name} sent successfully!`,
            data: {
                giftTransaction: giftTx,
                newWalletBalance: updatedUser.walletBalance || 0,
                newBonusBalance: updatedUser.bonusBalance || 0,
            }
        });

    } catch (error) {
        console.error('[Gift] sendGift error:', error);
        res.status(500).json({ success: false, message: 'Failed to send gift' });
    }
};

// GET /api/gifts/sent  — user's sent gift history
export const getSentGifts = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;

        const gifts = await GiftTransaction.find({ fromUser: userId })
            .populate('toAstrologer', 'firstName lastName profilePhoto')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        const total = await GiftTransaction.countDocuments({ fromUser: userId });

        // Summary stats
        const stats = await GiftTransaction.aggregate([
            { $match: { fromUser: new mongoose.Types.ObjectId(userId) } },
            {
                $group: {
                    _id: null,
                    totalSpent: { $sum: '$amount' },
                    totalGifts: { $sum: 1 },
                }
            }
        ]);

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayStats = await GiftTransaction.aggregate([
            {
                $match: {
                    fromUser: new mongoose.Types.ObjectId(userId),
                    createdAt: { $gte: todayStart }
                }
            },
            { $group: { _id: null, todaySpent: { $sum: '$amount' }, todayCount: { $sum: 1 } } }
        ]);

        res.json({
            success: true,
            data: {
                gifts,
                pagination: { page, limit, total, pages: Math.ceil(total / limit) },
                summary: {
                    totalSpent: stats[0]?.totalSpent || 0,
                    totalGifts: stats[0]?.totalGifts || 0,
                    todaySpent: todayStats[0]?.todaySpent || 0,
                    todayCount: todayStats[0]?.todayCount || 0,
                }
            }
        });
    } catch (error) {
        console.error('[Gift] getSentGifts error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch gift history' });
    }
};

// ─────────────────────────────────────────────
// ASTROLOGER PANEL ENDPOINTS
// ─────────────────────────────────────────────

// GET /api/gifts/received  — astrologer's received gift history
export const getReceivedGifts = async (req: AuthRequest, res: Response) => {
    try {
        const astrologerId = req.userId!;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;

        const gifts = await GiftTransaction.find({ toAstrologer: astrologerId })
            .populate('fromUser', 'name mobile')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        const total = await GiftTransaction.countDocuments({ toAstrologer: astrologerId });

        // Summary
        const stats = await GiftTransaction.aggregate([
            { $match: { toAstrologer: new mongoose.Types.ObjectId(astrologerId) } },
            {
                $group: {
                    _id: null,
                    totalReceived: { $sum: '$amount' },
                    totalEarned: { $sum: '$astrologerAmount' },
                    totalGifts: { $sum: 1 },
                }
            }
        ]);

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayStats = await GiftTransaction.aggregate([
            {
                $match: {
                    toAstrologer: new mongoose.Types.ObjectId(astrologerId),
                    createdAt: { $gte: todayStart }
                }
            },
            {
                $group: {
                    _id: null,
                    todayReceived: { $sum: '$amount' },
                    todayEarned: { $sum: '$astrologerAmount' },
                    todayCount: { $sum: 1 },
                }
            }
        ]);

        res.json({
            success: true,
            data: {
                gifts,
                pagination: { page, limit, total, pages: Math.ceil(total / limit) },
                summary: {
                    totalReceived: stats[0]?.totalReceived || 0,
                    totalEarned: stats[0]?.totalEarned || 0,
                    totalGifts: stats[0]?.totalGifts || 0,
                    todayReceived: todayStats[0]?.todayReceived || 0,
                    todayEarned: todayStats[0]?.todayEarned || 0,
                    todayCount: todayStats[0]?.todayCount || 0,
                }
            }
        });
    } catch (error) {
        console.error('[Gift] getReceivedGifts error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch received gifts' });
    }
};

// ─────────────────────────────────────────────
// ADMIN ENDPOINTS
// ─────────────────────────────────────────────

export const adminGetGiftItems = async (req: Request, res: Response) => {
    try {
        const items = await GiftItem.find().sort({ sortOrder: 1, amount: 1 });
        const settings = await getGiftSettings();
        res.json({ success: true, data: items, commissionPercent: settings.commissionPercent });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch gift items' });
    }
};

export const adminCreateGiftItem = async (req: Request, res: Response) => {
    try {
        const { name, emoji, amount, isActive, sortOrder } = req.body;
        if (!name || !amount) {
            return res.status(400).json({ success: false, message: 'name and amount are required' });
        }
        const item = await GiftItem.create({ name, emoji: emoji || '🎁', amount, isActive: isActive !== false, sortOrder: sortOrder || 0 });
        res.status(201).json({ success: true, data: item });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to create gift item' });
    }
};

export const adminUpdateGiftItem = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const item = await GiftItem.findByIdAndUpdate(id, req.body, { new: true });
        if (!item) return res.status(404).json({ success: false, message: 'Gift item not found' });
        res.json({ success: true, data: item });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update gift item' });
    }
};

export const adminDeleteGiftItem = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await GiftItem.findByIdAndDelete(id);
        res.json({ success: true, message: 'Gift item deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to delete gift item' });
    }
};

export const adminGetGiftSettings = async (req: Request, res: Response) => {
    try {
        const settings = await getGiftSettings();
        res.json({ success: true, data: settings });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch gift settings' });
    }
};

export const adminUpdateGiftSettings = async (req: Request, res: Response) => {
    try {
        const { commissionPercent } = req.body;
        if (commissionPercent === undefined || commissionPercent < 0 || commissionPercent > 100) {
            return res.status(400).json({ success: false, message: 'commissionPercent must be 0–100' });
        }
        let settings = await GiftSettings.findOne();
        if (!settings) {
            settings = await GiftSettings.create({ commissionPercent });
        } else {
            settings.commissionPercent = commissionPercent;
            await settings.save();
        }
        res.json({ success: true, data: settings });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update gift settings' });
    }
};

export const adminGetGiftTransactions = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 30;

        const gifts = await GiftTransaction.find()
            .populate('fromUser', 'name mobile')
            .populate('toAstrologer', 'firstName lastName')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        const total = await GiftTransaction.countDocuments();

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const statsAgg = await GiftTransaction.aggregate([
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: '$amount' },
                    totalCommission: { $sum: '$commissionAmount' },
                    totalCount: { $sum: 1 },
                }
            }
        ]);

        const todayAgg = await GiftTransaction.aggregate([
            { $match: { createdAt: { $gte: todayStart } } },
            {
                $group: {
                    _id: null,
                    todayAmount: { $sum: '$amount' },
                    todayCommission: { $sum: '$commissionAmount' },
                    todayCount: { $sum: 1 },
                }
            }
        ]);

        res.json({
            success: true,
            data: {
                gifts,
                pagination: { page, limit, total, pages: Math.ceil(total / limit) },
                stats: {
                    totalAmount: statsAgg[0]?.totalAmount || 0,
                    totalCommission: statsAgg[0]?.totalCommission || 0,
                    totalCount: statsAgg[0]?.totalCount || 0,
                    todayAmount: todayAgg[0]?.todayAmount || 0,
                    todayCommission: todayAgg[0]?.todayCommission || 0,
                    todayCount: todayAgg[0]?.todayCount || 0,
                }
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch gift transactions' });
    }
};
