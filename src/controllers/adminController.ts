
import { Request, Response } from 'express';
import mongoose from 'mongoose';
import User from '../models/User';
import Astrologer from '../models/Astrologer';
import Transaction from '../models/Transaction';
import ChatSession from '../models/ChatSession'; // Added import
import Withdrawal from '../models/Withdrawal'; // Added import
import Notification from '../models/Notification';
import ChatReview from '../models/ChatReview';
import AstrologerFollower from '../models/AstrologerFollower';
import Banner from '../models/Banner';
import StartPopup from '../models/StartPopup';
import Skill from '../models/Skill';
import ProfileChangeRequest from '../models/ProfileChangeRequest';
import PaymentBatch from '../models/PaymentBatch';
import chatService from '../services/chatService';
import { uploadBase64ToR2, deleteFromR2, getKeyFromUrl, moveFileInR2 } from '../services/r2Service';
import notificationService from '../services/notificationService';
import scheduledNotificationService from '../services/scheduledNotificationService';
import ChatMessage from '../models/ChatMessage';
import DeletionRequest from '../models/DeletionRequest';


// 1. Dashboard Stats
export const getDashboardStats = async (req: Request, res: Response) => {
    try {
        // --- DATE NORMALIZATION TO IST (Asia/Kolkata) ---
        const getISTDate = () => new Date(new Date().getTime() + (5.5 * 60 * 60 * 1000));
        
        const nowIST = getISTDate();
        const todayStartIST = new Date(nowIST);
        todayStartIST.setUTCHours(0, 0, 0, 0);
        const todayStart = new Date(todayStartIST.getTime() - (5.5 * 60 * 60 * 1000));

        const thisMonthStartIST = new Date(nowIST);
        thisMonthStartIST.setUTCDate(1);
        thisMonthStartIST.setUTCHours(0, 0, 0, 0);
        const thisMonthStart = new Date(thisMonthStartIST.getTime() - (5.5 * 60 * 60 * 1000));

        const lastMonthStartIST = new Date(thisMonthStartIST);
        lastMonthStartIST.setUTCMonth(lastMonthStartIST.getUTCMonth() - 1);
        const lastMonthStart = new Date(lastMonthStartIST.getTime() - (5.5 * 60 * 60 * 1000));

        const sevenDaysAgo = new Date(new Date().getTime() - (7 * 24 * 60 * 60 * 1000));
        const thirtyDaysAgo = new Date(new Date().getTime() - (30 * 24 * 60 * 60 * 1000));

        // 2. Earnings Trend (Last 6 Months Start Date)
        const sixMonthsAgo = new Date(thisMonthStart);
        sixMonthsAgo.setUTCMonth(sixMonthsAgo.getUTCMonth() - 5);
        sixMonthsAgo.setUTCDate(1);
        sixMonthsAgo.setUTCHours(0, 0, 0, 0);

        // ------------------------------------------------

        const totalUsers = await User.countDocuments({ role: 'user' });

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
            const d = new Date(thisMonthStartIST);
            d.setUTCMonth(d.getUTCMonth() - (5 - i));
            const m = d.getUTCMonth() + 1;
            const y = d.getUTCFullYear();

            const found = earningsTrendAgg.find(item => item._id.month === m && item._id.year === y);
            trend.push({
                name: monthNames[m - 1] + (y % 100), // e.g., MAR26
                earning: found ? found.total : 0
            });
        }


        const totalAstrologers = await Astrologer.countDocuments();

        // 1. Total Earnings
        const totalEarningsAgg = await Transaction.aggregate([
            { $match: { type: 'debit', status: 'success' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const totalEarnings = totalEarningsAgg[0]?.total || 0;

        // Total Earnings

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

        // Statistics for dashboard (Calculated above)
        const newUsers = {
            daily: await User.countDocuments({ role: 'user', createdAt: { $gte: todayStart } }),
            weekly: await User.countDocuments({ role: 'user', createdAt: { $gte: sevenDaysAgo } }),
            monthly: await User.countDocuments({ role: 'user', createdAt: { $gte: thirtyDaysAgo } })
        };

        // Astrologer stats
        const newAstrologers = {
            daily: await Astrologer.countDocuments({ createdAt: { $gte: todayStart } }),
            weekly: await Astrologer.countDocuments({ createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }),
            monthly: await Astrologer.countDocuments({ createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } })
        };

        // Calculate User Growth (%) - This month vs Last Month
        const thisMonthUsers = await User.countDocuments({ role: 'user', createdAt: { $gte: thisMonthStart } });
        const lastMonthUsers = await User.countDocuments({ role: 'user', createdAt: { $gte: lastMonthStart, $lt: thisMonthStart } });
        let userGrowth = 0;
        if (lastMonthUsers > 0) userGrowth = Math.round(((thisMonthUsers - lastMonthUsers) / lastMonthUsers) * 100);
        else if (thisMonthUsers > 0) userGrowth = 100;

        // Calculate Astrologer Growth (%)
        const thisMonthAstros = await Astrologer.countDocuments({ createdAt: { $gte: thisMonthStart } });
        const lastMonthAstros = await Astrologer.countDocuments({ createdAt: { $gte: lastMonthStart, $lt: thisMonthStart } });
        let astroGrowth = 0;
        if (lastMonthAstros > 0) astroGrowth = Math.round(((thisMonthAstros - lastMonthAstros) / lastMonthAstros) * 100);
        else if (thisMonthAstros > 0) astroGrowth = 100;

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

        // Prevent caching for real-time dashboard stats
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');

        res.status(200).json({
            success: true,
            data: {
                totalUsers,
                totalAstrologers,
                earnings,
                newUsers,
                newAstrologers,
                userGrowth,
                astroGrowth,
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
        
        // --- DATE NORMALIZATION TO IST (Asia/Kolkata) ---
        const getISTDate = () => new Date(new Date().getTime() + (5.5 * 60 * 60 * 1000));
        const nowIST = getISTDate();
        const todayStartIST = new Date(nowIST);
        todayStartIST.setUTCHours(0, 0, 0, 0);
        const todayStart = new Date(todayStartIST.getTime() - (5.5 * 60 * 60 * 1000));

        const thisMonthStartIST = new Date(nowIST);
        thisMonthStartIST.setUTCDate(1);
        thisMonthStartIST.setUTCHours(0, 0, 0, 0);
        const firstDayOfMonth = new Date(thisMonthStartIST.getTime() - (5.5 * 60 * 60 * 1000));

        const lastMonthStartIST = new Date(thisMonthStartIST);
        lastMonthStartIST.setUTCMonth(lastMonthStartIST.getUTCMonth() - 1);
        const firstDayOfLastMonth = new Date(lastMonthStartIST.getTime() - (5.5 * 60 * 60 * 1000));
        // ------------------------------------------------

        const newToday = users.filter(u => u.createdAt && new Date(u.createdAt) >= todayStart).length;
        
        const thisMonth = users.filter(u => u.createdAt && new Date(u.createdAt) >= firstDayOfMonth).length;
        const lastMonth = users.filter(u => u.createdAt && new Date(u.createdAt) >= firstDayOfLastMonth && new Date(u.createdAt) < firstDayOfMonth).length;
        
        let growth = 0;
        if (lastMonth > 0) growth = Math.round(((thisMonth - lastMonth) / lastMonth) * 100);
        else if (thisMonth > 0) growth = 100;

        res.status(200).json({ 
            success: true, 
            data: users,
            stats: {
                total: users.length,
                newToday,
                growth
            }
        });
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

        // If user was just blocked, handle real-time effects
        if (updates.isBlocked === true) {
            console.log(`[Admin] User ${userId} blocked. Handling real-time effects...`);

            // 1. Emit USER_BLOCKED socket event for instant UI update
            if (chatService.io) {
                chatService.io.to(`user:${userId}`).emit('USER_BLOCKED', {
                    reason: 'Your account has been suspended by the administrator.'
                });
                console.log(`[Admin] USER_BLOCKED event emitted to user:${userId}`);
            }

            // 2. Send FCM push notification (works even if app is in background/killed)
            try {
                if (user.fcmToken) {
                    await notificationService.sendToUser(userId, {
                        title: 'Account Suspended',
                        body: 'Your account has been suspended. Please contact support for more information.'
                    }, { type: 'account_blocked' });
                    console.log(`[Admin] FCM notification sent to blocked user ${userId}`);
                }
            } catch (fcmErr) {
                console.error(`[Admin] Failed to send FCM to blocked user:`, fcmErr);
            }

            // 3. Force-end any active chat session
            try {
                const activeSession = await ChatSession.findOne({
                    userId,
                    status: 'ACTIVE'
                });
                if (activeSession) {
                    console.log(`[Admin] Force-ending active session ${activeSession.sessionId} for blocked user ${userId}`);
                    await chatService.endChat(activeSession.sessionId, 'USER_END');
                }
            } catch (chatErr) {
                console.error(`[Admin] Failed to end active chat for blocked user:`, chatErr);
            }
        }

        res.status(200).json({ success: true, message: 'User updated', data: user });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error });
    }
};

export const clearUserDevice = async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;

        const user = await User.findByIdAndUpdate(
            userId,
            { $unset: { activeDeviceId: 1 } },
            { new: true }
        );

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.status(200).json({ success: true, message: 'User device cleared successfully', data: user });
    } catch (error) {
        console.error('Clear User Device error:', error);
        res.status(500).json({ success: false, message: 'Server Error', error });
    }
};

export const clearAstrologerDevice = async (req: Request, res: Response) => {
    try {
        const { astrologerId } = req.params;

        const astrologer = await Astrologer.findByIdAndUpdate(
            astrologerId,
            { $unset: { activeDeviceId: 1 } },
            { new: true }
        );

        if (!astrologer) {
            return res.status(404).json({ success: false, message: 'Astrologer not found' });
        }

        res.status(200).json({ success: true, message: 'Astrologer device cleared successfully', data: astrologer });
    } catch (error) {
        console.error('Clear Astrologer Device error:', error);
        res.status(500).json({ success: false, message: 'Server Error', error });
    }
};

export const getUserActivity = async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;

        // 1. Fetch Transactions
        const transactions = await Transaction.find({ fromUser: userId }).lean();

        // 2. Fetch Chat Sessions
        const chatSessions = await ChatSession.find({ userId }).populate('astrologerId', 'firstName lastName').lean();

        // 3. Combine and Sort
        const activity = [
            ...transactions.map(t => ({ ...t, activityType: 'transaction' })),
            ...chatSessions.map(c => ({
                ...c,
                activityType: 'chat_session',
                amount: c.totalAmount, // Map for UI consistency
                type: 'debit', // Chats are debits
                status: c.status === 'ENDED' ? 'success' : c.status.toLowerCase(),
                description: `Chat with ${c.astrologerId ? (c.astrologerId as any).firstName : 'Astrologer'}`,
                createdAt: c.createdAt
            }))
        ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        res.status(200).json({ success: true, data: activity });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error });
    }
};

