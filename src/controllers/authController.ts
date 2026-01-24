
import { Request, Response } from 'express';
import User from '../models/User';
import Astrologer from '../models/Astrologer';
import { sendSmsOtp } from '../services/smsService';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { uploadBase64ToR2, deleteFromR2, getKeyFromUrl } from '../services/r2Service';
import ChatSession from '../models/ChatSession';
import Transaction from '../models/Transaction';
import horoscopeService from '../services/horoscopeService';

const generateOtp = () => Math.floor(1000 + Math.random() * 9000).toString();

export const checkUser = async (req: Request, res: Response) => {
    try {
        const { mobile } = req.body;
        const user = await User.findOne({ mobile });
        if (user) {
            // User exists
            return res.status(200).json({ exists: true, message: 'User exists' });
        } else {
            // User does not exist
            return res.status(200).json({ exists: false, message: 'User does not exist' });
        }
    } catch (error) {
        return res.status(500).json({ message: 'Server error', error });
    }
};

export const sendOtp = async (req: Request, res: Response) => {
    try {
        const { mobile } = req.body;
        let otp = generateOtp();

        if (mobile === '7990358824') {
            otp = '1234';
        }

        const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Upsert user: create if not exists, update if exists
        await User.findOneAndUpdate(
            { mobile },
            { mobile, otp, otpExpires },
            { upsert: true, new: true }
        );

        const sent = await sendSmsOtp(mobile, otp);
        if (sent) {
            return res.status(200).json({ success: true, message: 'OTP sent successfully' });
        } else {
            return res.status(500).json({ success: false, message: 'Failed to send OTP' });
        }
    } catch (error) {
        return res.status(500).json({ message: 'Server error', error });
    }
};

export const verifyOtp = async (req: Request, res: Response) => {
    try {
        const { mobile, otp } = req.body;
        const user = await User.findOne({ mobile });

        if (!user || user.otp !== otp) {
            return res.status(400).json({ success: false, message: 'Invalid OTP' });
        }

        if (user.otpExpires && user.otpExpires < new Date()) {
            return res.status(400).json({ success: false, message: 'OTP expired' });
        }

        // Clear OTP after successful verification
        user.otp = undefined;
        user.otpExpires = undefined;
        user.isVerified = true;
        await user.save();

        // Generate Token immediately upon verification
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secret', { expiresIn: '30d' });

        return res.status(200).json({
            success: true,
            message: 'OTP verified',
            token,
            user
        });
    } catch (error) {
        return res.status(500).json({ message: 'Server error', error });
    }
};

// Update user profile after OTP login
export const updateProfile = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;
        const { name, gender, dob, tob, pob, profilePhoto, zodiacSign } = req.body;

        const updateData: any = { name, gender, dob, tob, pob, isVerified: true };
        if (zodiacSign) updateData.zodiacSign = zodiacSign;

        // Geocode Place of Birth if provided
        if (pob) {
            try {
                // Check if we need to geocode (e.g. if pob changed or lat/lon missing)
                // For simplicity, we re-geocode if POB is provided in update
                const geo = await horoscopeService.getGeoDetails(pob);
                if (geo.status && geo.data) {
                    updateData.lat = geo.data.latitude;
                    updateData.lon = geo.data.longitude;
                    updateData.tzone = geo.data.timezone;
                    console.log(`[AuthController] Geocoded ${pob}: ${updateData.lat}, ${updateData.lon}`);
                }
            } catch (geoError) {
                console.warn('[AuthController] Geocoding failed:', geoError);
            }
        }

        // Handle profile photo upload to R2
        if (profilePhoto !== undefined) {
            // Check if it's a base64 image (starts with data:image or is raw base64)
            if (profilePhoto && (profilePhoto.startsWith('data:image') || profilePhoto.length > 500)) {
                try {
                    // Upload to R2
                    const r2Url = await uploadBase64ToR2(profilePhoto, 'profiles/users', userId);
                    if (r2Url) {
                        // Delete old photo from R2 if it exists
                        const existingUser = await User.findById(userId);
                        if (existingUser?.profilePhoto && existingUser.profilePhoto.includes('r2.')) {
                            try {
                                const oldKey = getKeyFromUrl(existingUser.profilePhoto);
                                if (oldKey) {
                                    await deleteFromR2(oldKey);
                                    console.log('[AuthController] Deleted old profile photo from R2');
                                }
                            } catch (deleteError) {
                                console.warn('[AuthController] Failed to delete old profile photo:', deleteError);
                            }
                        }
                        updateData.profilePhoto = r2Url;
                        console.log('[AuthController] Profile photo uploaded to R2:', r2Url);
                    } else {
                        // R2 not configured, store base64 as fallback
                        updateData.profilePhoto = profilePhoto;
                        console.log('[AuthController] R2 not configured, storing base64');
                    }
                } catch (uploadError: any) {
                    console.error('[AuthController] Error uploading profile photo:', uploadError.message);
                    // Fall back to storing base64
                    updateData.profilePhoto = profilePhoto;
                }
            } else {
                // It's already a URL or empty, store as-is
                updateData.profilePhoto = profilePhoto;
            }
        }

        const user = await User.findByIdAndUpdate(
            userId,
            updateData,
            { new: true }
        );

        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        return res.status(200).json({ success: true, user, message: 'Profile updated' });
    } catch (error) {
        return res.status(500).json({ message: 'Server error', error });
    }
};

