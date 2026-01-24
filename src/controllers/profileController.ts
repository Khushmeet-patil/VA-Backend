import { Request, Response } from 'express';
import User from '../models/User';

/**
 * Profile Controller
 * Handles CRUD operations for user birth profiles.
 */

interface AuthRequest extends Request {
    userId?: string;
    userRole?: string;
}

/**
 * GET /profiles
 * Get all saved birth profiles for the authenticated user
 */
export const getProfiles = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId;

        if (!userId) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        const user = await User.findById(userId).select('name gender dob tob pob birthProfiles');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Create default profile from user's account data
        const defaultProfile = {
            _id: 'default',
            name: user.name || '',
            gender: user.gender || '',
            dateOfBirth: user.dob || '',
            timeOfBirth: user.tob || '',
            placeOfBirth: user.pob || '',
            lat: user.lat,
            lon: user.lon,
            timezone: user.timezone,
            isDefault: true,
        };

        // Combine default profile with saved profiles
        const allProfiles = [defaultProfile, ...user.birthProfiles];

        res.json({ profiles: allProfiles });

    } catch (error: any) {
        console.error('Get profiles error:', error);
        res.status(500).json({ message: 'Failed to get profiles' });
    }
};

/**
 * POST /profiles
 * Create a new birth profile for the authenticated user
 */
export const createProfile = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId;
        const { name, gender, dateOfBirth, timeOfBirth, placeOfBirth, lat, lon, timezone } = req.body;

        if (!userId) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        // Validate required fields
        if (!name || !gender || !dateOfBirth || !timeOfBirth || !placeOfBirth) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Create new profile
        const newProfile = {
            name,
            gender,
            dateOfBirth,
            timeOfBirth,
            placeOfBirth,
            lat,
            lon,
            timezone,
            createdAt: new Date(),
        };

        user.birthProfiles.push(newProfile);
        await user.save();

        // Get the newly created profile (last one in array)
        const createdProfile = user.birthProfiles[user.birthProfiles.length - 1];

        res.status(201).json({
            message: 'Profile created successfully',
            profile: createdProfile,
        });

    } catch (error: any) {
        console.error('Create profile error:', error);
        res.status(500).json({ message: 'Failed to create profile' });
    }
};

/**
 * DELETE /profiles/:id
 * Delete a birth profile for the authenticated user
 */
export const deleteProfile = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId;
        const { id } = req.params;

        if (!userId) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        if (id === 'default') {
            return res.status(400).json({ message: 'Cannot delete default profile' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Find and remove the profile
        const profileIndex = user.birthProfiles.findIndex(
            (p) => p._id?.toString() === id
        );

        if (profileIndex === -1) {
            return res.status(404).json({ message: 'Profile not found' });
        }

        user.birthProfiles.splice(profileIndex, 1);
        await user.save();

        res.json({ message: 'Profile deleted successfully' });

    } catch (error: any) {
        console.error('Delete profile error:', error);
        res.status(500).json({ message: 'Failed to delete profile' });
    }
};

/**
 * PUT /profiles/:id
 * Update a birth profile for the authenticated user
 */
export const updateProfile = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        const { name, gender, dateOfBirth, timeOfBirth, placeOfBirth, lat, lon, timezone } = req.body;

        if (!userId) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // If updating default profile, update user's main fields
        if (id === 'default') {
            if (name) user.name = name;
            if (gender) user.gender = gender;
            if (dateOfBirth) user.dob = dateOfBirth;
            if (timeOfBirth) user.tob = timeOfBirth;
            if (placeOfBirth) user.pob = placeOfBirth;
            if (lat !== undefined) user.lat = lat;
            if (lon !== undefined) user.lon = lon;
            if (timezone !== undefined) user.timezone = timezone;
            await user.save();

            return res.json({
                message: 'Default profile updated',
                profile: {
                    _id: 'default',
                    name: user.name,
                    gender: user.gender,
                    dateOfBirth: user.dob,
                    timeOfBirth: user.tob,
                    placeOfBirth: user.pob,
                    lat: user.lat,
                    lon: user.lon,
                    timezone: user.timezone,
                    isDefault: true,
                },
            });
        }

        // Find and update the profile
        const profile = user.birthProfiles.find(
            (p) => p._id?.toString() === id
        );

        if (!profile) {
            return res.status(404).json({ message: 'Profile not found' });
        }

        if (name) profile.name = name;
        if (gender) profile.gender = gender;
        if (dateOfBirth) profile.dateOfBirth = dateOfBirth;
        if (timeOfBirth) profile.timeOfBirth = timeOfBirth;
        if (placeOfBirth) profile.placeOfBirth = placeOfBirth;
        if (lat !== undefined) profile.lat = lat;
        if (lon !== undefined) profile.lon = lon;
        if (timezone !== undefined) profile.timezone = timezone;

        await user.save();

        res.json({
            message: 'Profile updated successfully',
            profile,
        });

    } catch (error: any) {
        console.error('Update profile error:', error);
        res.status(500).json({ message: 'Failed to update profile' });
    }
};