export const getUserDetails = async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        const user = await User.findById(userId).lean();
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        // Calculate Stats
        // 1. Total Chat Time
        const chatSessions = await ChatSession.find({ userId: userId, status: 'ENDED' });
        const totalChatTime = chatSessions.reduce((sum, session) => sum + (session.totalMinutes || 0), 0);

        // 2. Total Spent (Sum of all successful debit transactions including chats)
        const totalSpentAgg = await Transaction.aggregate([
            { $match: { fromUser: new mongoose.Types.ObjectId(userId), type: 'debit', status: 'success' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const totalSpent = totalSpentAgg[0]?.total || 0;

        // --- IST Date Normalization ---
        const istOffset = 5.5 * 60 * 60 * 1000;
        const nowIST = new Date(new Date().getTime() + istOffset);
        const thisMonthStartIST = new Date(nowIST);
        thisMonthStartIST.setUTCDate(1);
        thisMonthStartIST.setUTCHours(0, 0, 0, 0);
        const thisMonthStart = new Date(thisMonthStartIST.getTime() - istOffset);

        const lastMonthStartIST = new Date(thisMonthStartIST);
        lastMonthStartIST.setUTCMonth(lastMonthStartIST.getUTCMonth() - 1);
        const lastMonthStart = new Date(lastMonthStartIST.getTime() - istOffset);

        // Calculate Spent Growth (%)
        const thisMonthSpentAgg = await Transaction.aggregate([
            { $match: { fromUser: new mongoose.Types.ObjectId(userId), type: 'debit', status: 'success', createdAt: { $gte: thisMonthStart } } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const lastMonthSpentAgg = await Transaction.aggregate([
            { $match: { fromUser: new mongoose.Types.ObjectId(userId), type: 'debit', status: 'success', createdAt: { $gte: lastMonthStart, $lt: thisMonthStart } } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);

        const thisMonthSpent = thisMonthSpentAgg[0]?.total || 0;
        const lastMonthSpent = lastMonthSpentAgg[0]?.total || 0;
        let spentGrowth = 0;
        if (lastMonthSpent > 0) spentGrowth = Math.round(((thisMonthSpent - lastMonthSpent) / lastMonthSpent) * 100);
        else if (thisMonthSpent > 0) spentGrowth = 100;

        // 3. Last Active (Most recent activity)
        const lastTransaction = await Transaction.findOne({ fromUser: userId }).sort({ createdAt: -1 });
        const lastChat = await ChatSession.findOne({ userId: userId }).sort({ createdAt: -1 });
        
        let lastActive = user.createdAt;
        if (lastTransaction && lastChat) {
            lastActive = lastTransaction.createdAt > lastChat.createdAt ? lastTransaction.createdAt : lastChat.createdAt;
        } else if (lastTransaction) {
            lastActive = lastTransaction.createdAt;
        } else if (lastChat) {
            lastActive = lastChat.createdAt;
        }

        res.status(200).json({
            success: true,
            data: {
                ...user,
                stats: {
                    totalChatTime,
                    totalSpent,
                    spentGrowth,
                    lastActive
                }
            }
        });
    } catch (error) {
        console.error('getUserDetails error:', error);
        res.status(500).json({ success: false, message: 'Server Error', error });
    }
};

export const getChatSessionMessages = async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        const messages = await ChatMessage.find({ sessionId }).sort({ timestamp: 1 });
        res.status(200).json({ success: true, data: messages });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error });
    }
};

export const getUserReviews = async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        const reviews = await ChatReview.find({ userId: userId })
            .populate({
                path: 'astrologerId',
                select: 'firstName lastName profilePhoto'
            })
            .sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: reviews });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error });
    }
};

export const getUserFollows = async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        const follows = await AstrologerFollower.find({ userId: userId })
            .populate({
                path: 'astrologerId',
                select: 'firstName lastName profilePhoto specialties experience rating followersCount'
            })
            .sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: follows });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error });
    }
};

export const deleteReview = async (req: Request, res: Response) => {
    try {
        const { reviewId } = req.params;
        const review = await ChatReview.findById(reviewId);

        if (!review) {
            return res.status(404).json({ success: false, message: 'Review not found' });
        }

        if (review.astrologerId) {
            const astrologerId = review.astrologerId.toString();
            await ChatReview.findByIdAndDelete(reviewId);
            // Recalculate astrologer rating
            await chatService.updateAstrologerAverageRating(astrologerId);
        } else {
            await ChatReview.findByIdAndDelete(reviewId);
        }

        res.status(200).json({ success: true, message: 'Review deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error });
    }
};

// Add balance to user wallet (Admin action)
export const addWalletBalance = async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        const { amount, reason, type = 'real' } = req.body; // type: 'real' | 'bonus'

        // Validate amount
        if (!amount || typeof amount !== 'number' || amount <= 0) {
            return res.status(400).json({ success: false, message: 'Valid positive amount is required' });
        }

        // Find user and update wallet balance
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const isBonus = type === 'bonus';
        const previousBalance = isBonus ? (user.bonusBalance || 0) : (user.walletBalance || 0);

        // Enforce 2 decimal precision
        const safeAmount = Math.round(amount * 100) / 100;
        const newBalance = Math.round((previousBalance + safeAmount) * 100) / 100;

        // Update user's wallet balance
        if (isBonus) {
            user.bonusBalance = newBalance;
        } else {
            user.walletBalance = newBalance;
        }
        await user.save();

        // Create a transaction record for audit trail
        await Transaction.create({
            fromUser: userId,
            type: 'credit',
            amount: amount,
            description: reason || (isBonus ? 'Admin added bonus' : 'Admin added balance'),
            status: 'success',
            previousBalance,
            newBalance,
            meta: { walletType: type }
        });

        res.status(200).json({
            success: true,
            message: `₹${amount} added to ${isBonus ? 'bonus' : 'real'} wallet successfully`,
            data: {
                previousBalance,
                amountAdded: amount,
                newBalance,
                walletType: type,
                user: {
                    _id: user._id,
                    name: user.name,
                    mobile: user.mobile,
                    walletBalance: user.walletBalance,
                    bonusBalance: user.bonusBalance
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
        const { amount, reason, type = 'real' } = req.body; // type: 'real' | 'bonus'

        // Validate amount
        if (!amount || typeof amount !== 'number' || amount <= 0) {
            return res.status(400).json({ success: false, message: 'Valid positive amount is required' });
        }

        // Find user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const isBonus = type === 'bonus';
        const previousBalance = isBonus ? (user.bonusBalance || 0) : (user.walletBalance || 0);

        // Check if user has sufficient balance
        if (previousBalance < amount) {
            return res.status(400).json({
                success: false,
                message: `Insufficient ${isBonus ? 'bonus' : 'real'} balance. Current: ₹${previousBalance}`
            });
        }

        // Enforce 2 decimal precision
        const safeAmount = Math.round(amount * 100) / 100;
        const newBalance = Math.round((previousBalance - safeAmount) * 100) / 100;

        // Update user's wallet balance
        if (isBonus) {
            user.bonusBalance = newBalance;
        } else {
            user.walletBalance = newBalance;
        }
        await user.save();

        // Create a transaction record for audit trail
        await Transaction.create({
            fromUser: userId,
            type: 'debit',
            amount: amount,
            description: reason || (isBonus ? 'Admin deducted bonus' : 'Admin deducted balance'),
            status: 'success',
            previousBalance,
            newBalance,
            meta: { walletType: type }
        });

        res.status(200).json({
            success: true,
            message: `₹${amount} deducted from ${isBonus ? 'bonus' : 'real'} wallet successfully`,
            data: {
                previousBalance,
                amountDeducted: amount,
                newBalance,
                walletType: type,
                user: {
                    _id: user._id,
                    name: user.name,
                    mobile: user.mobile,
                    walletBalance: user.walletBalance,
                    bonusBalance: user.bonusBalance
                }
            }
        });
    } catch (error) {
        console.error('Deduct wallet balance error:', error);
        res.status(500).json({ success: false, message: 'Server Error', error });
    }
};

// Add User (Admin)
export const addUser = async (req: Request, res: Response) => {
    try {
        const { name, email, walletBalance, isBlocked } = req.body;
        let { mobile } = req.body;

        if (!name || !mobile) {
            return res.status(400).json({ success: false, message: 'Name and Mobile are required' });
        }

        mobile = mobile.trim();

        const existingUser = await User.findOne({ mobile });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'User with this mobile already exists' });
        }

        const newUser = new User({
            name,
            mobile,
            walletBalance: walletBalance || 0,
            isBlocked: isBlocked || false,
            isVerified: true, // Admin created
            role: 'user'
        });

        await newUser.save();

        res.status(201).json({ success: true, data: newUser, message: 'User added successfully' });
    } catch (error) {
        console.error('Add user error:', error);
        res.status(500).json({ success: false, message: 'Server Error', error });
    }
};

// Delete User (Permanent Deletion)
export const deleteUser = async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        const user = await User.findByIdAndDelete(userId);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Ideally, we should also clean up related data like Transactions, ChatSessions, etc.
        // For now, we are just deleting the user record as requested.

        res.status(200).json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error });
    }
};