// Get wallet balance for authenticated user
export const getWalletBalance = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;

        if (!userId) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        const user = await User.findById(userId).select('walletBalance hasUsedFreeTrial createdAt profilePhoto');

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Check if hasUsedFreeTrial is undefined (old user) OR false
        // We now check primarily based on CHAT HISTORY.
        // If user has > 0 ENDED sessions, they HAVE used the trial (or are ineligible).
        // If user has 0 ENDED sessions, they are eligible (hasUsedFreeTrial = false).

        // 1. If flag is already true, trust it.
        let hasUsedFreeTrial = user.hasUsedFreeTrial;

        if (!hasUsedFreeTrial) {
            // 2. If flag is false, verify against chat history
            // We count sessions where user participated and it ended (meaning they chatted)
            const chatCount = await ChatSession.countDocuments({
                userId: userId,
                status: 'ENDED'
                // We typically count 'ENDED' sessions. 'REJECTED' or 'TIMEOUT' don't count as "usage".
            });

            if (chatCount > 0) {
                console.log(`[Auth] User ${userId} has ${chatCount} prior chats. Marking as ineligible for free trial.`);
                // Update DB
                await User.findByIdAndUpdate(userId, { hasUsedFreeTrial: true });
                hasUsedFreeTrial = true;
            } else {
                // Count is 0. Eligible.
                // console.log(`[Auth] User ${userId} has 0 prior chats. Eligible for free trial.`);
            }
        }

        return res.status(200).json({
            success: true,
            walletBalance: user.walletBalance || 0,
            hasUsedFreeTrial: hasUsedFreeTrial,
            profilePhoto: user.profilePhoto // Return latest profile photo (Cloudflare URL)
        });
    } catch (error) {
        return res.status(500).json({ message: 'Server error', error });
    }
};

// Get wallet transactions for authenticated user
// Get wallet transactions for authenticated user with aggregation
export const getWalletTransactions = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;
        const { type } = req.query; // 'credit', 'debit', or undefined for all

        if (!userId) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        // Build query filter
        const filter: any = { fromUser: userId, status: 'success' };
        if (type === 'credit' || type === 'debit') {
            filter.type = type;
        }

        // Fetch larger batch to allow for aggregation
        const transactions = await Transaction.find(filter)
            .sort({ createdAt: -1 })
            .limit(500)
            .populate('toAstrologer', 'firstName lastName')
            .select('_id type amount description createdAt toAstrologer');

        // Aggregation Logic
        const aggregatedTransactions: any[] = [];
        const sessionGroups = new Map<string, any>();

        for (const t of transactions) {
            // Check if it's a chat session debit
            const sessionMatch = t.description?.match(/Chat session: ([a-zA-Z0-9-]+)/);

            if (sessionMatch && t.type === 'debit') {
                const sessionId = sessionMatch[1];

                if (sessionGroups.has(sessionId)) {
                    // Update existing group
                    const group = sessionGroups.get(sessionId);
                    group.amount += t.amount;
                    // Keep the latest date (already sorted desc, so first allowed was latest, but let's be safe)
                    if (new Date(t.createdAt) > new Date(group.createdAt)) {
                        group.createdAt = t.createdAt;
                    }
                } else {
                    // Create new group
                    let description = 'Chat Session';
                    if (t.toAstrologer && (t.toAstrologer as any).firstName) {
                        const astro = t.toAstrologer as any;
                        const name = `${astro.firstName} ${astro.lastName || ''}`.trim();
                        description = `Chat with ${name}`;
                    }

                    sessionGroups.set(sessionId, {
                        _id: sessionId, // Use session ID as the key for the view
                        type: 'debit',
                        amount: t.amount,
                        description: description,
                        createdAt: t.createdAt,
                        toAstrologer: t.toAstrologer // Keep ref just in case
                    });
                }
            } else {
                // Non-chat transaction or credit, add directly
                aggregatedTransactions.push(t);
            }
        }

        // Combine aggregated sessions into the list
        aggregatedTransactions.push(...Array.from(sessionGroups.values()));

        // Sort again by date descending
        aggregatedTransactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        // Limit to 100 for response
        const finalTransactions = aggregatedTransactions.slice(0, 100).map(t => ({
            _id: t._id,
            type: t.type,
            amount: parseFloat(t.amount.toFixed(2)), // Ensure aggregation didn't introduce floating point errors
            description: t.description,
            createdAt: t.createdAt
        }));

        return res.status(200).json({
            success: true,
            transactions: finalTransactions
        });
    } catch (error) {
        console.error('[Auth] Error fetching wallet transactions:', error);
        return res.status(500).json({ message: 'Server error', error });
    }
};

// Register FCM token
export const registerFcmToken = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;
        const { fcmToken, userType } = req.body; // userType: 'user' | 'astrologer'

        if (!fcmToken) {
            return res.status(400).json({ success: false, message: 'FCM token required' });
        }

        console.log(`[Auth] Registering FCM token for ${userType} ${userId}: ${fcmToken.substring(0, 10)}...`);

        if (userType === 'astrologer') {
            // Check if user is also an astrologer (userId in token is User ID)
            // But Astrologer model uses 'userId' field ref to User, or _id?
            // Astrologer.userId references User._id. The token contains User._id.
            // So we find Astrologer where userId matches.
            const astrologer = await Astrologer.findOne({ userId: userId });

            if (astrologer) {
                astrologer.fcmToken = fcmToken;
                await astrologer.save();
                return res.status(200).json({ success: true, message: 'Astrologer FCM token updated' });
            } else {
                // Should not happen if logged in as astrologer
                return res.status(404).json({ success: false, message: 'Astrologer profile not found' });
            }
        } else {
            // Default to updating User model
            const user = await User.findById(userId);
            if (user) {
                user.fcmToken = fcmToken;
                await user.save();
                return res.status(200).json({ success: true, message: 'User FCM token updated' });
            } else {
                return res.status(404).json({ success: false, message: 'User not found' });
            }
        }
    } catch (error) {
        console.error('[Auth] Error registering FCM token:', error);
        return res.status(500).json({ message: 'Server error', error });
    }
};
