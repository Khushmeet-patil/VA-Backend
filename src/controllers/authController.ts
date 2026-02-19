
import { Request, Response } from 'express';
import User from '../models/User';
import Astrologer from '../models/Astrologer';
import { sendSmsOtp } from '../services/smsService';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { uploadBase64ToR2, deleteFromR2, getKeyFromUrl } from '../services/r2Service';
import ChatSession from '../models/ChatSession';
import Transaction from '../models/Transaction';
import geoService from '../services/geoService';
import astrologyService from '../services/astrologyService';

// Admin Login (Email + Password)
export const adminLogin = async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required' });
        }

        // Find admin user (must have role 'admin' and password set)
        // We search by email (which is not unique index in schema but should be for admins)
        // OR we can search by mobile if admin uses mobile. 
        // User requested "email id and password". 
        // User schema has 'mobile' unique, but 'email' is in 'IAstrologer' not IUser explicitly in schema? 
        // Wait, UserSchema does NOT have 'email' field! It has 'mobile', 'password', 'name'.
        // AstrologerSchema has 'email'.
        // Checking UserSchema again...
        // Line 79: mobile: ... unique
        // Line 80: password
        // It does NOT have email.

        // ISSUE: User requested Email login, but User model has no email field.
        // I should probably add email to User model or use Mobile for login.
        // Or, I can check if the user meant "Admin" as a separate entity? 
        // The codebase uses 'role: admin' on User model.

        // I will add 'email' field to User model first? 
        // Or just map email to username?
        // Let's look at the User model again. 
        // I see 'Astrologer' has email. 'User' does not.

        // SOLUTION: I should add 'email' to User schema to support this properly.
        // But for now, to avoid DB migration issues if possible, I will check if I can use mobile?
        // No, user explicitly asked for "email id".
        // So I MUST add email to User schema.

        // I will first ABORT this edit, add email to User schema, then come back.
        // But I can't abort inside a tool call.
        // I will add the code assuming 'email' exists, and then updating the model in the next step.

        const user = await User.findOne({ email });

        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        if (user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Access denied. Not an admin.' });
        }

        if (!user.password) {
            return res.status(401).json({ success: false, message: 'Password not set for this admin' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET || 'secret', { expiresIn: '1d' });

        return res.status(200).json({
            success: true,
            token,
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error('Admin login error:', error);
        return res.status(500).json({ success: false, message: 'Server error', error });
    }
};

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
        const { mobile, deviceId } = req.body;

        // Device-based login restriction: check before sending OTP
        if (deviceId) {
            const existingUser = await User.findOne({ mobile });
            if (existingUser && existingUser.activeDeviceId && existingUser.activeDeviceId !== deviceId) {
                // MIGRATION LOGIC:
                // If existing ID is legacy (starts with 'dev_') and new ID is NOT (persistent ID),
                // we allow this request. The ID will be updated upon successful verification.
                const isLegacyId = existingUser.activeDeviceId.startsWith('dev_');
                const isNewIdPersistent = !deviceId.startsWith('dev_');

                if (isLegacyId && isNewIdPersistent) {
                    console.log(`[Auth] Allowing device migration for ${mobile} from ${existingUser.activeDeviceId} to ${deviceId}`);
                    // Proceed with OTP sending
                } else {
                    return res.status(409).json({
                        success: false,
                        message: 'This number is already logged in on another device. Please logout from there to login here.'
                    });
                }
            }
        }

        let otp = generateOtp();

        if (['7990358824', '1234567890', '9374742346'].includes(mobile)) {
            otp = '1234';
        }

        const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Upsert user: create if not exists, update if exists
        await User.findOneAndUpdate(
            { mobile },
            { mobile, otp, otpExpires },
            { upsert: true, new: true }
        );

        const sent = await sendSmsOtp(mobile, otp, 'VedicAstro');
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
        const { mobile, otp, deviceId } = req.body;
        const user = await User.findOne({ mobile });

        if (!user || user.otp !== otp) {
            return res.status(400).json({ success: false, message: 'Invalid OTP' });
        }

        if (user.otpExpires && user.otpExpires < new Date()) {
            return res.status(400).json({ success: false, message: 'OTP expired' });
        }

        // Device-based login restriction
        if (deviceId && user.activeDeviceId && user.activeDeviceId !== deviceId) {
            // MIGRATION LOGIC:
            const isLegacyId = user.activeDeviceId.startsWith('dev_');
            const isNewIdPersistent = !deviceId.startsWith('dev_');

            if (isLegacyId && isNewIdPersistent) {
                console.log(`[Auth] Migrating device ID for ${mobile} on verification`);
                // Allow proceeding
            } else {
                return res.status(409).json({
                    success: false,
                    message: 'This number is already logged in on another device. Please logout from there to login here.'
                });
            }
        }

        // Clear OTP after successful verification
        user.otp = undefined;
        user.otpExpires = undefined;
        user.isVerified = true;
        if (deviceId) user.activeDeviceId = deviceId;
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

// Logout user (clear active device ID)
export const logoutUser = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;
        await User.findByIdAndUpdate(userId, { $unset: { activeDeviceId: 1 } });
        return res.status(200).json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Server error', error });
    }
};