// 3. Astrologer Management

export const adminAddAstrologer = async (req: Request, res: Response) => {
    try {
        const {
            firstName, lastName, gender, email,
            experience, city, country, systemKnown, language, bio, aboutMe,
            pricePerMin, priceRangeMin, priceRangeMax, tag, specialties, profileImage
        } = req.body;
        let { mobileNumber } = req.body;

        if (!mobileNumber || !firstName || !lastName) {
            return res.status(400).json({ success: false, message: 'FirstName, LastName and Mobile are required' });
        }

        mobileNumber = mobileNumber.trim();

        let savedUser;
        // 1. Check if user already exists
        const existingUser = await User.findOne({ mobile: mobileNumber });

        if (existingUser) {
            // Check if they already have an astrologer record regardless of role (production check)
            const profileCheck = await Astrologer.findOne({ userId: existingUser._id });
            if (profileCheck || existingUser.role === 'astrologer') {
                return res.status(400).json({ success: false, message: 'This mobile number is already registered as an astrologer' });
            }

            // Upgrade user to astrologer
            existingUser.role = 'astrologer';
            existingUser.isVerified = true; 
            existingUser.name = `${firstName} ${lastName}`.trim(); 
            savedUser = await existingUser.save();
            console.log(`[Admin] Upgraded existing user ${existingUser._id} (${mobileNumber}) to astrologer`);
        } else {
            // 2. Create New User
            const newUser = new User({
                name: `${firstName} ${lastName}`.trim(),
                mobile: mobileNumber,
                role: 'astrologer',
                isVerified: true,
                isBlocked: false
            });
            savedUser = await newUser.save();
        }

        // 2.1 Upload Profile Image if provided
        let profilePhotoUrl = '';
        if (profileImage) {
            const uploadedUrl = await uploadBase64ToR2(profileImage, 'astrologers', `admin-add-${savedUser._id}-${Date.now()}`);
            if (uploadedUrl) {
                profilePhotoUrl = uploadedUrl;
            }
        }

        // 3. Create Astrologer Profile
        // Check if profile already exists for this user (parity check)
        const existingProfile = await Astrologer.findOne({ userId: savedUser._id });
        if (existingProfile) {
            return res.status(400).json({ success: false, message: 'Astrologer profile already exists for this user.' });
        }

        const newAstrologer = new Astrologer({
            userId: savedUser._id,
            firstName,
            lastName,
            gender,
            mobileNumber,
            email,
            experience: experience || 0,
            city,
            country,
            systemKnown: systemKnown || [],
            language: language || [],
            bio: bio || '',
            aboutMe: aboutMe || '',
            status: 'approved', // Admin created are approved by default
            pricePerMin: pricePerMin || 20,
            priceRangeMin: priceRangeMin || 10,
            priceRangeMax: priceRangeMax || 100,
            tag: tag || 'None',
            specialties: specialties || [],
            profilePhoto: profilePhotoUrl,
            bankDetails: req.body.bankDetails || {
                bankName: '',
                accountNumber: '',
                ifscCode: '',
                accountHolderName: '',
                branchName: ''
            },
            isFreeChatAvailable: req.body.isFreeChatAvailable || false,
            freeChatLimit: req.body.freeChatLimit || 0
        });

        await newAstrologer.save();

        res.status(201).json({
            success: true,
            message: 'Astrologer created successfully',
            data: newAstrologer
        });
    } catch (error: any) {
        console.error('Admin add astrologer error:', error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

export const getAstrologers = async (req: Request, res: Response) => {
    try {
        const { status } = req.query;
        const query = status ? { status } : {};

        const astrologers = await Astrologer.find(query).populate('userId', 'name mobile');

        // Prevent caching
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');

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

// Delete Astrologer Profile permanently
export const deleteAstrologer = async (req: Request, res: Response) => {
    try {
        const { astrologerId } = req.params;

        const astrologer = await Astrologer.findByIdAndDelete(astrologerId);
        if (!astrologer) {
            return res.status(404).json({ success: false, message: 'Astrologer not found' });
        }

        // If the application was pending ('under_review'), delete the base user account completely
        // to prevent applicants from clogging up the main users list.
        if (astrologer.status === 'under_review') {
            await User.findByIdAndDelete(astrologer.userId);
        } else {
            // Otherwise (e.g., they were an approved working astrologer), revert user role back to 'user'
            await User.findByIdAndUpdate(astrologer.userId, { role: 'user', isVerified: true });
        }

        // Optionally delete profile image from R2 if it exists
        if (astrologer.profilePhoto) {
            const key = getKeyFromUrl(astrologer.profilePhoto);
            if (key) {
                await deleteFromR2(key).catch(err => console.error('Failed to delete astrologer image from R2:', err));
            }
        }
        
        res.status(200).json({ success: true, message: 'Astrologer deleted successfully' });
    } catch (error) {
        console.error('Delete astrologer error:', error);
        res.status(500).json({ success: false, message: 'Server Error', error });
    }
};

// Warn Astrologer (Reset missed chats, increment warning count)
export const warnAstrologer = async (req: Request, res: Response) => {
    try {
        const { astrologerId } = req.params;

        const astrologer = await Astrologer.findByIdAndUpdate(
            astrologerId,
            {
                $inc: { warningCount: 1 },
                $set: { missedChats: 0 }
            },
            { new: true }
        );

        if (!astrologer) return res.status(404).json({ success: false, message: 'Astrologer not found' });

        res.status(200).json({
            success: true,
            message: `Astrologer warned. Warning count: ${astrologer.warningCount}`,
            data: astrologer
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error });
    }
};

// Reset Astrologer Warnings
export const resetAstrologerWarnings = async (req: Request, res: Response) => {
    try {
        const { astrologerId } = req.params;
        const astrologer = await Astrologer.findByIdAndUpdate(
            astrologerId,
            { $set: { warningCount: 0 } },
            { new: true }
        );
        if (!astrologer) return res.status(404).json({ success: false, message: 'Astrologer not found' });
        res.status(200).json({ success: true, message: 'Warnings reset to 0', data: astrologer });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error });
    }
};

// Update Astrologer (block/unblock, price range)
export const updateAstrologer = async (req: Request, res: Response) => {
    try {
        const { astrologerId } = req.params;
        const {
            isBlocked, priceRangeMin, priceRangeMax, pricePerMin, tag,
            firstName, lastName, email, mobileNumber, experience, city, country, bio, aboutMe, specialties, profileImage,
            language, systemKnown
        } = req.body;

        const updateData: any = {};
        if (typeof isBlocked === 'boolean') updateData.isBlocked = isBlocked;
        if (typeof priceRangeMin === 'number') updateData.priceRangeMin = priceRangeMin;
        if (typeof priceRangeMax === 'number') updateData.priceRangeMax = priceRangeMax;
        if (typeof pricePerMin === 'number') updateData.pricePerMin = pricePerMin;
        if (tag) updateData.tag = tag;

        // Basic Info
        if (firstName) updateData.firstName = firstName;
        if (lastName) updateData.lastName = lastName;
        if (email) updateData.email = email;
        if (mobileNumber) updateData.mobileNumber = mobileNumber;
        if (typeof experience === 'number') updateData.experience = experience;
        if (city) updateData.city = city;
        if (country) updateData.country = country;
        if (bio !== undefined) updateData.bio = bio;
        if (aboutMe !== undefined) updateData.aboutMe = aboutMe;
        if (Array.isArray(specialties)) updateData.specialties = specialties;
        if (Array.isArray(language)) updateData.language = language;
        if (Array.isArray(systemKnown)) updateData.systemKnown = systemKnown;

        // Bank Details
        if (req.body.bankDetails) {
            updateData.bankDetails = req.body.bankDetails;
        }

        // Free Chat Settings
        if (typeof req.body.isFreeChatAvailable === 'boolean') {
            updateData.isFreeChatAvailable = req.body.isFreeChatAvailable;
        }
        if (typeof req.body.freeChatLimit === 'number') {
            updateData.freeChatLimit = req.body.freeChatLimit;
        }

        // Image Upload
        if (profileImage) {
            // 1. Upload new image
            const uploadedUrl = await uploadBase64ToR2(profileImage, 'astrologers', `admin-update-${astrologerId}-${Date.now()}`);

            if (uploadedUrl) {
                // 2. Fetch current astrologer to get old image URL
                const currentAstrologer = await Astrologer.findById(astrologerId);
                if (currentAstrologer && currentAstrologer.profilePhoto) {
                    // 3. Delete old image from R2
                    const oldKey = getKeyFromUrl(currentAstrologer.profilePhoto);
                    if (oldKey) {
                        await deleteFromR2(oldKey).catch(err => console.error('Failed to delete old image:', err));
                    }
                }

                updateData.profilePhoto = uploadedUrl;
            }
        }

        const astrologer = await Astrologer.findById(astrologerId);
        if (!astrologer) return res.status(404).json({ success: false, message: 'Astrologer not found' });

        // Special logic: If we are unblocking, and the current status is 'rejected' (e.g. from deletion), 
        // we should set status to 'approved' so they can log in again.
        if (isBlocked === false && astrologer.isBlocked === true && astrologer.status === 'rejected') {
            updateData.status = 'approved';
        }

        const updatedAstrologer = await Astrologer.findByIdAndUpdate(astrologerId, updateData, { new: true });
        if (!updatedAstrologer) return res.status(404).json({ success: false, message: 'Astrologer not found' });

        // If block status was toggled to true, handle real-time effects
        if (isBlocked !== undefined) {
            console.log(`[Admin] Astrologer ${astrologerId} block status changed to ${isBlocked}. Synchronizing with User account...`);
            
            // Sync with User record
            await User.findByIdAndUpdate(astrologer.userId, { isBlocked: isBlocked });

            if (isBlocked === true) {
                // 1. Set astrologer to offline (remove from user app listings)
                await Astrologer.findByIdAndUpdate(astrologerId, { isOnline: false });

                // 2. Emit ASTROLOGER_BLOCKED socket event for instant UI update
                if (chatService.io) {
                    chatService.io.to(`astrologer:${astrologerId}`).emit('ASTROLOGER_BLOCKED', {
                        reason: 'Your account has been blocked by the administrator.'
                    });
                    console.log(`[Admin] ASTROLOGER_BLOCKED event emitted to astrologer:${astrologerId}`);
                }

                // 3. Send FCM push notification
                try {
                    if (astrologer.fcmToken) {
                        await notificationService.sendToUser(astrologerId, {
                            title: 'Account Blocked',
                            body: 'Your account has been blocked. Please contact support for more information.'
                        }, { type: 'account_blocked' });
                        console.log(`[Admin] FCM notification sent to blocked astrologer ${astrologerId}`);
                    }
                } catch (fcmErr) {
                    console.error(`[Admin] Failed to send FCM to blocked astrologer:`, fcmErr);
                }

                // 4. Force-end any active chat session
                try {
                    if (astrologer.activeSessionId) {
                        console.log(`[Admin] Force-ending active session ${astrologer.activeSessionId} for blocked astrologer ${astrologerId}`);
                        await chatService.endChat(astrologer.activeSessionId, 'ASTROLOGER_END');
                    }
                } catch (chatErr) {
                    console.error(`[Admin] Failed to end active chat for blocked astrologer:`, chatErr);
                }
            }
        }

        res.status(200).json({ success: true, message: 'Astrologer updated', data: updatedAstrologer });
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
        if (typeof isBlocked === 'boolean') {
            updateData.isBlocked = isBlocked;
            // Sync block status to User accounts in bulk
            const targetAstrologers = await Astrologer.find({ _id: { $in: astrologerIds } });
            const userIds = targetAstrologers.map(a => (a as any).userId);
            await User.updateMany({ _id: { $in: userIds } }, { isBlocked: isBlocked });
            console.log(`[Admin] Bulk synced block status to ${userIds.length} users`);
        }
        if (typeof priceRangeMin === 'number') updateData.priceRangeMin = priceRangeMin;
        if (typeof priceRangeMax === 'number') updateData.priceRangeMax = priceRangeMax;

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ success: false, message: 'No update fields provided' });
        }

        const result = await Astrologer.updateMany(
            { _id: { $in: astrologerIds } },
            { $set: updateData }
        );

        // If blocking bulk, notify all via socket
        if (isBlocked === true && chatService.io) {
            astrologerIds.forEach((id: string) => {
                chatService.io?.to(`astrologer:${id}`).emit('ASTROLOGER_BLOCKED', {
                    reason: 'Your account has been blocked by the administrator as part of a bulk action.'
                });
            });
        }

        res.status(200).json({
            success: true,
            message: `${result.modifiedCount} astrologers updated`,
            modifiedCount: result.modifiedCount
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error });
    }
};

