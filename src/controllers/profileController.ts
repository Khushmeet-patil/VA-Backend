import { Request, Response } from 'express';
import User from '../models/User';
import geoService from '../services/geoService';
import astrologyService from '../services/astrologyService';

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

        // Create new profile object
        const newProfile: any = {
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

        // Geocode Place of Birth
        if (placeOfBirth) {
            try {
                const geo = await geoService.getGeoDetails(placeOfBirth);
                if (geo.status && geo.data && geo.data.length > 0) {
                    const firstMatch = geo.data[0];
                    newProfile.lat = parseFloat(firstMatch.latitude);
                    newProfile.lon = parseFloat(firstMatch.longitude);
                    newProfile.tzone = parseFloat(firstMatch.timezone);
                    newProfile.tzone = parseFloat(firstMatch.timezone);
                }
            } catch (error) {
                console.warn('[ProfileController] Geocoding failed:', error);
            }
        }

        // Fetch Astro Sign if lat/lon/tzone available
        if (newProfile.lat && newProfile.lon && newProfile.dateOfBirth && newProfile.timeOfBirth) {
            try {
                const date = new Date(newProfile.dateOfBirth);
                // Handle time string "HH:mm"
                const [hours, minutes] = newProfile.timeOfBirth.split(':').map(Number);

                const astroData = await astrologyService.getAstroDetails({
                    day: date.getDate(),
                    month: date.getMonth() + 1,
                    year: date.getFullYear(),
                    hour: hours || 0,
                    min: minutes || 0,
                    lat: newProfile.lat,
                    lon: newProfile.lon,
                    tzone: newProfile.tzone || 5.5, // Default to India if missing
                });

                if (astroData && astroData.sign) {
                    newProfile.sign = astroData.sign;
                }
            } catch (error) {
                console.error('[ProfileController] Failed to fetch astro sign:', error);
            }
        }

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
        const { name, gender, dateOfBirth, timeOfBirth, placeOfBirth, lat: reqLat, lon: reqLon, timezone } = req.body;

        if (!userId) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Prepare values
        let lat = reqLat;
        let lon = reqLon;
        let tzone: number | undefined;

        // Fallback geocoding if place changed and no coords provided
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
            if (tzone !== undefined) user.tzone = tzone;
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
                    tzone: user.tzone,
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
        if (tzone !== undefined) profile.tzone = tzone;

        if (tzone !== undefined) profile.tzone = tzone;

        // If birth details changed, re-fetch sign
        if (dateOfBirth || timeOfBirth || placeOfBirth || lat !== undefined || lon !== undefined) {
            try {
                // Use updated or existing values
                const pDate = profile.dateOfBirth ? new Date(profile.dateOfBirth) : new Date();
                const pTime = profile.timeOfBirth || "12:00";
                const pLat = profile.lat;
                const pLon = profile.lon;
                const pTzone = profile.tzone || 5.5;

                if (pLat && pLon) {
                    const [hours, minutes] = pTime.split(':').map(Number);

                    const astroData = await astrologyService.getAstroDetails({
                        day: pDate.getDate(),
                        month: pDate.getMonth() + 1,
                        year: pDate.getFullYear(),
                        hour: hours || 0,
                        min: minutes || 0,
                        lat: pLat,
                        lon: pLon,
                        tzone: pTzone,
                    });

                    if (astroData && astroData.sign) {
                        profile.sign = astroData.sign;
                    }
                }
            } catch (error) {
                console.error('[ProfileController] Failed to update astro sign:', error);
            }
        }

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
