import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import Astrologer from '../models/Astrologer';
import Otp from '../models/Otp';
import ChatSession from '../models/ChatSession';
import ChatMessage from '../models/ChatMessage';
import { uploadBase64ToR2, deleteFromR2, getKeyFromUrl } from '../services/r2Service';

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
        const { mobile } = req.body;

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

        // Generate OTP (dev mode: use 1234 for testing)
        const otpCode = mobile === '9999999999' ? '1234' : Math.floor(1000 + Math.random() * 9000).toString();

        // Save OTP
        await Otp.findOneAndUpdate(
            { mobile },
            { mobile, otp: otpCode, createdAt: new Date() },
            { upsert: true, new: true }
        );

        // In production, send OTP via SMS here
        console.log(`OTP for ${mobile}: ${otpCode}`);

        res.json({ success: true, message: 'OTP sent successfully' });
    } catch (error: any) {
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// Verify OTP and login astrologer
export const verifyAstrologerOtp = async (req: Request, res: Response) => {
    try {
        const { mobile, otp } = req.body;

        console.log(`[verifyAstrologerOtp] Attempting verification for mobile: ${mobile}, otp: ${otp}`);

        if (!mobile || !otp) {
            return res.status(400).json({ success: false, message: 'Mobile and OTP required' });
        }

        // Dev bypass for testing - specific test number with '1234' or allow '1234' for any dev testing
        const isDevBypass = otp === '1234';

        let isValidOtp = false;
        if (isDevBypass) {
            console.log(`[verifyAstrologerOtp] Dev bypass activated`);
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

        // Generate token
        const token = jwt.sign(
            { id: astrologer._id, role: 'astrologer' },
            process.env.JWT_SECRET || 'your-secret-key',
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
                pricePerMin: astrologer.pricePerMin || 20,
                priceRangeMin: astrologer.priceRangeMin || 10,
                priceRangeMax: astrologer.priceRangeMax || 100,
            }
        });
    } catch (error: any) {
        console.error(`[verifyAstrologerOtp] Server error:`, error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
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
            }
        });
    } catch (error: any) {
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// Update Astrologer Profile
export const updateProfile = async (req: Request, res: Response) => {
    try {
        const astrologerId = (req as any).userId;
        const { firstName, lastName, bio, aboutMe, experience, systemKnown, language, specialties, profilePhoto } = req.body;

        const updateData: any = { firstName, lastName, bio, experience, systemKnown, language };
        if (aboutMe !== undefined) {
            updateData.aboutMe = aboutMe;
        }
        if (specialties !== undefined) {
            updateData.specialties = specialties;
        }

        // Handle profile photo upload to R2
        if (profilePhoto !== undefined) {
            // Check if it's a base64 image (starts with data:image or is raw base64)
            if (profilePhoto && (profilePhoto.startsWith('data:image') || profilePhoto.length > 500)) {
                try {
                    // Upload to R2
                    const r2Url = await uploadBase64ToR2(profilePhoto, 'profiles/astrologers', astrologerId);
                    if (r2Url) {
                        // Delete old photo from R2 if it exists
                        const astrologer = await Astrologer.findById(astrologerId);
                        if (astrologer?.profilePhoto && astrologer.profilePhoto.includes('r2.')) {
                            try {
                                const oldKey = getKeyFromUrl(astrologer.profilePhoto);
                                if (oldKey) {
                                    await deleteFromR2(oldKey);
                                    console.log('[AstrologerPanel] Deleted old profile photo from R2');
                                }
                            } catch (deleteError) {
                                console.warn('[AstrologerPanel] Failed to delete old profile photo:', deleteError);
                            }
                        }
                        updateData.profilePhoto = r2Url;
                        console.log('[AstrologerPanel] Profile photo uploaded to R2:', r2Url);
                    } else {
                        // R2 not configured, store base64 as fallback
                        updateData.profilePhoto = profilePhoto;
                        console.log('[AstrologerPanel] R2 not configured, storing base64');
                    }
                } catch (uploadError: any) {
                    console.error('[AstrologerPanel] Error uploading profile photo:', uploadError.message);
                    // Fall back to storing base64
                    updateData.profilePhoto = profilePhoto;
                }
            } else {
                // It's already a URL or empty, store as-is
                updateData.profilePhoto = profilePhoto;
            }
        }

        const astrologer = await Astrologer.findByIdAndUpdate(
            astrologerId,
            updateData,
            { new: true }
        );

        if (!astrologer) {
            return res.status(404).json({ success: false, message: 'Astrologer not found' });
        }

        res.json({ success: true, message: 'Profile updated', data: astrologer });
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
            { isOnline },
            { new: true }
        );

        if (!astrologer) {
            return res.status(404).json({ success: false, message: 'Astrologer not found' });
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

        // Mock stats for now - replace with actual data from chat/earnings collections
        res.json({
            success: true,
            data: {
                totalChats: astrologer.totalChats || 0,
                totalEarnings: astrologer.earnings || 0,
                pendingEarnings: 0,
                todayChats: 0,
            }
        });
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
                    timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                } else if (diffDays === 1) {
                    timeString = 'Yesterday';
                } else {
                    timeString = date.toLocaleDateString();
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

// Update Chat Rate (within admin-defined range)
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

        // Use updateOne to avoid validation issues with old data format
        await Astrologer.updateOne(
            { _id: astrologerId },
            { $set: { pricePerMin: pricePerMin } }
        );

        console.log('Rate updated successfully:', pricePerMin);

        res.json({
            success: true,
            message: 'Chat rate updated successfully',
            data: { pricePerMin: pricePerMin }
        });
    } catch (error: any) {
        console.error('updateChatRate error:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

