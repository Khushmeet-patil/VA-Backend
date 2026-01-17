
import { Request, Response } from 'express';
import User from '../models/User';
import Astrologer from '../models/Astrologer';
import Transaction from '../models/Transaction';
import Notification from '../models/Notification';

// 1. Dashboard Stats
export const getDashboardStats = async (req: Request, res: Response) => {
    try {
        const totalUsers = await User.countDocuments({ role: 'user' });
        const totalAstrologers = await Astrologer.countDocuments({ status: 'approved' });

        // 1. Total Earnings (Net Company Earnings - defined as Total Transaction Volume for now as comm is 0%)
        const totalEarningsAgg = await Transaction.aggregate([
            { $match: { type: 'debit', status: 'success' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const totalEarnings = totalEarningsAgg[0]?.total || 0;

        // 2. Earnings Trend (Last 6 Months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
        sixMonthsAgo.setDate(1);
        sixMonthsAgo.setHours(0, 0, 0, 0);

        const earningsTrendAgg = await Transaction.aggregate([
            {
                $match: {
                    type: 'debit',
                    status: 'success',
                    createdAt: { $gte: sixMonthsAgo }
                }
            },
            {
                $group: {
                    _id: {
                        month: { $month: "$createdAt" },
                        year: { $year: "$createdAt" }
                    },
                    total: { $sum: "$amount" }
                }
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } }
        ]);

        // Map trend to format: { name: 'JAN', earning: 1000 }
        const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
        const trend = [];
        // Fill in last 6 months even if empty
        for (let i = 0; i < 6; i++) {
            const d = new Date();
            d.setMonth(d.getMonth() - (5 - i));
            const m = d.getMonth() + 1;
            const y = d.getFullYear();

            const found = earningsTrendAgg.find(item => item._id.month === m && item._id.year === y);
            trend.push({
                name: monthNames[m - 1],
                earning: found ? found.total : 0
            });
        }

        // 3. Last Month Earnings (For Growth Calc)
        const lastMonthStart = new Date();
        lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);
        lastMonthStart.setDate(1);
        lastMonthStart.setHours(0, 0, 0, 0);

        const thisMonthStart = new Date();
        thisMonthStart.setDate(1);
        thisMonthStart.setHours(0, 0, 0, 0);

        const lastMonthEarningsAgg = await Transaction.aggregate([
            {
                $match: {
                    type: 'debit',
                    status: 'success',
                    createdAt: { $gte: lastMonthStart, $lt: thisMonthStart }
                }
            },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const lastMonthEarnings = lastMonthEarningsAgg[0]?.total || 0;

        // Calculate Growth %
        const thisMonthEarningsAgg = await Transaction.aggregate([
            {
                $match: {
                    type: 'debit',
                    status: 'success',
                    createdAt: { $gte: thisMonthStart }
                }
            },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const thisMonthEarnings = thisMonthEarningsAgg[0]?.total || 0;

        let growthPercent = 0;
        if (lastMonthEarnings > 0) {
            growthPercent = ((thisMonthEarnings - lastMonthEarnings) / lastMonthEarnings) * 100;
        } else if (thisMonthEarnings > 0) {
            growthPercent = 100;
        }

        const earnings = {
            monthly: totalEarnings, // Total Lifetime Earnings (as requested by 'Net Company Earnings' usually implies total or we can use thisMonth) - let's use Total Lifetime for the Big Card as per common dashboards, or strictly 'monthly' if named that.
            // Wait, the variable 'earnings' in previous mock had 'monthly: 2000'. The frontend uses 'earnings.total' from 'realData.earnings?.monthly'.
            // I should override the key to be clearer or map it correctly.
            // Let's return a structure that matches what frontend expects or update frontend.
            // Frontend expects: stats.earnings.total, stats.earnings.lastMonth, stats.earnings.growth, stats.earnings.trend

            // I will structure the response to match perfectly:
            total: totalEarnings,
            lastMonth: lastMonthEarnings,
            growth: parseFloat(growthPercent.toFixed(1)),
            trend: trend
        };

        const newUsers = {
            daily: await User.countDocuments({ role: 'user', createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
            weekly: await User.countDocuments({ role: 'user', createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }),
            monthly: await User.countDocuments({ role: 'user', createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } })
        };

        const newAstrologers = {
            daily: await Astrologer.countDocuments({ createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
            weekly: await Astrologer.countDocuments({ createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }),
            monthly: await Astrologer.countDocuments({ createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } })
        };

        // Financials
        // Total amount added by users (Credits to wallet)
        const totalAddedByUser = await Transaction.aggregate([
            { $match: { type: 'credit', status: 'success' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);

        // Total amount paid to astrologers (Debits from user wallet to astrologer)
        const totalPaidToAstrologers = await Transaction.aggregate([
            { $match: { type: 'debit', status: 'success', toAstrologer: { $exists: true } } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);

        // Total Payable (Sum of all Astrologer current earnings/wallet balances)
        const totalPayableAgg = await Astrologer.aggregate([
            { $match: { status: 'approved' } }, // Only approved ones? or all? Assuming all valid earnings.
            { $group: { _id: null, total: { $sum: '$earnings' } } }
        ]);
        const totalPayable = totalPayableAgg[0]?.total || 0;

        res.status(200).json({
            success: true,
            data: {
                totalUsers,
                totalAstrologers,
                earnings, // Now contains { total, lastMonth, growth, trend }
                newUsers,
                newAstrologers,
                financials: {
                    totalAddedByUser: totalAddedByUser[0]?.total || 0,
                    totalPaidToAstrologers: totalPaidToAstrologers[0]?.total || 0,
                    totalPayable: totalPayable
                }
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error });
    }
};

// 2. User Management
export const getAllUsers = async (req: Request, res: Response) => {
    try {
        const users = await User.find({ role: 'user' }).sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: users });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error });
    }
};

export const updateUser = async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        const updates = req.body; // Can include isBlocked, walletBalance, etc.

        const user = await User.findByIdAndUpdate(userId, updates, { new: true });
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        res.status(200).json({ success: true, message: 'User updated', data: user });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error });
    }
};

export const getUserActivity = async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        // For now returning transactions as activity
        const transactions = await Transaction.find({ fromUser: userId }).sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: transactions });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error });
    }
};

