import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import Astrologer from '../models/Astrologer';
import User from '../models/User';
import Otp from '../models/Otp';
import ChatSession from '../models/ChatSession';
import ChatMessage from '../models/ChatMessage';
import Withdrawal from '../models/Withdrawal';
import ChatReview from '../models/ChatReview';
import ProfileChangeRequest from '../models/ProfileChangeRequest';
import mongoose from 'mongoose';
import { uploadBase64ToR2, deleteFromR2, getKeyFromUrl } from '../services/r2Service';
import { getSettingValue } from './systemSettingController';
import { notificationService } from '../services/notificationService';
import { sendSmsOtp } from '../services/smsService';
import DeletionRequest from '../models/DeletionRequest';
import availabilityService from '../services/availabilityService';
import AstrologerAvailabilityLog from '../models/AstrologerAvailabilityLog';

// Check if astrologer exists by mobile
export const checkAstrologer = async (req: Request, res: Response) => {
    try {
        const { mobile } = req.body;

        if (!mobile) {
            return res.status(400).json({ success: false, message: 'Mobile number required' });
        }

        const astrologer = await Astrologer.findOne({ mobileNumber: mobile });

        if (!astrologer) {
            return res.json({ exists: false });
        }

        res.json({
            exists: true,
            status: astrologer.status,
        });
    } catch (error: any) {
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// Send OTP to astrologer
export const sendAstrologerOtp = async (req: Request, res: Response) => {
    try {
        const { mobile, deviceId } = req.body;

        if (!mobile) {
            return res.status(400).json({ success: false, message: 'Mobile number required' });
        }

        // Check if astrologer exists and is approved
        const astrologer = await Astrologer.findOne({ mobileNumber: mobile });
        if (!astrologer) {
            return res.status(404).json({ success: false, message: 'Astrologer not found' });
        }

        if (astrologer.status !== 'approved') {
            return res.status(403).json({ success: false, message: 'Not approved' });
        }

        // Device-based login restriction: check before sending OTP
        if (deviceId && astrologer.activeDeviceId && astrologer.activeDeviceId !== deviceId) {
            // STRICT ENFORCEMENT: Block login if device ID doesn't match
            return res.status(409).json({
                success: false,
                message: 'This number is already logged in on another device. Please logout from there to login here.'
            });
        }

        // Generate OTP (dev mode: use 1234 for testing)
        // const otpCode = mobile === '9999999999' ? '1234' : Math.floor(1000 + Math.random() * 9000).toString();

        let otpCode = Math.floor(1000 + Math.random() * 9000).toString();
        if (['7990358821', '2345678901', '9999999999', '8957751054', '8888888888'].includes(mobile)) {
            otpCode = '1234';
        }

        // Save OTP
        await Otp.findOneAndUpdate(
            { mobile },
            { mobile, otp: otpCode, createdAt: new Date() },
            { upsert: true, new: true }
        );

        // In production, send OTP via SMS here
        console.log(`OTP for ${mobile}: ${otpCode}`);

        await sendSmsOtp(mobile, otpCode, 'VedicPannel');

        res.json({ success: true, message: 'OTP sent successfully' });
    } catch (error: any) {
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// Verify OTP and login astrologer
export const verifyAstrologerOtp = async (req: Request, res: Response) => {
    try {
        const { mobile, otp, deviceId } = req.body;

        console.log(`[verifyAstrologerOtp] Attempting verification for mobile: ${mobile}, otp: ${otp}`);

        if (!mobile || !otp) {
            return res.status(400).json({ success: false, message: 'Mobile and OTP required' });
        }

        // Dev bypass for testing - specific test number with '1234'
        const testNumbers = ['7990358821', '2345678901', '9999999999', '8957751054', '8888888888'];
        const isTestNumber = testNumbers.includes(mobile);
        const isDevBypass = otp === '1234' && isTestNumber;

        let isValidOtp = false;
        if (isDevBypass) {
            console.log(`[verifyAstrologerOtp] Dev bypass activated for ${mobile}`);
            isValidOtp = true;
        } else {
            // Check OTP in database
            const storedOtp = await Otp.findOne({ mobile, otp });
            if (storedOtp) {
                console.log(`[verifyAstrologerOtp] Valid OTP found in database`);
                isValidOtp = true;
            } else {
                console.log(`[verifyAstrologerOtp] OTP not found in database`);
            }
        }

        if (!isValidOtp) {
            return res.status(400).json({ success: false, message: 'Invalid OTP' });
        }

        // Delete used OTP (don't fail if it doesn't exist - might be dev bypass)
        try {
            await Otp.deleteOne({ mobile });
        } catch (deleteError) {
            console.log(`[verifyAstrologerOtp] Error deleting OTP (non-critical):`, deleteError);
        }

        // Find astrologer
        const astrologer = await Astrologer.findOne({ mobileNumber: mobile });
        if (!astrologer) {
            return res.status(404).json({ success: false, message: 'Astrologer not found' });
        }

        if (astrologer.status !== 'approved') {
            return res.status(403).json({ success: false, message: 'Not approved' });
        }

        if (astrologer.isBlocked) {
            return res.status(403).json({ success: false, message: 'Your account has been blocked. Please contact admin.' });
        }

        // Device-based login restriction
        if (deviceId && astrologer.activeDeviceId && astrologer.activeDeviceId !== deviceId) {
            // STRICT ENFORCEMENT
            return res.status(409).json({
                success: false,
                message: 'This number is already logged in on another device. Please logout from there to login here.'
            });
        }

        // Save device ID — use findOneAndUpdate to avoid full-document validation
        // on legacy astrologer records that might have empty required fields.
        if (deviceId) {
            await Astrologer.findByIdAndUpdate(astrologer._id, { $set: { activeDeviceId: deviceId } });
        }

        // Generate token
        const token = jwt.sign(
            { id: astrologer._id, role: 'astrologer' },
            process.env.JWT_SECRET || 'secret',
            { expiresIn: '30d' }
        );

        console.log(`[verifyAstrologerOtp] Login successful for ${mobile}`);

        res.json({
            success: true,
            token,
            astrologer: {
                id: astrologer._id,
                mobileNumber: astrologer.mobileNumber,
                email: astrologer.email,
                firstName: astrologer.firstName,
                lastName: astrologer.lastName,
                bio: astrologer.bio,
                experience: astrologer.experience,
                systemKnown: astrologer.systemKnown,
                language: astrologer.language,
                profilePhoto: astrologer.profilePhoto,
                isOnline: astrologer.isOnline || false,
                isBlocked: astrologer.isBlocked || false,
                isVerified: astrologer.isVerified || false, // Return verification status
                pricePerMin: astrologer.pricePerMin || 20,
                priceRangeMin: astrologer.priceRangeMin || 10,
                priceRangeMax: astrologer.priceRangeMax || 100,
                isDeletionRequested: astrologer.isDeletionRequested || false,
            }
        });
    } catch (error: any) {
        console.error(`[verifyAstrologerOtp] Server error:`, error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// Logout astrologer (clear active device ID)
export const logoutAstrologer = async (req: Request, res: Response) => {
    try {
        const astrologerId = (req as any).userId;
        const astrologer = await Astrologer.findById(astrologerId);
        if (astrologer && astrologer.isOnline) {
            await availabilityService.recordOffline(astrologerId);
        }
        await Astrologer.findByIdAndUpdate(astrologerId, {
            $unset: { activeDeviceId: 1 },
            $set: { isOnline: false }
        });
        return res.status(200).json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Server error', error });
    }
};

// Get Astrologer Profile
export const getProfile = async (req: Request, res: Response) => {
    try {
        const astrologerId = (req as any).userId;
        const astrologer = await Astrologer.findById(astrologerId);

        if (!astrologer) {
            return res.status(404).json({ success: false, message: 'Astrologer not found' });
        }

        res.json({
            success: true,
            data: {
                id: astrologer._id,
                email: astrologer.email,
                firstName: astrologer.firstName,
                lastName: astrologer.lastName,
                bio: astrologer.bio,
                aboutMe: astrologer.aboutMe || '',
                experience: astrologer.experience,
                systemKnown: astrologer.systemKnown,
                language: astrologer.language,
                specialties: astrologer.specialties || [],
                profilePhoto: astrologer.profilePhoto,
                isOnline: astrologer.isOnline || false,
                isBlocked: astrologer.isBlocked || false,
                pricePerMin: astrologer.pricePerMin || 20,
                priceRangeMin: astrologer.priceRangeMin || 10,
                priceRangeMax: astrologer.priceRangeMax || 100,
                city: astrologer.city,
                country: astrologer.country,
                rating: astrologer.rating || 0,
                reviewsCount: astrologer.reviewsCount || 0,
                followersCount: astrologer.followersCount || 0,
                totalChats: astrologer.totalChats || 0,
                bankDetails: astrologer.bankDetails || {
                    bankName: '',
                    accountNumber: '',
                    ifscCode: '',
                    accountHolderName: '',
                    branchName: ''
                },
                isFreeChatAvailable: astrologer.isFreeChatAvailable || false,
                freeChatLimit: astrologer.freeChatLimit || 0,
                isVerified: astrologer.isVerified || false,
                isDeletionRequested: astrologer.isDeletionRequested || false
            }
        });
    } catch (error: any) {
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// Update Astrologer Profile (creates a change request for admin approval)
export const updateProfile = async (req: Request, res: Response) => {
    try {
        const astrologerId = (req as any).userId;
        const {
            firstName, lastName, bio, aboutMe, experience,
            systemKnown, language, specialties, profilePhoto,
            bankDetails, isFreeChatAvailable, freeChatLimit
        } = req.body;

        const astrologer = await Astrologer.findById(astrologerId);
        if (!astrologer) {
            return res.status(404).json({ success: false, message: 'Astrologer not found' });
        }

        // Build the afterData (requested changes)
        const afterData: any = {};
        if (firstName !== undefined) afterData.firstName = firstName;
        if (lastName !== undefined) afterData.lastName = lastName;
        if (bio !== undefined) afterData.bio = bio;
        if (aboutMe !== undefined) afterData.aboutMe = aboutMe;
        if (experience !== undefined) afterData.experience = experience;
        if (systemKnown !== undefined) afterData.systemKnown = systemKnown;
        if (language !== undefined) afterData.language = language;
        if (specialties !== undefined) afterData.specialties = specialties;
        if (bankDetails !== undefined) afterData.bankDetails = bankDetails;
        if (isFreeChatAvailable !== undefined) afterData.isFreeChatAvailable = isFreeChatAvailable;
        if (freeChatLimit !== undefined) afterData.freeChatLimit = freeChatLimit;

        // Determine request type
        let requestType: 'profile_update' | 'photo_update' = 'profile_update';

        // Handle profile photo upload to R2 (upload now so URL is available for admin preview)
        if (profilePhoto !== undefined) {
            if (profilePhoto && (profilePhoto.startsWith('data:image') || profilePhoto.length > 500)) {
                try {
                    const r2Url = await uploadBase64ToR2(profilePhoto, 'profiles/astrologers/pending', astrologerId);
                    if (r2Url) {
                        afterData.profilePhoto = r2Url;
                        console.log('[AstrologerPanel] Pending profile photo uploaded to R2:', r2Url);
                    } else {
                        afterData.profilePhoto = profilePhoto;
                    }
                } catch (uploadError: any) {
                    console.error('[AstrologerPanel] Error uploading profile photo:', uploadError.message);
                    afterData.profilePhoto = profilePhoto;
                }
            } else {
                afterData.profilePhoto = profilePhoto;
            }
            // If only photo is being changed, mark as photo_update
            if (Object.keys(afterData).length === 1 && afterData.profilePhoto) {
                requestType = 'photo_update';
            }
        }

        // Build beforeData (current values for the fields being changed)
        const beforeData: any = {};
        for (const key of Object.keys(afterData)) {
            beforeData[key] = (astrologer as any)[key];
        }

        // Create the change request
        const changeRequest = new ProfileChangeRequest({
            astrologerId: astrologer._id,
            requestType,
            beforeData,
            afterData,
            status: 'pending'
        });
        await changeRequest.save();

        console.log(`[AstrologerPanel] Change request created: ${changeRequest._id} for astrologer ${astrologerId}`);

        res.json({ success: true, message: 'Changes submitted for admin approval' });
    } catch (error: any) {
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// Toggle Online/Offline Status
export const toggleStatus = async (req: Request, res: Response) => {
    try {
        const astrologerId = (req as any).userId;
        const { isOnline } = req.body;

        const astrologer = await Astrologer.findByIdAndUpdate(
            astrologerId,
            { 
               isOnline,
               isManualOverride: true
               // Note: intentionally NOT setting isAutoOnlineEnabled:false
               // so the scheduler can resume at the next boundary crossing
            },
            { new: true }
        );

        if (!astrologer) {
            return res.status(404).json({ success: false, message: 'Astrologer not found' });
        }

        // Send notification only to followers of this astrologer when they come online
        if (isOnline) {
            await availabilityService.recordOnline(astrologerId);
            notificationService.broadcastToFollowers(astrologer._id.toString(), {
                title: 'Astrologer Online!',
                body: `${astrologer.firstName} ${astrologer.lastName} is now available for consultation.`
            }, {
                astrologerId: astrologer._id.toString(),
                id: astrologer._id.toString()
            }).catch(err => console.error('[toggleStatus] Broadcast error:', err));
        } else {
            await availabilityService.recordOffline(astrologerId);
        }

        res.json({ success: true, message: `Status updated to ${isOnline ? 'online' : 'offline'}` });
    } catch (error: any) {
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// Get Dashboard Stats
export const getStats = async (req: Request, res: Response) => {
    try {
        const astrologerId = (req as any).userId;
        const astrologer = await Astrologer.findById(astrologerId);

        if (!astrologer) {
            return res.status(404).json({ success: false, message: 'Astrologer not found' });
        }


        // Calculate real earnings from ended chat sessions
        const sessionsStats = await ChatSession.aggregate([
            { $match: { astrologerId: astrologer._id, status: 'ENDED' } },
            {
                $group: {
                    _id: null,
                    lifetimeEarnings: { 
                        $sum: { 
                            $subtract: [
                                { $ifNull: ['$astrologerNetEarnings', '$astrologerEarnings'] }, 
                                { $ifNull: ['$penaltyAmount', 0] }
                            ] 
                        } 
                    },
                    totalChats: { $sum: { $cond: [{ $gt: ['$astrologerEarnings', 0] }, 1, 0] } },
                    totalDuration: { $sum: '$totalMinutes' }
                }
            }
        ]);

        const stats = sessionsStats[0] || { lifetimeEarnings: 0, totalChats: 0, totalDuration: 0 };

        // Calculate Average Chat Time (in minutes)
        const avgChatTime = stats.totalChats > 0
            ? Math.round(stats.totalDuration / stats.totalChats)
            : 0;

        // Calculate Today's Stats (IST Timezone: UTC + 5:30)
        const nowUTC = new Date();
        const istOffset = 5.5 * 60 * 60 * 1000;
        const istNow = new Date(nowUTC.getTime() + istOffset);

        const startOfTodayIST = new Date(istNow);
        startOfTodayIST.setUTCHours(0, 0, 0, 0);
        const startOfTodayUTC = new Date(startOfTodayIST.getTime() - istOffset);

        const endOfTodayIST = new Date(istNow);
        endOfTodayIST.setUTCHours(23, 59, 59, 999);
        const endOfTodayUTC = new Date(endOfTodayIST.getTime() - istOffset);

        const todayStats = await ChatSession.aggregate([
            {
                $match: {
                    astrologerId: astrologer._id,
                    status: 'ENDED',
                    updatedAt: { $gte: startOfTodayUTC, $lte: endOfTodayUTC },
                    astrologerEarnings: { $gt: 0 }
                }
            },
            {
                $group: {
                    _id: null,
                    todayEarnings: { $sum: { $ifNull: ['$astrologerNetEarnings', '$astrologerEarnings'] } },
                    todayChats: { $sum: 1 }
                }
            }
        ]);

        const todayData = todayStats[0] || { todayEarnings: 0, todayChats: 0 };

        // Get Rating Distribution (Approved Only)
        const ratingDistribution = await ChatReview.aggregate([
            { $match: { astrologerId: astrologer._id, status: 'approved' } },
            { $group: { _id: '$rating', count: { $sum: 1 } } },
            { $sort: { _id: -1 } }
        ]);

        const ratingCounts: { [key: number]: number } = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
        ratingDistribution.forEach((r: any) => {
            if (r._id >= 1 && r._id <= 5) {
                ratingCounts[r._id] = r.count;
            }
        });

        res.json({
            success: true,
            data: {
                totalChats: stats.totalChats || 0,
                lifetimeEarnings: stats.lifetimeEarnings || 0,
                withdrawableBalance: (astrologer.earnings || 0) + (astrologer.giftEarnings || 0),
                earningsBreakdown: {
                    chatEarnings: astrologer.earnings || 0,
                    giftEarnings: astrologer.giftEarnings || 0
                },
                pendingAmount: astrologer.pendingWithdrawal || 0,
                todayChats: todayData.todayChats,
                todayEarnings: todayData.todayEarnings,
                averageChatTime: avgChatTime,
                followersCount: astrologer.followersCount || 0,
                rating: astrologer.rating || 0,
                reviewsCount: astrologer.reviewsCount || 0,
                ratingDistribution: ratingCounts,
                // TDS Information (applied only to chat earnings, not gift earnings)
                yearlyGrossEarnings: astrologer.yearlyGrossEarnings || 0,
                yearlyGiftEarnings: astrologer.yearlyGiftEarnings || 0,
                yearlyTdsDeducted: astrologer.yearlyTdsDeducted || 0,
                tdsApplicable: (astrologer.yearlyGrossEarnings || 0) > 50000,
                yearlyEarningsBreakdown: {
                    chatEarnings: astrologer.yearlyGrossEarnings || 0,
                    giftEarnings: astrologer.yearlyGiftEarnings || 0,
                    totalBeforeTDS: (astrologer.yearlyGrossEarnings || 0) + (astrologer.yearlyGiftEarnings || 0)
                }
            }
        });


    } catch (error: any) {
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// Get Today's Online Hours (for astrologer panel)
export const getTodayHours = async (req: Request, res: Response) => {
    try {
        const astrologerId = (req as any).userId;
        const totalHours = await availabilityService.getTodayTotalHours(astrologerId);
        res.json({ success: true, totalHours });
    } catch (error: any) {
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// Get Availability Logs (for admin panel)
export const getAvailabilityLogs = async (req: Request, res: Response) => {
    try {
        const { astrologerId } = req.params;
        const { startDate, endDate } = req.query;

        console.log(`[getAvailabilityLogs] Fetching logs for ${astrologerId}, range: ${startDate} to ${endDate}`);

        const query: any = { astrologerId };
        
        if (startDate || endDate) {
            query.startTime = {};
            if (startDate) query.startTime.$gte = new Date(startDate as string);
            if (endDate) query.startTime.$lte = new Date(endDate as string);
        }

        const logs = await AstrologerAvailabilityLog.find(query)
            .sort({ startTime: -1 })
            .limit(100);

        res.json({ success: true, logs });
    } catch (error: any) {
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// Get Astrologer's Chats (grouped by USER, not session)
export const getChats = async (req: Request, res: Response) => {
    try {
        const astrologerId = (req as any).userId;

        // Find all sessions involving this astrologer (ACTIVE or ENDED)
        const sessions = await ChatSession.find({
            astrologerId,
            status: { $in: ['ACTIVE', 'ENDED'] }
        })
            .populate('userId', 'name mobile')
            .sort({ updatedAt: -1 });

        // Group sessions by userId
        const userSessionsMap = new Map<string, any[]>();
        for (const session of sessions) {
            const userIdStr = (session.userId as any)._id.toString();
            if (!userSessionsMap.has(userIdStr)) {
                userSessionsMap.set(userIdStr, []);
            }
            userSessionsMap.get(userIdStr)!.push(session);
        }

        // Build chat list with one entry per user
        const chatList = await Promise.all(Array.from(userSessionsMap.entries()).map(async ([userIdStr, userSessions]) => {
            // Get all session IDs for this user
            const sessionIds = userSessions.map(s => s.sessionId);

            // Get last message across all sessions
            const lastMsg = await ChatMessage.findOne({ sessionId: { $in: sessionIds } })
                .sort({ timestamp: -1 });

            // Get user info from first session
            const firstSession = userSessions[0];
            const userData = firstSession.userId as any;

            // Format time
            let timeString = '';
            if (lastMsg) {
                const date = lastMsg.timestamp;
                const now = new Date();
                const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

                if (diffDays === 0) {
                    timeString = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
                } else if (diffDays === 1) {
                    timeString = 'Yesterday';
                } else {
                    timeString = date.toLocaleDateString('en-IN');
                }
            }

            // Check if any session is active
            const hasActiveSession = userSessions.some(s => s.status === 'ACTIVE');

            return {
                id: userIdStr, // Use userId as the unique ID
                sessionId: hasActiveSession ? userSessions.find(s => s.status === 'ACTIVE')?.sessionId : firstSession.sessionId,
                userId: {
                    _id: userIdStr,
                    name: userData.name || 'User',
                    mobile: userData.mobile || ''
                },
                lastMessage: lastMsg ? lastMsg.text : (hasActiveSession ? 'Chat in progress...' : 'No messages'),
                lastMessageTime: timeString,
                unreadCount: 0,
                lastMessageTimestamp: lastMsg ? lastMsg.timestamp : null,
                isActive: hasActiveSession
            };
        }));

        // Sort by last message time (most recent first)
        chatList.sort((a, b) => {
            if (a.isActive && !b.isActive) return -1;
            if (!a.isActive && b.isActive) return 1;
            return 0;
        });

        res.json({
            success: true,
            data: chatList
        });
    } catch (error: any) {
        console.error('getChats error:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// Update Chat Rate (creates a change request for admin approval)
export const updateChatRate = async (req: Request, res: Response) => {
    try {
        const astrologerId = (req as any).userId;
        const { pricePerMin } = req.body;

        console.log('updateChatRate called:', { astrologerId, pricePerMin, type: typeof pricePerMin });

        if (typeof pricePerMin !== 'number' || pricePerMin < 1) {
            console.log('Invalid pricePerMin:', pricePerMin);
            return res.status(400).json({ success: false, message: 'Invalid price per minute' });
        }

        const astrologer = await Astrologer.findById(astrologerId);
        if (!astrologer) {
            console.log('Astrologer not found:', astrologerId);
            return res.status(404).json({ success: false, message: 'Astrologer not found' });
        }

        // Validate rate is within admin-defined range
        const minRate = astrologer.priceRangeMin || 10;
        const maxRate = astrologer.priceRangeMax || 100;

        console.log('Rate range check:', { pricePerMin, minRate, maxRate });

        if (pricePerMin < minRate || pricePerMin > maxRate) {
            return res.status(400).json({
                success: false,
                message: `Rate must be between ₹${minRate} and ₹${maxRate} per minute`
            });
        }

        // Create change request instead of direct update
        const changeRequest = new ProfileChangeRequest({
            astrologerId: astrologer._id,
            requestType: 'rate_update',
            beforeData: { pricePerMin: astrologer.pricePerMin },
            afterData: { pricePerMin },
            status: 'pending'
        });
        await changeRequest.save();

        console.log(`[AstrologerPanel] Rate change request created: ${changeRequest._id}`);

        res.json({
            success: true,
            message: 'Rate change submitted for admin approval',
            data: { pricePerMin: pricePerMin }
        });
    } catch (error: any) {
        console.error('updateChatRate error:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// Request Withdrawal
export const requestWithdrawal = async (req: Request, res: Response) => {
    try {
        const astrologerId = (req as any).userId;
        const astrologer = await Astrologer.findById(astrologerId);

        if (!astrologer) {
            return res.status(404).json({ success: false, message: 'Astrologer not found' });
        }

        // Calculate total withdrawable amount from both chat earnings and gift earnings
        const chatEarnings = astrologer.earnings || 0;
        const giftEarnings = astrologer.giftEarnings || 0;
        const withdrawableAmount = chatEarnings + giftEarnings;

        // Get minimum balance to maintain from settings
        const minBalance = await getSettingValue('minWithdrawalBalance', 200);

        if (withdrawableAmount <= minBalance) {
            return res.status(400).json({
                success: false,
                message: `Minimum balance of ₹${minBalance} must be maintained in your wallet. Your current balance is ₹${withdrawableAmount}.`,
                details: {
                    chatEarnings,
                    giftEarnings,
                    total: withdrawableAmount
                }
            });
        }

        // Check if verified
        if (!astrologer.isVerified) {
            return res.status(403).json({
                success: false,
                message: 'Account Verification Required. Please email your KYC documents to support to enable withdrawals.',
                errorCode: 'NOT_VERIFIED'
            });
        }

        const actualWithdrawAmount = withdrawableAmount - minBalance;

        if (actualWithdrawAmount < 1000) {
            return res.status(400).json({
                success: false,
                message: `Minimum withdrawal amount is ₹1000. Your withdrawable amount is only ₹${actualWithdrawAmount}.`,
                details: {
                    chatEarnings,
                    giftEarnings,
                    total: withdrawableAmount
                }
            });
        }

        // Create withdrawal request
        const withdrawal = new Withdrawal({
            astrologerId: astrologer._id,
            amount: actualWithdrawAmount,
            status: 'PENDING',
            requestedAt: new Date()
        });
        await withdrawal.save();

        // Calculate proportional deduction from chat earnings and gift earnings
        // Deduct from chat earnings first, then from gift earnings
        let chatDeduction = Math.min(chatEarnings, actualWithdrawAmount);
        let giftDeduction = actualWithdrawAmount - chatDeduction;

        // Update astrologer balances
        await Astrologer.findByIdAndUpdate(astrologer._id, {
            $set: {
                earnings: chatEarnings - chatDeduction >= 0 ? chatEarnings - chatDeduction : 0,
                giftEarnings: giftEarnings - giftDeduction >= 0 ? giftEarnings - giftDeduction : 0,
                pendingWithdrawal: (astrologer.pendingWithdrawal || 0) + actualWithdrawAmount
            }
        });

        console.log(`[Withdrawal] Request created: ${withdrawal._id}, amount: ${actualWithdrawAmount}, chat-deduction: ${chatDeduction}, gift-deduction: ${giftDeduction}, maintained: ${minBalance}`);

        res.json({
            success: true,
            message: 'Withdrawal request submitted successfully',
            data: {
                withdrawalId: withdrawal._id,
                amount: actualWithdrawAmount,
                status: 'PENDING',
                breakdown: {
                    chatEarningsDeducted: chatDeduction,
                    giftEarningsDeducted: giftDeduction
                },
                newBalance: {
                    chatEarnings: chatEarnings - chatDeduction,
                    giftEarnings: giftEarnings - giftDeduction,
                    total: (chatEarnings - chatDeduction) + (giftEarnings - giftDeduction)
                },
                maintainedBalance: minBalance,
                newPendingAmount: (astrologer.pendingWithdrawal || 0) + actualWithdrawAmount
            }
        });
    } catch (error: any) {
        console.error('requestWithdrawal error:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// Get Withdrawal History
export const getWithdrawalHistory = async (req: Request, res: Response) => {
    try {
        const astrologerId = (req as any).userId;

        const withdrawals = await Withdrawal.find({ astrologerId })
            .sort({ requestedAt: -1 })
            .limit(50);

        const formattedWithdrawals = withdrawals.map(w => ({
            id: w._id,
            amount: w.amount,
            status: w.status,
            requestedAt: w.requestedAt,
            processedAt: w.processedAt,
            notes: w.notes
        }));

        res.json({
            success: true,
            data: formattedWithdrawals
        });
    } catch (error: any) {
        console.error('getWithdrawalHistory error:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// Request Account Deletion (Astrologer)
export const requestAccountDeletion = async (req: Request, res: Response) => {
    try {
        const astrologerId = (req as any).userId;
        const { reason } = req.body;

        // Check if there is already a pending request
        const existingRequest = await DeletionRequest.findOne({
            astrologerId,
            status: 'pending'
        });

        if (existingRequest) {
            return res.status(400).json({
                success: false,
                message: 'You already have a pending deletion request.'
            });
        }

        const deletionRequest = new DeletionRequest({
            astrologerId,
            userType: 'astrologer',
            reason: reason || 'No reason provided',
            status: 'pending'
        });

        await deletionRequest.save();

        // Mark astrologer as deletion requested and set to offline.
        // Use findOneAndUpdate to avoid full-doc validation on legacy records.
        await Astrologer.findByIdAndUpdate(astrologerId, {
            $set: {
                isDeletionRequested: true,
                deletionRequestedAt: new Date(),
                isOnline: false
            }
        });

        console.log(`[AstrologerPanel] Deletion request created and astrologer ${astrologerId} set to offline`);

        res.json({
            success: true,
            message: 'Account deletion request submitted. Your account is now under review and you have been set to offline.'
        });
    } catch (error: any) {
        console.error('requestAccountDeletion error:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// Get Session History (individual sessions for history page)
export const getSessionHistory = async (req: Request, res: Response) => {
    try {
        const astrologerId = (req as any).userId;

        // Find all ENDED sessions for this astrologer where chat actually started
        // (both parties joined)
        const sessions = await ChatSession.find({
            astrologerId,
            status: 'ENDED',
            userJoined: true,
            astrologerJoined: true
            // Removed filter: astrologerEarnings: { $gt: 0 }
        })
            .populate('userId', 'name mobile profilePhoto')
            .sort({ endTime: -1 })
            .limit(100);

        // Format sessions for the frontend
        const sessionHistory = sessions.map((session: any) => {
            const user = session.userId;
            const endTime = session.endTime || session.updatedAt;

            // Format date and time
            const dateObj = new Date(endTime);
            const dateStr = dateObj.toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
            });
            const timeStr = dateObj.toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });

            return {
                id: session._id,
                sessionId: session.sessionId,
                user: {
                    id: user?._id,
                    name: user?.name || 'User',
                    mobile: user?.mobile || '',
                    profilePhoto: user?.profilePhoto || null
                },
                duration: session.totalMinutes || 0,
                earnings: session.astrologerEarnings || 0,
                isFreeTrialSession: session.isFreeTrialSession || false,
                timestamp: endTime,
                date: dateStr,
                time: timeStr,
                dateTime: endTime,
                status: session.status,
                endReason: session.endReason
            };
        });

        res.json({
            success: true,
            data: sessionHistory
        });
    } catch (error: any) {
        console.error('getSessionHistory error:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};
// Get Astrologer Reviews for the Panel
export const getPanelReviews = async (req: Request, res: Response) => {
    try {
        const astrologerId = (req as any).userId;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const skip = (page - 1) * limit;

        const reviews = await ChatReview.find({ astrologerId, status: 'approved' })
            .populate('userId', 'name')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const totalReviews = await ChatReview.countDocuments({ astrologerId, status: 'approved' });

        res.json({
            success: true,
            data: {
                reviews: reviews.map((r: any) => ({
                    id: r._id,
                    user: r.userId?.name || 'User',
                    rating: r.rating,
                    comment: r.reviewText || '',
                    time: r.createdAt
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
        console.error('getPanelReviews error:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// Get User Profile for Astrologer (during chat)
export const getUserProfileForAstrologer = async (req: Request, res: Response) => {
    try {
        const { userId, profileId } = req.params;

        console.log(`[getUserProfileForAstrologer] Fetching for userId: ${userId}, profileId: ${profileId}`);

        const user = await ((User as any).default || User).findById(userId); // Handle potentially different import style if needed, but standard should work
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        let targetProfile: any = null;

        // 1. Try to find specific profile if ID or index provided
        if (profileId && profileId !== 'default' && profileId !== 'primary') {
            const pid = profileId.toString().trim();

            // Check if pid is a numeric index (0, 1, 2...)
            if (/^\d+$/.test(pid)) {
                const index = parseInt(pid);
                if (index >= 0 && index < user.birthProfiles.length) {
                    console.log(`[getUserProfileForAstrologer] Found profile by index: ${index}`);
                    targetProfile = user.birthProfiles[index];
                }
            }

            // Check if pid is a valid MongoId
            if (!targetProfile && mongoose.Types.ObjectId.isValid(pid)) {
                targetProfile = user.birthProfiles.find((p: any) => p._id?.toString() === pid);
                if (targetProfile) console.log(`[getUserProfileForAstrologer] Found profile by ID: ${pid}`);
            }

            // Fallback: search by name matching
            if (!targetProfile) {
                // If profileId was actually a name or we want to try matching
                targetProfile = user.birthProfiles.find((p: any) =>
                    p.name.toLowerCase().trim() === pid.toLowerCase().trim()
                );
                if (targetProfile) console.log(`[getUserProfileForAstrologer] Found profile by Name match with ID param: ${pid}`);
            }
        }

        // 2. Fallback to default/main user profile
        if (!targetProfile) {
            console.log(`[getUserProfileForAstrologer] Defaulting to main user profile`);
            // Map user fields to profile structure
            targetProfile = {
                name: user.name,
                gender: user.gender,
                dob: user.dob, // keep original string format
                tob: user.tob,
                pob: user.pob,
                lat: user.lat,
                lon: user.lon,
                tzone: user.tzone,
                day: user.day,
                month: user.month,
                year: user.year,
                hour: user.hour,
                min: user.min
            };
        }

        res.json({
            success: true,
            data: targetProfile
        });

    } catch (error: any) {
        console.error('getUserProfileForAstrologer error:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};