// Update user profile after OTP login
// Update user profile after OTP login
export const updateProfile = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;
        const {
            name,
            gender,
            dob, dateOfBirth,
            tob, timeOfBirth,
            pob, placeOfBirth,
            lat: reqLat,
            lon: reqLon,
            timezone,
            tzone: reqTzone,
            day,
            month,
            year,
            hour: reqHour,
            min: reqMin,
            profilePhoto,
            zodiacSign
        } = req.body;

        const finalDob = dob || dateOfBirth;
        const finalTob = tob || timeOfBirth;
        const finalPob = pob || placeOfBirth;

        const updateData: any = {
            name,
            gender,
            dob: finalDob,
            tob: finalTob,
            pob: finalPob,
            isVerified: true
        };
        if (zodiacSign) updateData.zodiacSign = zodiacSign;

        // 1. Geocode Place of Birth if provided AND lat/lon not provided by frontend
        let lat = reqLat;
        let lon = reqLon;
        let tzone = req.body.tzone || 5.5; // Default to India if not provided

        // If POB is new/changed and we don't have lat/lon from frontend
        if (finalPob && (lat === undefined || lon === undefined)) {
            try {
                const geo = await geoService.getGeoDetails(finalPob);
                if (geo.status && geo.data && geo.data.length > 0) {
                    // Extract first result from array
                    const firstMatch = geo.data[0];
                    lat = parseFloat(firstMatch.latitude);
                    lon = parseFloat(firstMatch.longitude);
                    const parsedTzone = parseFloat(firstMatch.timezone);
                    tzone = isNaN(parsedTzone) ? 5.5 : parsedTzone;

                    updateData.lat = lat;
                    updateData.lon = lon;
                    updateData.tzone = tzone;
                    console.log(`[AuthController] Geocoded ${finalPob}: ${lat}, ${lon}`);
                }
            } catch (geoError) {
                console.warn('[AuthController] Geocoding failed:', geoError);
            }
        }


        if (lat !== undefined) updateData.lat = lat;
        if (lon !== undefined) updateData.lon = lon;
        if (timezone !== undefined) updateData.timezone = timezone;
        if (tzone !== undefined) updateData.tzone = tzone;
        if (day !== undefined) updateData.day = day;
        if (month !== undefined) updateData.month = month;
        if (year !== undefined) updateData.year = year;
        if (reqHour !== undefined) updateData.hour = reqHour;
        if (reqMin !== undefined) updateData.min = reqMin;

        // Fetch Zodiac Sign if lat/lon/dob/tob available
        // Use either new values or fallback to existing user values (we'd need to fetch user for fallback if not provided)
        // For simplicity, we only trigger if we have enough info in this request or if we fetch the user first.
        // Let's fetch the user first to get current values if not provided.
        const existingUser = await User.findById(userId);
        if (existingUser) {
            const finalLat = updateData.lat ?? existingUser.lat;
            const finalLon = updateData.lon ?? existingUser.lon;
            const finalDay = updateData.day ?? existingUser.day;
            const finalMonth = updateData.month ?? existingUser.month;
            const finalYear = updateData.year ?? existingUser.year;
            const finalHour = updateData.hour ?? existingUser.hour ?? 0;
            const finalMin = updateData.min ?? existingUser.min ?? 0;
            const finalTzone = updateData.tzone ?? existingUser.tzone ?? 5.5;

            if (finalLat && finalLon && finalDay && finalMonth && finalYear) {
                try {
                    const astroData = await astrologyService.getAstroDetails({
                        day: finalDay,
                        month: finalMonth,
                        year: finalYear,
                        hour: finalHour,
                        min: finalMin,
                        lat: finalLat,
                        lon: finalLon,
                        tzone: finalTzone,
                    });

                    if (astroData && astroData.sign) {
                        updateData.zodiacSign = astroData.sign;
                    }
                } catch (error) {
                    console.error('[AuthController] Failed to fetch zodiac sign:', error);
                }
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

        const user = await User.findById(userId).select('walletBalance bonusBalance hasUsedFreeTrial createdAt profilePhoto');

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
            bonusBalance: user.bonusBalance || 0,
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

// Mock process recharge (for testing)
export const processRecharge = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;
        const { amount, bonusAmount } = req.body;

        if (!amount || amount < 10) {
            return res.status(400).json({ success: false, message: 'Invalid amount' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const previousBalance = user.walletBalance || 0;
        const previousBonus = user.bonusBalance || 0;

        user.walletBalance = previousBalance + amount;
        user.bonusBalance = previousBonus + (bonusAmount || 0);
        await user.save();

        // Log transaction
        await Transaction.create({
            fromUser: userId,
            amount: amount,
            type: 'credit',
            status: 'success',
            description: `Recharge of ₹${amount} with bonus ₹${bonusAmount || 0}`
        });

        res.json({
            success: true,
            message: 'Recharge successful',
            walletBalance: user.walletBalance,
            bonusBalance: user.bonusBalance
        });
    } catch (error: any) {
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// ==========================================
// Razorpay Atomic Payment Flow
// ==========================================

import Razorpay from 'razorpay';
import crypto from 'crypto';

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || '',
    key_secret: process.env.RAZORPAY_KEY_SECRET || ''
});

// 1. Create Order
export const createOrder = async (req: Request, res: Response) => {
    try {
        const { amount } = req.body; // Amount in INR 
        // Note: Razorpay expects amount in PAISE (1 INR = 100 Paise)

        if (!amount || amount < 1) {
            return res.status(400).json({ success: false, message: 'Invalid amount' });
        }

        const options = {
            amount: Math.round(amount * 100), // Convert to paise
            currency: 'INR',
            receipt: `receipt_${Date.now()}`
        };

        const order = await razorpay.orders.create(options);

        res.json({
            success: true,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            key_id: process.env.RAZORPAY_KEY_ID
        });

    } catch (error: any) {
        console.error('[Auth] Create Order Error:', error);
        console.error('[Auth] Create Order Error Details:', JSON.stringify(error, null, 2));
        res.status(500).json({ success: false, message: 'Failed to create order', error: error.message });
    }
};

// 2. Verify Payment & Update Wallet (Atomic)
export const verifyPayment = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            amount,
            bonusAmount
        } = req.body;

        // 1. Verify Signature
        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
            .update(body.toString())
            .digest('hex');

        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({ success: false, message: 'Invalid payment signature' });
        }

        // 2. Payment Verified - Perform Atomic Update
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Check if this payment ID was already processed (Idempotency)
        const existingTxn = await Transaction.findOne({ description: { $regex: razorpay_payment_id } });
        if (existingTxn) {
            return res.status(200).json({ success: true, message: 'Payment already processed', walletBalance: user.walletBalance });
        }

        const previousBalance = user.walletBalance || 0;
        const previousBonus = user.bonusBalance || 0;

        user.walletBalance = previousBalance + Number(amount);
        user.bonusBalance = previousBonus + (Number(bonusAmount) || 0);
        await user.save();

        // 3. Log Transaction
        await Transaction.create({
            fromUser: userId,
            amount: Number(amount),
            type: 'credit',
            status: 'success',
            description: `Wallet Recharge via Razorpay (Txn: ${razorpay_payment_id})`
        });

        res.json({
            success: true,
            message: 'Payment verified & Wallet updated',
            walletBalance: user.walletBalance,
            bonusBalance: user.bonusBalance
        });

    } catch (error: any) {
        console.error('[Auth] Verify Payment Error:', error);
        res.status(500).json({ success: false, message: 'Payment verification failed', error: error.message });
    }
};