// Add balance to user wallet (Admin action)
export const addWalletBalance = async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        const { amount, reason } = req.body;

        // Validate amount
        if (!amount || typeof amount !== 'number' || amount <= 0) {
            return res.status(400).json({ success: false, message: 'Valid positive amount is required' });
        }

        // Find user and update wallet balance
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const previousBalance = user.walletBalance || 0;
        // Enforce 2 decimal precision
        const safeAmount = Math.round(amount * 100) / 100;
        const newBalance = Math.round((previousBalance + safeAmount) * 100) / 100;

        // Update user's wallet balance
        user.walletBalance = newBalance;
        await user.save();

        // Create a transaction record for audit trail
        await Transaction.create({
            fromUser: userId,
            type: 'credit',
            amount: amount,
            description: reason || 'Admin added balance',
            status: 'success',
            previousBalance,
            newBalance
        });

        res.status(200).json({
            success: true,
            message: `₹${amount} added to wallet successfully`,
            data: {
                previousBalance,
                amountAdded: amount,
                newBalance,
                user: {
                    _id: user._id,
                    name: user.name,
                    mobile: user.mobile,
                    walletBalance: user.walletBalance
                }
            }
        });
    } catch (error) {
        console.error('Add wallet balance error:', error);
        res.status(500).json({ success: false, message: 'Server Error', error });
    }
};