// Get Single Astrologer Details (Admin)
export const getAstrologerDetails = async (req: Request, res: Response) => {
    try {
        const { astrologerId } = req.params;
        const astrologer = await Astrologer.findById(astrologerId).populate('userId', 'name mobile profilePhoto');
        if (!astrologer) return res.status(404).json({ success: false, message: 'Astrologer not found' });

        // Prevent caching
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');

        res.json({ success: true, data: astrologer });
    } catch (error: any) {
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

// Get Astrologer Earnings History (Admin)
export const getAstrologerEarnings = async (req: Request, res: Response) => {
    try {
        const { astrologerId } = req.params;
        const sessions = await ChatSession.find({ astrologerId, status: 'ENDED' })
            .populate('userId', 'name mobile')
            .sort({ createdAt: -1 });
        res.json({ success: true, data: sessions });
    } catch (error: any) {
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

// Get Astrologer Withdrawal History (Admin)
export const getAstrologerWithdrawals = async (req: Request, res: Response) => {
    try {
        const { astrologerId } = req.params;
        const withdrawals = await Withdrawal.find({ astrologerId }).sort({ requestedAt: -1 });
        res.json({ success: true, data: withdrawals });
    } catch (error: any) {
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

// Get Astrologer Chat History (Admin)
export const getAstrologerChats = async (req: Request, res: Response) => {
    try {
        const { astrologerId } = req.params;
        // Group by user or just list sessions? For admin audit, list sessions is fine.
        const chats = await ChatSession.find({ astrologerId }).populate('userId', 'name mobile').sort({ createdAt: -1 }).limit(50);
        res.json({ success: true, data: chats });
    } catch (error: any) {
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

// Verify Astrologer (Manual)
export const verifyAstrologer = async (req: Request, res: Response) => {
    try {
        const { astrologerId } = req.params;
        const { isVerified } = req.body; // true or false

        const astrologer = await Astrologer.findByIdAndUpdate(
            astrologerId,
            { isVerified },
            { new: true }
        );

        if (!astrologer) {
            return res.status(404).json({ success: false, message: 'Astrologer not found' });
        }

        res.status(200).json({
            success: true,
            message: `Astrologer ${isVerified ? 'verified' : 'unverified'} successfully`,
            data: astrologer
        });
    } catch (error: any) {
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

// Upload Verification Document (Admin uploads on behalf of astrologer)
export const uploadVerificationDocument = async (req: Request, res: Response) => {
    try {
        const { astrologerId } = req.params;
        const { docName, docBase64 } = req.body;

        if (!docName || !docBase64) {
            return res.status(400).json({ success: false, message: 'Document Name and File are required' });
        }

        const astrologer = await Astrologer.findById(astrologerId);
        if (!astrologer) {
            return res.status(404).json({ success: false, message: 'Astrologer not found' });
        }

        // Upload to R2
        const r2Url = await uploadBase64ToR2(docBase64, 'verification_docs', `${astrologerId}-${Date.now()}`);

        if (!r2Url) {
            return res.status(500).json({ success: false, message: 'Failed to upload document' });
        }

        // Add to documents array using $push to avoid full-doc validation
        // on legacy astrologer records that may have empty required fields.
        await Astrologer.findByIdAndUpdate(astrologerId, {
            $push: {
                verificationDocuments: {
                    name: docName,
                    url: r2Url,
                    uploadedAt: new Date()
                }
            }
        });

        res.status(200).json({
            success: true,
            message: 'Document uploaded successfully',
            data: await Astrologer.findById(astrologerId)
        });
    } catch (error: any) {
        console.error('Upload verification doc error:', error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
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
            userId: audience === 'user' ? userId : undefined,
            isScheduled: req.body.isScheduled || false,
            scheduledTime: req.body.scheduledTime,
            navigateType: req.body.navigateType || 'none',
            navigateTarget: req.body.navigateTarget
        });

        // Case 1: Instant Push Notification (Broadcast/Targeted)
        if (!notification.isScheduled && ['all', 'users', 'astrologers'].includes(audience)) {
            // We fire and forget the broadcast so the admin doesn't wait for thousands of tokens
            notificationService.broadcast(
                audience as any,
                { title, body: message },
                {
                    navigateType: notification.navigateType || 'none',
                    navigateTarget: notification.navigateTarget || ''
                }
            ).then(result => {
                console.log(`[Admin] Broadcast finished: ${result.success} success, ${result.failure} failure`);
            }).catch(err => {
                console.error('[Admin] Broadcast failed:', err);
            });
        }

        // Case 2: Scheduled Daily Notification
        if (notification.isScheduled && notification.scheduledTime) {
            scheduledNotificationService.scheduleJob(notification);
        }

        res.status(201).json({ success: true, message: 'Notification sent and broadcast triggered', data: notification });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error });
    }
};

// Get all active scheduled notifications
export const getScheduledNotifications = async (req: Request, res: Response) => {
    try {
        const notifications = await Notification.find({
            isScheduled: true,
            isActive: true
        }).sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: notifications });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error });
    }
};

// Terminate a scheduled notification
export const deleteNotification = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const notification = await Notification.findById(id);

        if (!notification) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }

        // 1. Deactivate in DB (stops it from being initialized on restart)
        notification.isActive = false;
        await notification.save();

        // 2. Cancel active Cron Job if running
        scheduledNotificationService.cancelJob(id);

        res.status(200).json({ success: true, message: 'Notification terminated successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error });
    }
};

// 5. Banner Management

// Create a new banner
export const createBanner = async (req: Request, res: Response) => {
    try {
        const { imageBase64, navigationType, navigationValue, isActive } = req.body;

        if (!imageBase64) {
            return res.status(400).json({ success: false, message: 'Image is required' });
        }

        // Upload image to Cloudflare R2
        const imageUrl = await uploadBase64ToR2(imageBase64, 'banners', `banner-${Date.now()}`);
        if (!imageUrl) {
            return res.status(500).json({ success: false, message: 'Failed to upload image to R2' });
        }

        const banner = await Banner.create({
            imageUrl,
            navigationType: navigationType || 'none',
            navigationValue,
            isActive: isActive !== undefined ? isActive : true
        });

        res.status(201).json({ success: true, message: 'Banner created successfully', data: banner });
    } catch (error) {
        console.error('Create banner error:', error);
        res.status(500).json({ success: false, message: 'Server Error', error });
    }
};

// Get all banners (Admin view)
export const getBanners = async (req: Request, res: Response) => {
    try {
        const banners = await Banner.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: banners });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error });
    }
};

