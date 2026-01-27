import express, { Request, Response } from 'express';
import User from '../models/User';
import geoService from '../services/geoService';
import astrologyService from '../services/astrologyService';
import mongoose from 'mongoose';

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

        const user = await User.findById(userId).select('name gender dob tob pob day month year hour min lat lon timezone tzone birthProfiles');
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
            day: user.day,
            month: user.month,
            year: user.year,
            hour: user.hour,
            min: user.min,
            lat: user.lat,
            lon: user.lon,
            timezone: user.timezone,
            tzone: user.tzone,
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
 * GET /profiles/:id
 * Get a single birth profile by ID for the authenticated user
 */
export const getProfileById = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId;
        const { id } = req.params;

        if (!userId) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Handle default profile
        if (id === 'default') {
            const defaultProfile = {
                _id: 'default',
                name: user.name || '',
                gender: user.gender || '',
                dateOfBirth: user.dob || '',
                timeOfBirth: user.tob || '',
                placeOfBirth: user.pob || '',
                day: user.day,
                month: user.month,
                year: user.year,
                hour: user.hour,
                min: user.min,
                lat: user.lat,
                lon: user.lon,
                timezone: user.timezone,
                tzone: user.tzone,
                isDefault: true,
            };
            return res.json({ profile: defaultProfile });
        }

        // Validate ID format
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid profile ID' });
        }

        // Find the specific profile
        const profile = user.birthProfiles.find(p => (p as any)._id?.toString() === id);

        if (!profile) {
            return res.status(404).json({ message: 'Profile not found' });
        }

        res.json({ profile });

    } catch (error: any) {
        console.error('Get profile by ID error:', error);
        res.status(500).json({ message: 'Failed to get profile' });
    }
};

/**
 * POST /profiles
 * Create a new birth profile for the authenticated user
 */
export const createProfile = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId;
        const {
            name, gender, dateOfBirth, timeOfBirth, placeOfBirth,
            lat, lon, timezone, tzone: reqTzone,
            day, month, year, hour: reqHour, min: reqMin
        } = req.body;

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
            day,
            month,
            year,
            hour: reqHour,
            min: reqMin,
            lat,
            lon,
            timezone,
            tzone: reqTzone,
            createdAt: new Date(),
        };

        // Geocode Place of Birth only if lat/lon not provided
        if (placeOfBirth && (newProfile.lat === undefined || newProfile.lon === undefined)) {
            try {
                const geo = await geoService.getGeoDetails(placeOfBirth);
                if (geo.status && geo.data && geo.data.length > 0) {
                    const firstMatch = geo.data[0];
                    newProfile.lat = parseFloat(firstMatch.latitude);
                    newProfile.lon = parseFloat(firstMatch.longitude);
                    const parsedTzone = parseFloat(firstMatch.timezone);
                    if (newProfile.tzone === undefined) {
                        newProfile.tzone = isNaN(parsedTzone) ? 5.5 : parsedTzone;
                    }
                }
            } catch (error) {
                console.warn('[ProfileController] Geocoding failed:', error);
            }
        }

        // Fetch Astro Sign if lat/lon/day/month/year/hour/min available
        if (newProfile.lat && newProfile.lon && newProfile.day && newProfile.month && newProfile.year) {
            try {
                const astroData = await astrologyService.getAstroDetails({
                    day: newProfile.day,
                    month: newProfile.month,
                    year: newProfile.year,
                    hour: newProfile.hour || 0,
                    min: newProfile.min || 0,
                    lat: newProfile.lat,
                    lon: newProfile.lon,
                    tzone: newProfile.tzone || 5.5,
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
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: 'Validation Error', error: error.message });
        }
        res.status(500).json({ message: 'Failed to create profile', error: error.message });
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
        const {
            name, gender, dateOfBirth, timeOfBirth, placeOfBirth,
            lat: reqLat, lon: reqLon, timezone, tzone: reqTzone,
            day, month, year, hour: reqHour, min: reqMin
        } = req.body;

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
        let tzone = reqTzone;
        let dayVal = day;
        let monthVal = month;
        let yearVal = year;
        let hourVal = reqHour;
        let minVal = reqMin;

        // Fallback geocoding if place changed and no coords provided
        // If updating default profile, update user's main fields
        if (id === 'default') {
            if (name) user.name = name;
            if (gender) user.gender = gender;
            if (dateOfBirth) user.dob = dateOfBirth;
            if (timeOfBirth) user.tob = timeOfBirth;
            if (placeOfBirth) user.pob = placeOfBirth;
            if (dayVal !== undefined) user.day = dayVal;
            if (monthVal !== undefined) user.month = monthVal;
            if (yearVal !== undefined) user.year = yearVal;
            if (hourVal !== undefined) user.hour = hourVal;
            if (minVal !== undefined) user.min = minVal;
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
                    day: user.day,
                    month: user.month,
                    year: user.year,
                    hour: user.hour,
                    min: user.min,
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
        if (dayVal !== undefined) profile.day = dayVal;
        if (monthVal !== undefined) profile.month = monthVal;
        if (yearVal !== undefined) profile.year = yearVal;
        if (hourVal !== undefined) profile.hour = hourVal;
        if (minVal !== undefined) profile.min = minVal;
        if (lat !== undefined) profile.lat = lat;
        if (lon !== undefined) profile.lon = lon;
        if (timezone !== undefined) profile.timezone = timezone;
        if (tzone !== undefined) profile.tzone = tzone;

        // If birth details changed, re-fetch sign
        if (dateOfBirth || timeOfBirth || placeOfBirth || lat !== undefined || lon !== undefined) {
            try {
                // Use updated values from the profile object we just modified
                if (profile.lat && profile.lon && profile.day && profile.month && profile.year) {
                    const astroData = await astrologyService.getAstroDetails({
                        day: profile.day,
                        month: profile.month,
                        year: profile.year,
                        hour: profile.hour || 0,
                        min: profile.min || 0,
                        lat: profile.lat,
                        lon: profile.lon,
                        tzone: profile.tzone || 5.5,
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
