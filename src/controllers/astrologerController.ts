import { Request, Response } from 'express';
import Astrologer from '../models/Astrologer';
import User from '../models/User';

// Apply for Astrologer (User)
export const applyForAstrologer = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;
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
            bio
        } = req.body;

        // Check if already applied
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
        // Use lean() to get plain objects and avoid schema validation issues with old data
        const astrologers = await Astrologer.find({ status: 'approved', isBlocked: { $ne: true }, isOnline: true })
            .select('firstName lastName systemKnown language bio experience rating isOnline pricePerMin priceRangeMin priceRangeMax profilePhoto')
            .sort({ rating: -1 })
            .lean();

        res.json(astrologers);
    } catch (error: any) {
        console.error('Get astrologers error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

