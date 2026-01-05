import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import Astrologer from '../models/Astrologer';
import Otp from '../models/Otp';
import ChatSession from '../models/ChatSession';
import ChatMessage from '../models/ChatMessage';

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

        if (!mobile || !otp) {
            return res.status(400).json({ success: false, message: 'Mobile and OTP required' });
        }

        // Dev bypass for testing
        const isValidOtp = otp === '1234' || await Otp.findOne({ mobile, otp });

        if (!isValidOtp) {
            return res.status(400).json({ success: false, message: 'Invalid OTP' });
        }

        // Delete used OTP
        await Otp.deleteOne({ mobile });

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
                isOnline: astrologer.isOnline || false,
                isBlocked: astrologer.isBlocked || false,
                pricePerMin: astrologer.pricePerMin || 20,
                priceRangeMin: astrologer.priceRangeMin || 10,
                priceRangeMax: astrologer.priceRangeMax || 100,
            }
        });
    } catch (error: any) {
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
                experience: astrologer.experience,
                systemKnown: astrologer.systemKnown,
                language: astrologer.language,
                isOnline: astrologer.isOnline || false,
                isBlocked: astrologer.isBlocked || false,
                pricePerMin: astrologer.pricePerMin || 20,
                priceRangeMin: astrologer.priceRangeMin || 10,
                priceRangeMax: astrologer.priceRangeMax || 100,
                city: astrologer.city,
                country: astrologer.country,
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
        const { firstName, lastName, bio, experience, systemKnown, language } = req.body;

        const astrologer = await Astrologer.findByIdAndUpdate(
            astrologerId,
            { firstName, lastName, bio, experience, systemKnown, language },
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

// Get Astrologer's Chats
export const getChats = async (req: Request, res: Response) => {
    try {
        const astrologerId = (req as any).userId;

        // Find sessions involving this astrologer (ACTIVE or ENDED)
        const sessions = await ChatSession.find({
            astrologerId,
            status: { $in: ['ACTIVE', 'ENDED'] }
        })
            .populate('userId', 'name mobile')
            .sort({ updatedAt: -1 });

        const chatList = await Promise.all(sessions.map(async (session) => {
            // Get last message
            const lastMsg = await ChatMessage.findOne({ sessionId: session.sessionId })
                .sort({ timestamp: -1 });

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
            } else if (session.startTime) {
                timeString = session.startTime.toLocaleDateString();
            }

            return {
                id: session.sessionId,
                userId: {
                    name: (session.userId as any).name || 'User',
                    mobile: (session.userId as any).mobile || ''
                },
                lastMessage: lastMsg ? lastMsg.text : (session.status === 'ACTIVE' ? 'Chat in progress...' : 'Chat ended'),
                lastMessageTime: timeString,
                unreadCount: 0 // TODO: Implement unread count
            };
        }));

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

