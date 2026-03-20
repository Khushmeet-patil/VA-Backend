import { Request, Response } from 'express';
import Astrologer from '../models/Astrologer';
import User from '../models/User';
import AstrologerFollower from '../models/AstrologerFollower';
import ChatReview from '../models/ChatReview';
import Skill from '../models/Skill';
import { getIOInstance } from '../services/scheduler';
import { notificationService } from '../services/notificationService';
import mongoose from 'mongoose';

// Apply for Astrologer (User or Guest)
export const applyForAstrologer = async (req: Request, res: Response) => {
    try {
        let userId = (req as any).userId;
        const {
            firstName,
            lastName,
            gender,
            mobileNumber,
            email,
            experience,
            city,
            country,
            systemKnown,
            language,
            bio,
            aboutMe
        } = req.body;

        // Validation for required fields
        if (!firstName || !lastName || !mobileNumber || !email || !city || !country) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        // If not authenticated, find or create user
        if (!userId) {
            // Check if user exists with this mobile number
            let user = await User.findOne({ mobile: mobileNumber });

            if (!user) {
                // Create new user for this applicant
                user = new User({
                    mobile: mobileNumber,
                    name: `${firstName} ${lastName}`,
                    role: 'user', // Default role, will be updated to 'astrologer' upon approval
                    isVerified: false
                });
                await user.save();
            }

            userId = user._id;
        }

        // Check if already applied as an astrologer
        const existing = await Astrologer.findOne({ userId });
        if (existing) {
            return res.status(400).json({ message: 'You have already applied. Current status: ' + existing.status });
        }

        const astrologer = new Astrologer({
            userId,
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
            status: 'under_review'
        });

        await astrologer.save();
        res.status(201).json({ message: 'Application submitted successfully', astrologer });
    } catch (error: any) {
        console.error('Apply for astrologer error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Get all applications (Admin)
export const getAllApplications = async (req: Request, res: Response) => {
    try {
        const { status } = req.query;
        const filter: any = {};
        if (status) {
            filter.status = status;
        }

        const applications = await Astrologer.find(filter)
            .populate('userId', 'mobile name')
            .sort({ createdAt: -1 });

        res.json(applications);
    } catch (error: any) {
        console.error('Get applications error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Update application status (Admin)
export const updateApplicationStatus = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!['approved', 'under_review', 'rejected'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        const astrologer = await Astrologer.findByIdAndUpdate(
            id,
            { status },
            { new: true }
        );

        if (!astrologer) {
            return res.status(404).json({ message: 'Application not found' });
        }

        // If approved, update user role to astrologer
        if (status === 'approved') {
            await User.findByIdAndUpdate(astrologer.userId, { role: 'astrologer' });
        } else if (status === 'rejected') {
            // Optionally revert role back to user if previously approved
            await User.findByIdAndUpdate(astrologer.userId, { role: 'user' });
        }

        res.json({ message: 'Status updated successfully', astrologer });
    } catch (error: any) {
        console.error('Update status error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Get approved astrologers (Public) - excludes blocked astrologers
export const getApprovedAstrologers = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId; // Optional, might be passed from optionalAuthMiddleware

        // Check if user is eligible for free chat (first time user)
        let isFreeChatUser = false;
        if (userId) {
            const user = await User.findById(userId);
            if (user && !user.hasUsedFreeTrial) {
                isFreeChatUser = true;
            }
        }

        // Extract search, specialty, and sortBy from query
        const { search, specialty, sortBy, excludeIds } = req.query;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const skip = (page - 1) * limit;

        // Convert excludeIds to array of ObjectIds
        let excludeIdsArray: any[] = [];
        if (excludeIds) {
            let idsList: any[] = [];
            if (Array.isArray(excludeIds)) {
                idsList = excludeIds;
            } else if (typeof excludeIds === 'string') {
                idsList = excludeIds.split(',');
            } else if (typeof excludeIds === 'object' && excludeIds !== null) {
                // Handle ParsedQs (object with numeric indices)
                idsList = Object.values(excludeIds);
            }

            excludeIdsArray = idsList
                .filter(id => id && typeof id === 'string' && mongoose.Types.ObjectId.isValid(id))
                .map(id => new mongoose.Types.ObjectId(id as string));
        }

        // Optimized field selection for lighter payload
        const projection = {
            firstName: 1,
            lastName: 1,
            systemKnown: 1,
            specialties: 1,
            experience: 1,
            rating: 1,
            reviewsCount: 1,
            pricePerMin: 1,
            isOnline: 1,
            language: 1,
            bio: 1,
            profilePhoto: 1,
            tag: 1,
            isBusy: 1,
            status: 1
        };

        const query: any = {
            status: 'approved',
            isBlocked: { $ne: true },
            isDeletionRequested: { $ne: true },
            activeDeviceId: { $exists: true }
        };

        if (excludeIdsArray.length > 0) {
            query._id = { $nin: excludeIdsArray };
        }

        // Search filter (name, skills/specialties, or price)
        if (search) {
            const searchRegex = new RegExp(search as string, 'i');
            const searchOr: any[] = [
                { firstName: { $regex: searchRegex } },
                { lastName: { $regex: searchRegex } },
                { systemKnown: { $in: [searchRegex] } },
                { specialties: { $in: [searchRegex] } }
            ];

            // If search query is a number, also search by price
            const searchPrice = parseFloat(search as string);
            if (!isNaN(searchPrice)) {
                searchOr.push({ pricePerMin: { $lte: searchPrice } });
            }

            query.$or = searchOr;
        }

        // Specialty filter
        if (specialty) {
            const specialtyRegex = new RegExp(specialty as string, 'i');
            // If query.$or already exists from search, we need to wrap it in $and
            const specialtyQuery = {
                $or: [
                    { systemKnown: { $in: [specialtyRegex] } },
                    { specialties: { $in: [specialtyRegex] } }
                ]
            };

            if (query.$or) {
                query.$and = [{ $or: query.$or }, specialtyQuery];
                delete query.$or;
            } else {
                query.$or = specialtyQuery.$or;
            }
        }

        // IF user is eligible for free chat, HIDE astrologers who reached their daily limit
        if (isFreeChatUser) {
            console.log(`[getApprovedAstrologers] User ${userId} is eligible for free chat. Filtering astrologers...`);
            
            const freeChatQuery: any = {
                $expr: {
                    $lt: [{ $ifNull: ["$freeChatsToday", 0] }, "$freeChatLimit"]
                },
                freeChatLimit: { $gt: 0 },
                isFreeChatAvailable: true
            };

            if (query.$and) {
                query.$and.push(freeChatQuery);
            } else if (query.$or) {
                // If we have $or, we need to move it into $and with the free chat query
                const existingOr = query.$or;
                delete query.$or;
                query.$and = [{ $or: existingOr }, freeChatQuery];
            } else {
                // No search/specialty, just add free chat conditions
                Object.assign(query, freeChatQuery);
            }
        }

        let astrologers: any[];

        if (sortBy === 'random') {
            // Use aggregation for random sampling with priority
            const pipeline: any[] = [
                { $match: query },
                {
                    $addFields: {
                        randomSortField: { $rand: {} }
                    }
                },
                {
                    $sort: {
                        isOnline: -1,
                        randomSortField: 1
                    }
                },
                { $limit: limit },
                {
                    $project: {
                        firstName: 1, lastName: 1, systemKnown: 1, language: 1, bio: 1,
                        aboutMe: 1, experience: 1, rating: 1, reviewsCount: 1, followersCount: 1,
                        isOnline: 1, isBusy: 1, pricePerMin: 1, priceRangeMin: 1, priceRangeMax: 1,
                        profilePhoto: 1, specialties: 1, tag: 1, isFreeChatAvailable: 1,
                        freeChatLimit: 1, freeChatsToday: 1
                    }
                }
            ];
            astrologers = await Astrologer.aggregate(pipeline);
        } else {
            // Determine sort order
            let sort: any = { isOnline: -1, rating: -1 };
            if (sortBy) {
                switch (sortBy) {
                    case 'rating':
                        sort = { rating: -1, isOnline: -1 };
                        break;
                    case 'experience':
                        sort = { experience: -1, isOnline: -1 };
                        break;
                    case 'price_low':
                        sort = { pricePerMin: 1, isOnline: -1 };
                        break;
                    case 'price_high':
                        sort = { pricePerMin: -1, isOnline: -1 };
                        break;
                }
            }

            astrologers = await Astrologer.find(query)
                .select('firstName lastName systemKnown language bio aboutMe experience rating reviewsCount followersCount isOnline isBusy pricePerMin priceRangeMin priceRangeMax profilePhoto specialties tag isFreeChatAvailable freeChatLimit freeChatsToday')
                .sort(sort)
                .skip(skip)
                .limit(limit)
                .lean();
        }

        const total = await Astrologer.countDocuments(query);

        // Prevent caching of this response
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');

        res.json({
            success: true,
            data: astrologers,
            pagination: {
                page,
                limit,
                total,
                hasMore: total > astrologers.length
            }
        });
    } catch (error: any) {
        console.error('Get astrologers error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Get tagged astrologers (Celebrity, Top Choice, Rising Star) - for Home Screen "Top Astrologers"
export const getTaggedAstrologers = async (req: Request, res: Response) => {
    try {
        const query: any = {
            status: 'approved',
            isBlocked: { $ne: true },
            isDeletionRequested: { $ne: true },
            activeDeviceId: { $exists: true },
            tag: { $in: ['Celebrity', 'Top Choice', 'Rising Star'] }
        };

        const astrologers = await Astrologer.find(query)
            .select('firstName lastName systemKnown language bio aboutMe experience rating reviewsCount followersCount isOnline isBusy pricePerMin priceRangeMin priceRangeMax profilePhoto specialties tag isFreeChatAvailable freeChatLimit freeChatsToday')
            .sort({ isOnline: -1, rating: -1 })
            .lean();

        // Prevent caching - tagged astrologers change when admin assigns/updates tags or astrologers go online/offline
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');

        res.json({
            success: true,
            data: astrologers
        });
    } catch (error: any) {
        console.error('Get tagged astrologers error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Get detailed astrologer profile (Public with optional auth for follow status)
export const getAstrologerProfile = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = (req as any).userId; // Optional - may be undefined for unauthenticated requests

        const astrologer = await Astrologer.findById(id)
            .select('firstName lastName systemKnown language bio aboutMe experience rating reviewsCount followersCount isOnline isBusy pricePerMin priceRangeMin priceRangeMax profilePhoto specialties totalChats tag')
            .lean();

        if (!astrologer) {
            return res.status(404).json({ success: false, message: 'Astrologer not found' });
        }

        // Check if current user is following this astrologer
        let isFollowing = false;
        let userRating = null;
        if (userId) {
            const follow = await AstrologerFollower.findOne({ userId, astrologerId: id });
            isFollowing = !!follow;

            // Check if user has already rated this astrologer
            const existingRating = await ChatReview.findOne({
                userId,
                astrologerId: id
            });
            if (existingRating) {
                userRating = {
                    rating: existingRating.rating,
                    reviewText: existingRating.reviewText || ''
                };
            }
        }

        // Get rating distribution
        const ratingDistribution = await ChatReview.aggregate([
            { $match: { astrologerId: astrologer._id } },
            { $group: { _id: '$rating', count: { $sum: 1 } } },
            { $sort: { _id: -1 } }
        ]);

        const ratingCounts: { [key: number]: number } = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
        ratingDistribution.forEach((r: any) => {
            ratingCounts[r._id] = r.count;
        });

        res.json({
            success: true,
            data: {
                ...astrologer,
                isFollowing,
                userRating,
                ratingDistribution: ratingCounts
            }
        });
    } catch (error: any) {
        console.error('Get astrologer profile error:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// Get astrologer reviews (Public)
export const getAstrologerReviews = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const skip = (page - 1) * limit;

        const reviews = await ChatReview.find({ astrologerId: id })
            .populate('userId', 'name')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const totalReviews = await ChatReview.countDocuments({ astrologerId: id });

        res.json({
            success: true,
            data: {
                reviews: reviews.map((r: any) => ({
                    id: r._id,
                    name: r.userId?.name || 'User',
                    rating: r.rating,
                    text: r.reviewText || '',
                    date: r.createdAt
                })),
                pagination: {
                    page,
                    limit,
                    total: totalReviews,
                    hasMore: skip + reviews.length < totalReviews
                }
            }
        });
    } catch (error: any) {
        console.error('Get astrologer reviews error:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// Follow an astrologer (User)
export const followAstrologer = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;
        const { astrologerId } = req.body;

        if (!astrologerId) {
            return res.status(400).json({ success: false, message: 'Astrologer ID is required' });
        }

        // Check if astrologer exists
        const astrologer = await Astrologer.findById(astrologerId);
        if (!astrologer) {
            return res.status(404).json({ success: false, message: 'Astrologer not found' });
        }

        // Check if already following
        const existingFollow = await AstrologerFollower.findOne({ userId, astrologerId });
        if (existingFollow) {
            return res.status(400).json({ success: false, message: 'Already following this astrologer' });
        }

        // Create follow record
        await new AstrologerFollower({ userId, astrologerId }).save();

        // Increment followers count
        await Astrologer.updateOne({ _id: astrologerId }, { $inc: { followersCount: 1 } });

        const updatedAstrologer = await Astrologer.findById(astrologerId).select('followersCount');

        res.json({
            success: true,
            message: 'Now following astrologer',
            followersCount: updatedAstrologer?.followersCount || 0
        });
    } catch (error: any) {
        console.error('Follow astrologer error:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// Unfollow an astrologer (User)
export const unfollowAstrologer = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;
        const { astrologerId } = req.body;

        if (!astrologerId) {
            return res.status(400).json({ success: false, message: 'Astrologer ID is required' });
        }

        // Check if following
        const existingFollow = await AstrologerFollower.findOne({ userId, astrologerId });
        if (!existingFollow) {
            return res.status(400).json({ success: false, message: 'Not following this astrologer' });
        }

        // Delete follow record
        await AstrologerFollower.deleteOne({ userId, astrologerId });

        // Decrement followers count (ensure it doesn't go below 0)
        await Astrologer.updateOne(
            { _id: astrologerId, followersCount: { $gt: 0 } },
            { $inc: { followersCount: -1 } }
        );

        const updatedAstrologer = await Astrologer.findById(astrologerId).select('followersCount');

        res.json({
            success: true,
            message: 'Unfollowed astrologer',
            followersCount: updatedAstrologer?.followersCount || 0
        });
    } catch (error: any) {
        console.error('Unfollow astrologer error:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// Check follow status (User)
export const checkFollowStatus = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;
        const { astrologerId } = req.params;

        const follow = await AstrologerFollower.findOne({ userId, astrologerId });

        res.json({
            success: true,
            isFollowing: !!follow
        });
    } catch (error: any) {
        console.error('Check follow status error:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// Rate an astrologer (User)
export const rateAstrologer = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;
        const { astrologerId, rating, reviewText } = req.body;

        if (!astrologerId) {
            return res.status(400).json({ success: false, message: 'Astrologer ID is required' });
        }

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
        }

        // Check if astrologer exists
        const astrologer = await Astrologer.findById(astrologerId);
        if (!astrologer) {
            return res.status(404).json({ success: false, message: 'Astrologer not found' });
        }

        // Check if user already rated this astrologer (allow updating existing rating)
        const existingReview = await ChatReview.findOne({
            userId,
            astrologerId,
            sessionId: { $regex: /^direct-/ }  // Direct ratings have sessionId starting with 'direct-'
        });

        if (existingReview) {
            // Update existing rating
            const oldRating = existingReview.rating;
            existingReview.rating = rating;
            existingReview.reviewText = reviewText;
            await existingReview.save();

            // Update astrologer's average rating
            // Subtract old rating, add new rating
            const newTotalSum = (astrologer.totalRatingSum || 0) - oldRating + rating;
            const newAverage = astrologer.reviewsCount > 0 ? newTotalSum / astrologer.reviewsCount : rating;

            await Astrologer.updateOne(
                { _id: astrologerId },
                {
                    $set: {
                        rating: Math.round(newAverage * 10) / 10,
                        totalRatingSum: newTotalSum
                    }
                }
            );

            res.json({
                success: true,
                message: 'Rating updated successfully',
                review: existingReview
            });
        } else {
            // Create new rating
            const review = new ChatReview({
                sessionId: `direct-${userId}-${astrologerId}-${Date.now()}`,
                userId,
                astrologerId,
                rating,
                reviewText
            });
            await review.save();

            // Update astrologer's average rating
            const newReviewsCount = (astrologer.reviewsCount || 0) + 1;
            const newTotalSum = (astrologer.totalRatingSum || 0) + rating;
            const newAverage = newTotalSum / newReviewsCount;

            await Astrologer.updateOne(
                { _id: astrologerId },
                {
                    $set: {
                        rating: Math.round(newAverage * 10) / 10,
                        totalRatingSum: newTotalSum,
                        reviewsCount: newReviewsCount
                    }
                }
            );

            res.json({
                success: true,
                message: 'Rating submitted successfully',
                review
            });
        }
    } catch (error: any) {
        console.error('Rate astrologer error:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// Get availability schedule (Astrologer)
export const getSchedule = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;

        // Try finding by Astrologer ID first (Astrologer Token)
        console.log(`[getSchedule] Looking up schedule for ID: ${userId}`);
        let astrologer = await Astrologer.findById(userId).select('availabilitySchedule isAutoOnlineEnabled');

        // If not found, try finding by User ID (User Token)
        if (!astrologer) {
            console.log(`[getSchedule] Not found by ID, trying by userId: ${userId}`);
            astrologer = await Astrologer.findOne({ userId }).select('availabilitySchedule isAutoOnlineEnabled');
        }

        if (!astrologer) {
            console.log('[getSchedule] Astrologer not found for ID:', userId);
            return res.status(404).json({ success: false, message: 'Astrologer not found' });
        } else {
            console.log(`[getSchedule] Found astrologer: ${astrologer._id}`);
        }

        // Ensure schedule exists in DB
        if (!astrologer.availabilitySchedule) {
            astrologer.availabilitySchedule = [];
        }

        res.json({
            success: true,
            data: {
                availabilitySchedule: astrologer.availabilitySchedule,
                isAutoOnlineEnabled: astrologer.isAutoOnlineEnabled
            }
        });
    } catch (error: any) {
        console.error('Get schedule error:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// Update availability schedule (Astrologer)
export const updateSchedule = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;
        const { availabilitySchedule, isAutoOnlineEnabled } = req.body;

        // Try finding by Astrologer ID first
        let astrologer = await Astrologer.findById(userId);

        // Fallback to User ID
        if (!astrologer) {
            astrologer = await Astrologer.findOne({ userId });
        }

        if (!astrologer) {
            return res.status(404).json({ success: false, message: 'Astrologer not found' });
        }

        if (availabilitySchedule) {
            astrologer.availabilitySchedule = availabilitySchedule;
            (astrologer as any).isManualOverride = false; // Clear override on schedule update
        }

        if (typeof isAutoOnlineEnabled === 'boolean') {
            astrologer.isAutoOnlineEnabled = isAutoOnlineEnabled;
            // Also clear override if they toggle auto-online
            if (isAutoOnlineEnabled) {
                (astrologer as any).isManualOverride = false;
            }
        }

        // --- NEW: Immediate Auto-Online Check ---
        if (astrologer.isAutoOnlineEnabled) {
            const nowUTC = new Date();
            const istOffset = 5.5 * 60 * 60 * 1000;
            const now = new Date(nowUTC.getTime() + istOffset);

            const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const currentDay = days[now.getUTCDay()];

            const hours = now.getUTCHours().toString().padStart(2, '0');
            const minutes = now.getUTCMinutes().toString().padStart(2, '0');
            const currentMins = parseInt(hours) * 60 + parseInt(minutes);

            const todaySchedule = astrologer.availabilitySchedule.find(s => s.day === currentDay);
            let shouldBeOnline = false;

            if (todaySchedule && todaySchedule.enabled) {
                const startMins = parseInt(todaySchedule.startTime.split(':')[0]) * 60 + parseInt(todaySchedule.startTime.split(':')[1]);
                const endMins = parseInt(todaySchedule.endTime.split(':')[0]) * 60 + parseInt(todaySchedule.endTime.split(':')[1]);
                shouldBeOnline = currentMins >= startMins && currentMins < endMins;
            }

            const expectedState = shouldBeOnline ? 'online' : 'offline';
            const statusChanged = astrologer.isOnline !== shouldBeOnline;

            astrologer.isOnline = shouldBeOnline;
            astrologer.expectedScheduleState = expectedState;
            
            console.log(`[updateSchedule] Auto-online check for ${astrologer.firstName}: shouldBeOnline=${shouldBeOnline}, statusChanged=${statusChanged}`);

            if (statusChanged) {
                const io = getIOInstance();
                if (io) {
                    const room = `astrologer:${astrologer._id.toString()}`;
                    io.to(room).emit('ASTROLOGER_STATUS_UPDATED', { isOnline: shouldBeOnline });
                    console.log(`[updateSchedule] Emitted status update to ${room}`);
                }

                if (shouldBeOnline) {
                    try {
                        const firstName = astrologer.firstName.charAt(0).toUpperCase() + astrologer.firstName.slice(1);
                        const lastName = astrologer.lastName.charAt(0).toUpperCase() + astrologer.lastName.slice(1);
                        notificationService.broadcast('users', {
                            title: 'Astrologer Online!',
                            body: `${firstName} ${lastName} is now available for consultation.`
                        }, {
                            type: 'astrologer_online',
                            astrologerId: astrologer._id.toString()
                        }).catch(err => console.error('[updateSchedule] Broadcast error:', err));
                    } catch (notifyError) {
                        console.error(`[updateSchedule] Failed to send notification:`, notifyError);
                    }
                }
            }
        }
        // --- END ---

        await astrologer.save();

        res.json({
            success: true,
            message: 'Schedule updated successfully',
            data: {
                availabilitySchedule: astrologer.availabilitySchedule,
                isAutoOnlineEnabled: astrologer.isAutoOnlineEnabled,
                isOnline: astrologer.isOnline
            }
        });
    } catch (error: any) {
        console.error('Update schedule error:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// Get all skills (Public)
export const getAllSkills = async (req: Request, res: Response) => {
    try {
        const skills = await Skill.find().sort({ name: 1 });

        // Prevent caching of this response
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');

        res.json({ success: true, data: skills });
    } catch (error: any) {
        console.error('Get all skills error:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};