// Get active banners (App API)
export const getActiveBanners = async (req: Request, res: Response) => {
    try {
        const banners = await Banner.find({ isActive: true }).sort({ createdAt: -1 });
        
        // Prevent caching for real-time banners
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');

        res.status(200).json({ success: true, data: banners });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error });
    }
};

// Update a banner
export const updateBanner = async (req: Request, res: Response) => {
    try {
        const { bannerId } = req.params;
        const { imageBase64, navigationType, navigationValue, isActive } = req.body;

        const banner = await Banner.findById(bannerId);
        if (!banner) {
            return res.status(404).json({ success: false, message: 'Banner not found' });
        }

        // If new image is provided, upload to R2 and delete old one
        let imageUrl = banner.imageUrl;
        if (imageBase64) {
            const newImageUrl = await uploadBase64ToR2(imageBase64, 'banners', `banner-${Date.now()}`);
            if (newImageUrl) {
                // Delete old image from R2
                const oldKey = getKeyFromUrl(banner.imageUrl);
                if (oldKey) {
                    try {
                        await deleteFromR2(oldKey);
                    } catch (e) {
                        console.warn('Failed to delete old banner image:', e);
                    }
                }
                imageUrl = newImageUrl;
            }
        }

        // Update banner fields
        banner.imageUrl = imageUrl;
        if (navigationType !== undefined) banner.navigationType = navigationType;
        if (navigationValue !== undefined) banner.navigationValue = navigationValue;
        if (isActive !== undefined) banner.isActive = isActive;

        await banner.save();

        res.status(200).json({ success: true, message: 'Banner updated successfully', data: banner });
    } catch (error) {
        console.error('Update banner error:', error);
        res.status(500).json({ success: false, message: 'Server Error', error });
    }
};

// Delete a banner
export const deleteBanner = async (req: Request, res: Response) => {
    try {
        const { bannerId } = req.params;

        const banner = await Banner.findById(bannerId);
        if (!banner) {
            return res.status(404).json({ success: false, message: 'Banner not found' });
        }

        // Delete image from R2
        const key = getKeyFromUrl(banner.imageUrl);
        if (key) {
            try {
                await deleteFromR2(key);
            } catch (e) {
                console.warn('Failed to delete banner image from R2:', e);
            }
        }

        await Banner.findByIdAndDelete(bannerId);

        res.status(200).json({ success: true, message: 'Banner deleted successfully' });
    } catch (error) {
        console.error('Delete banner error:', error);
        res.status(500).json({ success: false, message: 'Server Error', error });
    }
};

// 6. Skill Management

// Get all skills
export const getSkills = async (req: Request, res: Response) => {
    try {
        const skills = await Skill.find().sort({ name: 1 });
        res.status(200).json({ success: true, data: skills });
    } catch (error) {
        console.error('Get skills error:', error);
        res.status(500).json({ success: false, message: 'Server Error', error });
    }
};

// Add a new skill
export const addSkill = async (req: Request, res: Response) => {
    try {
        const { name } = req.body;
        if (!name) {
            return res.status(400).json({ success: false, message: 'Skill name is required' });
        }

        const existingSkill = await Skill.findOne({ name });
        if (existingSkill) {
            return res.status(400).json({ success: false, message: 'Skill already exists' });
        }

        const skill = await Skill.create({ name });
        res.status(201).json({ success: true, message: 'Skill added successfully', data: skill });
    } catch (error) {
        console.error('Add skill error:', error);
        res.status(500).json({ success: false, message: 'Server Error', error });
    }
};

// Update a skill
export const updateSkill = async (req: Request, res: Response) => {
    try {
        const { skillId } = req.params;
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ success: false, message: 'Skill name is required' });
        }

        // 1. Find original skill to get old name
        const oldSkill = await Skill.findById(skillId);
        if (!oldSkill) {
            return res.status(404).json({ success: false, message: 'Skill not found' });
        }

        const oldName = oldSkill.name;

        // 2. Update the skill in Skills collection
        const skill = await Skill.findByIdAndUpdate(skillId, { name }, { new: true });

        // 3. If name changed, propagate to all Astrologers
        if (oldName !== name) {
            console.log(`[Admin] Skill renamed from "${oldName}" to "${name}". Updating Astrologers...`);

            // Update systemKnown array
            await Astrologer.updateMany(
                { systemKnown: oldName },
                { $set: { "systemKnown.$": name } }
            );

            // Update specialties array (if used)
            await Astrologer.updateMany(
                { specialties: oldName },
                { $set: { "specialties.$": name } }
            );
        }

        res.status(200).json({ success: true, message: 'Skill updated successfully', data: skill });
    } catch (error) {
        console.error('Update skill error:', error);
        res.status(500).json({ success: false, message: 'Server Error', error });
    }
};

// Delete a skill
export const deleteSkill = async (req: Request, res: Response) => {
    try {
        const { skillId } = req.params;

        // 1. Find skill to get name
        const skill = await Skill.findById(skillId);
        if (!skill) {
            return res.status(404).json({ success: false, message: 'Skill not found' });
        }

        const skillName = skill.name;

        // 2. Delete the skill
        await Skill.findByIdAndDelete(skillId);

        // 3. Remove this skill from all Astrologers
        console.log(`[Admin] Skill "${skillName}" deleted. Removing from Astrologers...`);

        await Astrologer.updateMany(
            { systemKnown: skillName },
            { $pull: { systemKnown: skillName } }
        );

        await Astrologer.updateMany(
            { specialties: skillName },
            { $pull: { specialties: skillName } }
        );

        res.status(200).json({ success: true, message: 'Skill deleted and removed from astrologers successfully' });
    } catch (error) {
        console.error('Delete skill error:', error);
        res.status(500).json({ success: false, message: 'Server Error', error });
    }
};

// 7. Astrologer Profile Change Request Management