// Deduct balance from user wallet (Admin action)
export const deductWalletBalance = async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        const { amount, reason } = req.body;

        // Validate amount
        if (!amount || typeof amount !== 'number' || amount <= 0) {
            return res.status(400).json({ success: false, message: 'Valid positive amount is required' });
        }

        // Find user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const previousBalance = user.walletBalance || 0;

        // Check if user has sufficient balance
        if (previousBalance < amount) {
            return res.status(400).json({
                success: false,
                message: `Insufficient balance. Current balance: ₹${previousBalance}`
            });
        }

        // Enforce 2 decimal precision
        const safeAmount = Math.round(amount * 100) / 100;
        const newBalance = Math.round((previousBalance - safeAmount) * 100) / 100;

        // Update user's wallet balance
        user.walletBalance = newBalance;
        await user.save();

        // Create a transaction record for audit trail
        await Transaction.create({
            fromUser: userId,
            type: 'debit',
            amount: amount,
            description: reason || 'Admin deducted balance',
            status: 'success',
            previousBalance,
            newBalance
        });

        res.status(200).json({
            success: true,
            message: `₹${amount} deducted from wallet successfully`,
            data: {
                previousBalance,
                amountDeducted: amount,
                newBalance,
                user: {
                    _id: user._id,
                    name: user.name,
                    mobile: user.mobile,
                    walletBalance: user.walletBalance
                }
            }
        });
    } catch (error) {
        console.error('Deduct wallet balance error:', error);
        res.status(500).json({ success: false, message: 'Server Error', error });
    }
};

// 3. Astrologer Management
export const getAstrologers = async (req: Request, res: Response) => {
    try {
        const { status } = req.query;
        const query = status ? { status } : {};

        const astrologers = await Astrologer.find(query).populate('userId', 'name mobile');
        res.status(200).json({ success: true, data: astrologers });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error });
    }
};

export const updateAstrologerStatus = async (req: Request, res: Response) => {
    try {
        const { astrologerId } = req.params;
        const { status } = req.body; // 'approved' or 'rejected'

        const astrologer = await Astrologer.findByIdAndUpdate(astrologerId, { status }, { new: true });
        if (!astrologer) return res.status(404).json({ success: false, message: 'Astrologer not found' });

        // Also update the User role if approved
        if (status === 'approved') {
            await User.findByIdAndUpdate(astrologer.userId, { role: 'astrologer' });
        }

        res.status(200).json({ success: true, message: 'Astrologer status updated', data: astrologer });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error });
    }
};

// Update Astrologer (block/unblock, price range)
export const updateAstrologer = async (req: Request, res: Response) => {
    try {
        const { astrologerId } = req.params;
        const { isBlocked, priceRangeMin, priceRangeMax, pricePerMin, tag } = req.body;

        const updateData: any = {};
        if (typeof isBlocked === 'boolean') updateData.isBlocked = isBlocked;
        if (typeof priceRangeMin === 'number') updateData.priceRangeMin = priceRangeMin;
        if (typeof priceRangeMax === 'number') updateData.priceRangeMax = priceRangeMax;
        if (typeof pricePerMin === 'number') updateData.pricePerMin = pricePerMin;
        if (tag) updateData.tag = tag;

        const astrologer = await Astrologer.findByIdAndUpdate(astrologerId, updateData, { new: true });
        if (!astrologer) return res.status(404).json({ success: false, message: 'Astrologer not found' });

        res.status(200).json({ success: true, message: 'Astrologer updated', data: astrologer });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error });
    }
};

// Bulk Update Astrologers
export const bulkUpdateAstrologers = async (req: Request, res: Response) => {
    try {
        const { astrologerIds, isBlocked, priceRangeMin, priceRangeMax } = req.body;

        if (!astrologerIds || !Array.isArray(astrologerIds) || astrologerIds.length === 0) {
            return res.status(400).json({ success: false, message: 'astrologerIds array is required' });
        }

        const updateData: any = {};
        if (typeof isBlocked === 'boolean') updateData.isBlocked = isBlocked;
        if (typeof priceRangeMin === 'number') updateData.priceRangeMin = priceRangeMin;
        if (typeof priceRangeMax === 'number') updateData.priceRangeMax = priceRangeMax;

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ success: false, message: 'No update fields provided' });
        }

        const result = await Astrologer.updateMany(
            { _id: { $in: astrologerIds } },
            { $set: updateData }
        );

        res.status(200).json({
            success: true,
            message: `${result.modifiedCount} astrologers updated`,
            modifiedCount: result.modifiedCount
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error });
    }
};

// 4. Notifications
export const createNotification = async (req: Request, res: Response) => {
    try {
        const { title, message, type, audience, userId } = req.body;

        const notification = await Notification.create({
            title,
            message,
            type,
            audience,
            userId: audience === 'user' ? userId : undefined
        });

        res.status(201).json({ success: true, message: 'Notification sent', data: notification });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error });
    }
};

