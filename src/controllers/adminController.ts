
import { Request, Response } from 'express';
import User from '../models/User';
import Astrologer from '../models/Astrologer';
import Transaction from '../models/Transaction';
import Notification from '../models/Notification';
import ChatReview from '../models/ChatReview';
import AstrologerFollower from '../models/AstrologerFollower';
import Banner from '../models/Banner';
import Skill from '../models/Skill';
import { uploadBase64ToR2, deleteFromR2, getKeyFromUrl } from '../services/r2Service';
import notificationService from '../services/notificationService';
import scheduledNotificationService from '../services/scheduledNotificationService';


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
        const review = await ChatReview.findByIdAndDelete(reviewId);
        if (!review) return res.status(404).json({ success: false, message: 'Review not found' });
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
        const { name, mobile, email, walletBalance, isBlocked } = req.body;

        if (!name || !mobile) {
            return res.status(400).json({ success: false, message: 'Name and Mobile are required' });
        }

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
            firstName, lastName, gender, mobileNumber, email,
            experience, city, country, systemKnown, language, bio,
            pricePerMin, priceRangeMin, priceRangeMax, tag, specialties
        } = req.body;

        if (!mobileNumber || !firstName || !lastName) {
            return res.status(400).json({ success: false, message: 'FirstName, LastName and Mobile are required' });
        }

        // 1. Check if user already exists
        const existingUser = await User.findOne({ mobile: mobileNumber });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'User with this mobile number already exists' });
        }

        // 2. Create User first
        const newUser = new User({
            name: `${firstName} ${lastName}`.trim(),
            mobile: mobileNumber,
            role: 'astrologer',
            isVerified: true,
            isBlocked: false
        });

        const savedUser = await newUser.save();

        // 3. Create Astrologer Profile
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
            status: 'approved', // Admin created are approved by default
            pricePerMin: pricePerMin || 20,
            priceRangeMin: priceRangeMin || 10,
            priceRangeMax: priceRangeMax || 100,
            tag: tag || 'None',
            specialties: specialties || []
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
        const {
            isBlocked, priceRangeMin, priceRangeMax, pricePerMin, tag,
            firstName, lastName, email, mobileNumber, experience, city, country, bio, specialties
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
        if (bio) updateData.bio = bio;
        if (Array.isArray(specialties)) updateData.specialties = specialties;

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

        const skill = await Skill.findByIdAndUpdate(skillId, { name }, { new: true });
        if (!skill) {
            return res.status(404).json({ success: false, message: 'Skill not found' });
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

        const skill = await Skill.findByIdAndDelete(skillId);
        if (!skill) {
            return res.status(404).json({ success: false, message: 'Skill not found' });
        }

        res.status(200).json({ success: true, message: 'Skill deleted successfully' });
    } catch (error) {
        console.error('Delete skill error:', error);
        res.status(500).json({ success: false, message: 'Server Error', error });
    }
};