// Get all change requests (with optional status filter)
export const getChangeRequests = async (req: Request, res: Response) => {
    try {
        const { status } = req.query;
        const query: any = {};
        if (status) query.status = status;

        const requests = await ProfileChangeRequest.find(query)
            .populate('astrologerId', 'firstName lastName profilePhoto mobileNumber')
            .sort({ createdAt: -1 })
            .limit(100);

        res.json({ success: true, data: requests });
    } catch (error: any) {
        console.error('getChangeRequests error:', error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

// Approve a change request — apply afterData to astrologer and notify
export const approveChangeRequest = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const changeRequest = await ProfileChangeRequest.findById(id);

        if (!changeRequest) {
            return res.status(404).json({ success: false, message: 'Change request not found' });
        }
        if (changeRequest.status !== 'pending') {
            return res.status(400).json({ success: false, message: 'Request already processed' });
        }

        const astrologer = await Astrologer.findById(changeRequest.astrologerId);
        if (!astrologer) {
            return res.status(404).json({ success: false, message: 'Astrologer not found' });
        }



        // 1. Move pending photo to live folder if it exists
        if (changeRequest.afterData.profilePhoto && changeRequest.afterData.profilePhoto.includes('pending')) {
            const newPhotoUrl = await moveFileInR2(changeRequest.afterData.profilePhoto, 'profiles/astrologers');
            if (newPhotoUrl) {
                changeRequest.afterData.profilePhoto = newPhotoUrl;
                // Update the change request with the new URL so we have a record of the final URL
                await ProfileChangeRequest.findByIdAndUpdate(id, { 'afterData.profilePhoto': newPhotoUrl });
                console.log('[Admin] Moved pending photo to live folder:', newPhotoUrl);
            }
        }

        // 2. If profile photo is being changed, delete the old one from R2
        if (changeRequest.afterData.profilePhoto && astrologer.profilePhoto && astrologer.profilePhoto !== changeRequest.afterData.profilePhoto && astrologer.profilePhoto.includes('r2.')) {
            try {
                const oldKey = getKeyFromUrl(astrologer.profilePhoto);
                if (oldKey) {
                    await deleteFromR2(oldKey);
                    console.log('[Admin] Deleted old profile photo from R2 on approval');
                }
            } catch (deleteError) {
                console.warn('[Admin] Failed to delete old profile photo:', deleteError);
            }
        }

        // Apply afterData to astrologer.
        // Skip any key whose value is an empty string — this prevents a change
        // request that accidentally sends '' for a required field (e.g. country)
        // from overwriting a valid existing value and crashing on .save().
        const afterData = changeRequest.afterData;
        const REQUIRED_STRING_FIELDS = ['firstName', 'lastName', 'gender', 'mobileNumber', 'email', 'city', 'country'];
        for (const key of Object.keys(afterData)) {
            const value = afterData[key];
            if (REQUIRED_STRING_FIELDS.includes(key) && typeof value === 'string' && value.trim() === '') {
                console.warn(`[Admin] Skipping empty required field "${key}" in change request ${id} — keeping existing value.`);
                continue;
            }
            (astrologer as any)[key] = value;
        }
        await astrologer.save();

        // Mark request as approved
        changeRequest.status = 'approved';
        await changeRequest.save();

        // Send push notification to astrologer
        const typeLabel = changeRequest.requestType === 'rate_update' ? 'rate change'
            : changeRequest.requestType === 'photo_update' ? 'profile photo change'
                : 'profile update';
        notificationService.sendToAstrologer(
            astrologer._id.toString(),
            {
                title: 'Changes Approved ✅',
                body: `Your ${typeLabel} has been approved by the admin.`
            },
            { type: 'change_request_approved', requestId: id }
        ).catch(err => console.error('[Admin] Notification error on approve:', err));

        console.log(`[Admin] Change request ${id} approved for astrologer ${astrologer._id}`);

        res.json({ success: true, message: 'Change request approved', data: astrologer });
    } catch (error: any) {
        console.error('approveChangeRequest error:', error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

// Reject a change request — don't apply changes, notify astrologer
export const rejectChangeRequest = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { adminNote } = req.body;

        const changeRequest = await ProfileChangeRequest.findById(id);
        if (!changeRequest) {
            return res.status(404).json({ success: false, message: 'Change request not found' });
        }
        if (changeRequest.status !== 'pending') {
            return res.status(400).json({ success: false, message: 'Request already processed' });
        }

        // If a pending photo was uploaded to R2, clean it up
        if (changeRequest.afterData.profilePhoto && changeRequest.afterData.profilePhoto.includes('r2.')) {
            try {
                const pendingKey = getKeyFromUrl(changeRequest.afterData.profilePhoto);
                if (pendingKey) {
                    await deleteFromR2(pendingKey);
                    console.log('[Admin] Deleted pending photo from R2 on rejection');
                }
            } catch (deleteError) {
                console.warn('[Admin] Failed to delete pending photo:', deleteError);
            }
        }

        changeRequest.status = 'rejected';
        changeRequest.adminNote = adminNote || '';
        await changeRequest.save();

        // Send push notification to astrologer
        const typeLabel = changeRequest.requestType === 'rate_update' ? 'rate change'
            : changeRequest.requestType === 'photo_update' ? 'profile photo change'
                : 'profile update';
        const noteText = adminNote ? ` Reason: ${adminNote}` : '';
        notificationService.sendToAstrologer(
            changeRequest.astrologerId.toString(),
            {
                title: 'Changes Rejected ❌',
                body: `Your ${typeLabel} has been rejected by the admin.${noteText}`
            },
            { type: 'change_request_rejected', requestId: id }
        ).catch(err => console.error('[Admin] Notification error on reject:', err));

        console.log(`[Admin] Change request ${id} rejected`);

        res.json({ success: true, message: 'Change request rejected' });
    } catch (error: any) {
        console.error('rejectChangeRequest error:', error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

// ===== WITHDRAWAL MANAGEMENT =====

// Get All Pending Withdrawals (with astrologer details)
export const getAllPendingWithdrawals = async (req: Request, res: Response) => {
    try {
        const withdrawals = await Withdrawal.find({ status: 'PENDING' })
            .sort({ requestedAt: -1 })
            .lean();

        // Get all unique astrologer IDs
        const astrologerIds = [...new Set(withdrawals.map(w => w.astrologerId.toString()))];
        const astrologers = await Astrologer.find({ _id: { $in: astrologerIds } })
            .select('firstName lastName mobileNumber email bankDetails pendingWithdrawal')
            .lean();

        // Create a map for quick lookup
        const astrologerMap: Record<string, any> = {};
        astrologers.forEach(a => { astrologerMap[(a._id as any).toString()] = a; });

        // Merge withdrawal + astrologer data
        const result = withdrawals.map(w => {
            const astro = astrologerMap[w.astrologerId.toString()] || {};
            return {
                _id: w._id,
                amount: w.amount,
                status: w.status,
                requestedAt: w.requestedAt,
                notes: w.notes,
                astrologerId: w.astrologerId,
                astrologerName: `${astro.firstName || ''} ${astro.lastName || ''}`.trim(),
                phone: astro.mobileNumber || '',
                email: astro.email || '',
                bankDetails: astro.bankDetails || {},
                pendingWithdrawal: astro.pendingWithdrawal || 0
            };
        });

        res.json({ success: true, data: result });
    } catch (error: any) {
        console.error('getAllPendingWithdrawals error:', error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

// Mark Withdrawals as Paid (batch or single)
export const markWithdrawalsPaid = async (req: Request, res: Response) => {
    try {
        const { withdrawalIds, notes } = req.body;

        if (!withdrawalIds || !Array.isArray(withdrawalIds) || withdrawalIds.length === 0) {
            return res.status(400).json({ success: false, message: 'withdrawalIds array is required' });
        }

        // Get the withdrawals
        const withdrawals = await Withdrawal.find({
            _id: { $in: withdrawalIds },
            status: 'PENDING'
        });

        if (withdrawals.length === 0) {
            return res.status(400).json({ success: false, message: 'No pending withdrawals found for given IDs' });
        }

        const now = new Date();
        let totalAmount = 0;
        const astrologerAmounts: Record<string, number> = {};

        // Calculate total and per-astrologer amounts
        for (const w of withdrawals) {
            totalAmount += w.amount;
            const aid = w.astrologerId.toString();
            astrologerAmounts[aid] = (astrologerAmounts[aid] || 0) + w.amount;
        }

        // Update all withdrawals to PAID
        await Withdrawal.updateMany(
            { _id: { $in: withdrawalIds }, status: 'PENDING' },
            { $set: { status: 'PAID', processedAt: now } }
        );

        // Reset pendingWithdrawal for each astrologer
        for (const [astrologerId, paidAmount] of Object.entries(astrologerAmounts)) {
            await Astrologer.findByIdAndUpdate(astrologerId, {
                $inc: { pendingWithdrawal: -paidAmount }
            });
        }

        // Create PaymentBatch record
        const batch = new PaymentBatch({
            withdrawalIds: withdrawals.map(w => w._id),
            astrologerIds: [...new Set(withdrawals.map(w => w.astrologerId))],
            totalAmount,
            totalEntries: withdrawals.length,
            paidAt: now,
            notes: notes || '',
            paidBy: 'Admin'
        });
        await batch.save();

        console.log(`[Admin] Payment batch created: ${batch._id}, total: ₹${totalAmount}, entries: ${withdrawals.length}`);

        res.json({
            success: true,
            message: `${withdrawals.length} withdrawal(s) marked as paid`,
            data: {
                batchId: batch._id,
                totalAmount,
                totalEntries: withdrawals.length,
                paidAt: now
            }
        });
    } catch (error: any) {
        console.error('markWithdrawalsPaid error:', error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

// Get Payment History (all batches)
export const getPaymentHistory = async (req: Request, res: Response) => {
    try {
        const batches = await PaymentBatch.find()
            .sort({ paidAt: -1 })
            .lean();

        // Populate astrologer names for each batch
        const allAstrologerIds = [...new Set(batches.flatMap(b => b.astrologerIds.map((id: any) => id.toString())))];
        const astrologers = await Astrologer.find({ _id: { $in: allAstrologerIds } })
            .select('firstName lastName')
            .lean();
        const astroMap: Record<string, string> = {};
        astrologers.forEach(a => { astroMap[(a._id as any).toString()] = `${a.firstName} ${a.lastName}`; });

        const result = batches.map(b => ({
            _id: b._id,
            totalAmount: b.totalAmount,
            totalEntries: b.totalEntries,
            paidAt: b.paidAt,
            notes: b.notes,
            paidBy: b.paidBy,
            astrologerNames: b.astrologerIds.map((id: any) => astroMap[id.toString()] || 'Unknown')
        }));

        res.json({ success: true, data: result });
    } catch (error: any) {
        console.error('getPaymentHistory error:', error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

// Get Single Payment Batch Details
export const getPaymentBatchDetails = async (req: Request, res: Response) => {
    try {
        const { batchId } = req.params;
        const batch = await PaymentBatch.findById(batchId).lean();

        if (!batch) {
            return res.status(404).json({ success: false, message: 'Payment batch not found' });
        }

        // Get the withdrawals in this batch
        const withdrawals = await Withdrawal.find({ _id: { $in: batch.withdrawalIds } }).lean();

        // Get astrologer details
        const astrologers = await Astrologer.find({ _id: { $in: batch.astrologerIds } })
            .select('firstName lastName mobileNumber email bankDetails')
            .lean();
        const astroMap: Record<string, any> = {};
        astrologers.forEach(a => { astroMap[(a._id as any).toString()] = a; });

        const details = withdrawals.map(w => {
            const astro = astroMap[w.astrologerId.toString()] || {};
            return {
                withdrawalId: w._id,
                amount: w.amount,
                requestedAt: w.requestedAt,
                processedAt: w.processedAt,
                astrologerName: `${astro.firstName || ''} ${astro.lastName || ''}`.trim(),
                phone: astro.mobileNumber || '',
                email: astro.email || '',
                bankDetails: astro.bankDetails || {}
            };
        });

        res.json({
            success: true,
            data: {
                _id: batch._id,
                totalAmount: batch.totalAmount,
                totalEntries: batch.totalEntries,
                paidAt: batch.paidAt,
                notes: batch.notes,
                paidBy: batch.paidBy,
                withdrawals: details
            }
        });
    } catch (error: any) {
        console.error('getPaymentBatchDetails error:', error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

// Reject Withdrawal Request
export const rejectWithdrawal = async (req: Request, res: Response) => {
    try {
        const { withdrawalId, reason } = req.body;

        if (!withdrawalId || !reason) {
            return res.status(400).json({ success: false, message: 'Withdrawal ID and Reason are required' });
        }

        const withdrawal = await Withdrawal.findById(withdrawalId);
        if (!withdrawal) {
            return res.status(404).json({ success: false, message: 'Withdrawal request not found' });
        }

        if (withdrawal.status !== 'PENDING') {
            return res.status(400).json({ success: false, message: 'Withdrawal request is already processed' });
        }

        // 1. Update Withdrawal Status
        withdrawal.status = 'REJECTED';
        withdrawal.notes = reason;
        withdrawal.processedAt = new Date();
        await withdrawal.save();

        // 2. Refund to Astrologer Wallet
        const astrologer = await Astrologer.findById(withdrawal.astrologerId);
        if (astrologer) {
            // Find the User linked to Astrologer to update wallet (Astrologer model has earnings, but maybe wallet is on User or Astrologer? 
            // In AdminController.ts lines 38-40: "earnings" seems to be what is used for withdrawal. 
            // Let's check Astrologer model. It has "earnings" which seems to be the wallet balance for astrologers.
            const previousBalance = astrologer.earnings || 0;
            const refundAmount = withdrawal.amount;
            const newBalance = previousBalance + refundAmount;

            // Use findOneAndUpdate to avoid full-doc validation on legacy records
            await Astrologer.findByIdAndUpdate(astrologer._id, { $set: { earnings: newBalance } });

            // 3. Create Transaction Record (Refund)
            // We need a transaction to show this refund. 
            // Transaction model usually links to User. Astrologer has a userId. 
            // Let's check Transaction model usage in `addWalletBalance` (lines 291+). It uses `fromUser`.
            // For Astrologer withdrawal refund, we should probably record it.

            await Transaction.create({
                fromUser: astrologer.userId, // Link to the user account of the astrologer
                type: 'credit',
                amount: refundAmount,
                description: `Withdrawal Rejected: ${reason}`,
                status: 'success',
                previousBalance,
                newBalance,
                meta: {
                    withdrawalId: withdrawal._id,
                    type: 'withdrawal_refund'
                }
            });

            // 4. Send Notification
            // Create database notification
            await Notification.create({
                title: 'Withdrawal Rejected',
                message: `Your withdrawal request for ₹${refundAmount} has been rejected. Reason: ${reason}. The amount has been refunded to your wallet.`,
                type: 'alert',
                audience: 'user',
                userId: astrologer.userId,
                isRead: false
            });

            // Send push notification
            await notificationService.sendToAstrologer(
                astrologer.userId.toString(),
                {
                    title: 'Withdrawal Rejected',
                    body: `Your withdrawal request for ₹${refundAmount} has been rejected. Reason: ${reason}.`
                },
                {
                    type: 'wallet',
                    click_action: 'WALLET_SCREEN'
                }
            );
        }

        res.status(200).json({
            success: true,
            message: 'Withdrawal rejected and amount refunded successfully',
            data: withdrawal
        });

    } catch (error: any) {
        console.error('rejectWithdrawal error:', error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

// 12. Account Deletion Management

export const getDeletionRequests = async (req: Request, res: Response) => {
    try {
        const { status } = req.query;
        const query: any = {};
        // Default to pending if no status is specified
        query.status = status || 'pending';

        const requests = await DeletionRequest.find(query)
            .populate('astrologerId', 'firstName lastName profilePhoto mobileNumber')
            .populate('userId', 'name mobile profilePhoto')
            .sort({ createdAt: -1 })
            .limit(100);

        res.json({ success: true, data: requests });
    } catch (error: any) {
        console.error('getDeletionRequests error:', error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

export const approveDeletion = async (req: Request, res: Response) => {
    try {
        const { requestId } = req.params;
        const { adminNote } = req.body;

        const request = await DeletionRequest.findById(requestId);
        if (!request) return res.status(404).json({ success: false, message: 'Deletion request not found' });
        if (request.status !== 'pending') return res.status(400).json({ success: false, message: 'Request is already processed or rejected' });

        const astrologerId = request.astrologerId;
        const astrologer = await Astrologer.findById(astrologerId);

        if (astrologer) {
            // Block the astrologer and set status to rejected to prevent re-registration with this number.
            // Use findOneAndUpdate to avoid full-doc validation on legacy records with empty required fields.
            await Astrologer.findByIdAndUpdate(astrologer._id, {
                $set: {
                    isBlocked: true,
                    status: 'rejected',
                    isDeletionRequested: false,
                },
                $unset: { activeDeviceId: '' }
            });

            // Note: In a real production system, you might want to anonymize personal data here
            // e.g., astrologer.firstName = 'Deleted'; astrologer.lastName = 'User';
        }

        request.status = 'processed';
        request.adminNote = adminNote || 'Approved by admin';
        await request.save();

        res.status(200).json({ success: true, message: 'Account deletion approved. Astrologer account blocked.' });
    } catch (error: any) {
        console.error('approveDeletion error:', error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

export const rejectDeletion = async (req: Request, res: Response) => {
    try {
        const { requestId } = req.params;
        const { adminNote } = req.body;

        const request = await DeletionRequest.findById(requestId);
        if (!request) return res.status(404).json({ success: false, message: 'Deletion request not found' });
        if (request.status !== 'pending') return res.status(400).json({ success: false, message: 'Request is already processed or rejected' });

        const astrologerId = request.astrologerId;
        const astrologer = await Astrologer.findById(astrologerId);

        if (astrologer) {
            // Use findOneAndUpdate to avoid full-doc validation on legacy records.
            await Astrologer.findByIdAndUpdate(astrologer._id, {
                $set: { isDeletionRequested: false }
            });
        }

        request.status = 'rejected';
        request.adminNote = adminNote || 'Rejected by admin';
        await request.save();

        res.status(200).json({ success: true, message: 'Account deletion rejected. Astrologer can access panel again.' });
    } catch (error: any) {
        console.error('rejectDeletion error:', error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

// Get Chat Stats for Admin Dashboard
export const getChatStats = async (req: Request, res: Response) => {
    try {
        const { timeframe, month, year, startDate: qStartDate, endDate: qEndDate } = req.query; 
        
        const now = new Date();
        // India Standard Time (UTC + 5:30)
        const istOffset = 5.5 * 60 * 60 * 1000;
        const nowIST = new Date(now.getTime() + istOffset);

        let startDate = new Date();
        let endDate = new Date();
        
        if (timeframe === 'custom' && qStartDate) {
            startDate = new Date(qStartDate as string);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(qEndDate as string || qStartDate as string);
            endDate.setHours(23, 59, 59, 999);
        } else {
            switch(timeframe) {
            case 'today':
                // Boundary of Today in IST, then convert back to UTC for DB query
                startDate = new Date(nowIST.getFullYear(), nowIST.getMonth(), nowIST.getDate(), 0, 0, 0, 0);
                startDate = new Date(startDate.getTime() - istOffset);
                endDate = new Date(nowIST.getFullYear(), nowIST.getMonth(), nowIST.getDate(), 23, 59, 59, 999);
                endDate = new Date(endDate.getTime() - istOffset);
                break;
            case 'yesterday':
                const yesterdayIST = new Date(nowIST);
                yesterdayIST.setDate(nowIST.getDate() - 1);
                startDate = new Date(yesterdayIST.getFullYear(), yesterdayIST.getMonth(), yesterdayIST.getDate(), 0, 0, 0, 0);
                startDate = new Date(startDate.getTime() - istOffset);
                endDate = new Date(yesterdayIST.getFullYear(), yesterdayIST.getMonth(), yesterdayIST.getDate(), 23, 59, 59, 999);
                endDate = new Date(endDate.getTime() - istOffset);
                break;
            case 'monthly':
                startDate = new Date(Number(year), Number(month), 1, 0, 0, 0, 0);
                startDate = new Date(startDate.getTime() - istOffset);
                endDate = new Date(Number(year), Number(month) + 1, 0, 23, 59, 59, 999);
                endDate = new Date(endDate.getTime() - istOffset);
                break;
            case 'yearly':
                startDate = new Date(Number(year), 0, 1, 0, 0, 0, 0);
                startDate = new Date(startDate.getTime() - istOffset);
                endDate = new Date(Number(year), 11, 31, 23, 59, 59, 999);
                endDate = new Date(endDate.getTime() - istOffset);
                break;
            default:
                startDate = new Date(nowIST.getFullYear(), nowIST.getMonth(), nowIST.getDate(), 0, 0, 0, 0);
                startDate = new Date(startDate.getTime() - istOffset);
                endDate = new Date(nowIST.getFullYear(), nowIST.getMonth(), nowIST.getDate(), 23, 59, 59, 999);
                endDate = new Date(endDate.getTime() - istOffset);
            }
        }

        // Completed Chats: Only sessions that actually started (have startTime)
        // Exclude sessions that are missed/failed (never had a real conversation)
        const missedEndReasons = [
            'ASTROLOGER_TIMEOUT',
            'TIMEOUT',
            'ASTROLOGER_REJECTED',
            'ASTROLOGER_OFFLINE_DURING_REQUEST',
            'INSUFFICIENT_BALANCE_AT_ACCEPT'
        ];

        const completedChats = await ChatSession.find({
            createdAt: { $gte: startDate, $lte: endDate },
            status: 'ENDED',
            startTime: { $exists: true, $ne: null },
            endReason: { $nin: missedEndReasons }
        })
        .populate('userId', 'name mobile')
        .populate('astrologerId', 'firstName lastName mobileNumber profilePhoto')
        .sort({ createdAt: -1 });

        // Realtime Active Chats
        const activeChats = await ChatSession.find({ status: 'ACTIVE' })
            .populate('userId', 'name mobile')
            .populate('astrologerId', 'firstName lastName mobileNumber profilePhoto')
            .sort({ createdAt: -1 });

        // Missed Chats: Sessions where chat never actually happened
        // Includes: astrologer missed/rejected/went offline, user cancelled, balance error at accept
        const missedChats = await ChatSession.find({
            createdAt: { $gte: startDate, $lte: endDate },
            $or: [
                { status: 'REJECTED' },
                { status: 'ENDED', endReason: { $in: missedEndReasons } }
            ]
        })
        .populate('userId', 'name mobile')
        .populate('astrologerId', 'firstName lastName mobileNumber profilePhoto')
        .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            data: {
                totalChats: completedChats.length,
                completedChats,
                activeChats,
                missedChatsCount: missedChats.length,
                missedChats
            }
        });
    } catch (error: any) {
        console.error('getChatStats error:', error);
        return res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// Get GST Stats for Admin Dashboard
export const getGstStats = async (req: Request, res: Response) => {
    try {
        const { timeframe, month, year, startDate: qStartDate, endDate: qEndDate } = req.query;
        const now = new Date();
        let startDate = new Date();
        let endDate = new Date();

        if (timeframe === 'custom' && qStartDate) {
            startDate = new Date(qStartDate as string);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(qStartDate as string);
            endDate.setHours(23, 59, 59, 999);
        } else {
            switch(timeframe) {
                case 'today':
                    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
                    endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
                    break;
                case 'yesterday':
                    const yesterday = new Date(now);
                    yesterday.setDate(now.getDate() - 1);
                    startDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0, 0);
                    endDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999);
                    break;
                case 'monthly':
                    startDate = new Date(Number(year), Number(month), 1);
                    endDate = new Date(Number(year), Number(month) + 1, 0, 23, 59, 59, 999);
                    break;
                case 'yearly':
                    startDate = new Date(Number(year), 0, 1);
                    endDate = new Date(Number(year), 11, 31, 23, 59, 59, 999);
                    break;
                default: // all time or invalid
                    startDate = new Date(2000, 0, 1);
                    endDate = new Date(2100, 0, 1);
            }
        }

        const filter = {
            status: 'success',
            type: 'credit',
            gstAmount: { $gt: 0 },
            createdAt: { $gte: startDate, $lte: endDate }
        };

        const transactions = await Transaction.find(filter)
            .populate('fromUser', 'name mobile')
            .sort({ createdAt: -1 });

        const totalGst = transactions.reduce((acc, curr) => acc + (curr.gstAmount || 0), 0);

        return res.status(200).json({
            success: true,
            data: {
                totalGst,
                transactions
            }
        });
    } catch (error: any) {
        console.error('getGstStats error:', error);
        return res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// --- Review Management ---

/**
 * Get all pending reviews for admin approval
 */
export const getPendingReviews = async (req: Request, res: Response) => {
    try {
        const reviews = await ChatReview.find({ status: 'pending' })
            .populate('userId', 'name mobile')
            .populate('astrologerId', 'firstName lastName profilePhoto')
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, data: reviews });
    } catch (error: any) {
        console.error('getPendingReviews error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

/**
 * Approve a review and trigger rating recalculation
 */
export const approveReview = async (req: Request, res: Response) => {
    try {
        const { reviewId } = req.params;
        const review = await ChatReview.findByIdAndUpdate(reviewId, { status: 'approved' }, { new: true });

        if (!review) {
            return res.status(404).json({ success: false, message: 'Review not found' });
        }

        // Trigger average rating recalculation to keep Astrologer document in sync
        if (review.astrologerId) {
            await chatService.updateAstrologerAverageRating(review.astrologerId.toString());
        }

        res.status(200).json({ success: true, message: 'Review approved and rating updated', data: review });
    } catch (error: any) {
        console.error('approveReview error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

/**
 * Reject a review
 */
export const rejectReview = async (req: Request, res: Response) => {
    try {
        const { reviewId } = req.params;
        const review = await ChatReview.findByIdAndUpdate(reviewId, { status: 'rejected' }, { new: true });

        if (!review) {
            return res.status(404).json({ success: false, message: 'Review not found' });
        }

        // Trigger update in case it was previously approved
        if (review.astrologerId) {
            await chatService.updateAstrologerAverageRating(review.astrologerId.toString());
        }

        res.status(200).json({ success: true, message: 'Review rejected', data: review });
    } catch (error: any) {
        console.error('rejectReview error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

/**
 * Get all reviews with optional status filter and pagination
 */
export const getAllReviews = async (req: Request, res: Response) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const filter: any = {};
        if (status && status !== 'all') {
            if (status === 'approved') {
                filter.$or = [{ status: 'approved' }, { status: { $exists: false } }];
            } else {
                filter.status = status;
            }
        }

        const reviews = await ChatReview.find(filter)
            .populate('userId', 'name mobile')
            .populate('astrologerId', 'firstName lastName profilePhoto')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(Number(limit));

        const total = await ChatReview.countDocuments(filter);

        res.status(200).json({
            success: true,
            data: reviews,
            pagination: {
                total,
                page: Number(page),
                limit: Number(limit),
                pages: Math.ceil(total / Number(limit))
            }
        });
    } catch (error: any) {
        console.error('getAllReviews error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

/**
 * Update a review (rating and/or text)
 */
export const updateReview = async (req: Request, res: Response) => {
    try {
        const { reviewId } = req.params;
        const { rating, reviewText, status } = req.body;

        const review = await ChatReview.findById(reviewId);
        if (!review) {
            return res.status(404).json({ success: false, message: 'Review not found' });
        }

        if (rating !== undefined) review.rating = rating;
        if (reviewText !== undefined) review.reviewText = reviewText;
        if (status !== undefined) review.status = status;

        await review.save();

        // Recalculate astrologer rating if it is approved
        if (review.astrologerId) {
            await chatService.updateAstrologerAverageRating(review.astrologerId.toString());
        }

        res.status(200).json({ success: true, message: 'Review updated', data: review });
    } catch (error: any) {
        console.error('updateReview error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
}

// 12. Start Pop-up Management
export const getStartPopups = async (req: Request, res: Response) => {
    try {
        const popups = await StartPopup.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: popups });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error });
    }
};

export const getActiveStartPopups = async (req: Request, res: Response) => {
    try {
        const { app } = req.query; // e.g., ?app=astrologer
        
        let query: any = { isActive: true };
        
        if (app) {
            query.targetApp = app;
        } else {
            // Default backward compatibility: show popups meant for users
            query.targetApp = { $in: ['user', null, undefined] };
        }

        const popups = await StartPopup.find(query).sort({ createdAt: -1 });

        // Prevent caching for real-time pop-ups
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');

        res.status(200).json({ success: true, data: popups });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error });
    }
};

export const createStartPopup = async (req: Request, res: Response) => {
    try {
        const { imageBase64, navigationType, navigationValue, targetApp, isActive, showOnStart, dailyLimit } = req.body;

        if (!imageBase64) {
            return res.status(400).json({ success: false, message: 'Image is required' });
        }

        const imageUrl = await uploadBase64ToR2(imageBase64, 'popups', `popup-${Date.now()}`);
        if (!imageUrl) {
            return res.status(500).json({ success: false, message: 'Failed to upload image' });
        }

        const newPopup = new StartPopup({
            imageUrl,
            navigationType,
            navigationValue,
            targetApp: targetApp || 'user',
            isActive: isActive !== undefined ? isActive : true,
            showOnStart: showOnStart !== undefined ? showOnStart : false,
            dailyLimit: dailyLimit !== undefined ? dailyLimit : 1
        });

        await newPopup.save();
        res.status(201).json({ success: true, data: newPopup });
    } catch (error) {
        console.error('Create start popup error:', error);
        res.status(500).json({ success: false, message: 'Server Error', error });
    }
};

export const updateStartPopup = async (req: Request, res: Response) => {
    try {
        const { popupId } = req.params;
        const { imageBase64, navigationType, navigationValue, targetApp, isActive, showOnStart, dailyLimit } = req.body;

        const popup = await StartPopup.findById(popupId);
        if (!popup) {
            return res.status(404).json({ success: false, message: 'Pop-up not found' });
        }

        const updateData: any = {
            navigationType,
            navigationValue,
            isActive: isActive !== undefined ? isActive : true,
            showOnStart: showOnStart !== undefined ? showOnStart : false,
            dailyLimit: dailyLimit !== undefined ? dailyLimit : 1
        };

        if (targetApp) {
            updateData.targetApp = targetApp;
        }

        if (imageBase64) {
            // Delete old image if new one is provided
            const key = getKeyFromUrl(popup.imageUrl);
            if (key) {
                await deleteFromR2(key).catch(err => console.error('Failed to delete old popup image:', err));
            }

            const newImageUrl = await uploadBase64ToR2(imageBase64, 'popups', `popup-${Date.now()}`);
            if (newImageUrl) {
                updateData.imageUrl = newImageUrl;
            }
        }

        const updatedPopup = await StartPopup.findByIdAndUpdate(popupId, updateData, { new: true });
        res.status(200).json({ success: true, data: updatedPopup });
    } catch (error) {
        console.error('Update start popup error:', error);
        res.status(500).json({ success: false, message: 'Server Error', error });
    }
};

export const deleteStartPopup = async (req: Request, res: Response) => {
    try {
        const { popupId } = req.params;
        const popup = await StartPopup.findById(popupId);

        if (!popup) {
            return res.status(404).json({ success: false, message: 'Pop-up not found' });
        }

        // Delete from R2
        const key = getKeyFromUrl(popup.imageUrl);
        if (key) {
            await deleteFromR2(key).catch(err => console.error('Failed to delete popup image from R2:', err));
        }

        await StartPopup.findByIdAndDelete(popupId);
        res.status(200).json({ success: true, message: 'Pop-up deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error });
    }
};
