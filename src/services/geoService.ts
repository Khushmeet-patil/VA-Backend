import axios from 'axios';
import { astrologyConfig } from '../config/astrology';
import GeoCache from '../models/GeoCache';

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// ==========================================
// LEGACY ASTROLOGY API RESOLVER (OLD APK)
// ==========================================

const getAuthHeader = () => {
    const { userId, apiKey } = astrologyConfig;
    if (!userId || !apiKey) {
        console.warn('Astrology API credentials missing in config');
    }
    const token = Buffer.from(`${userId}:${apiKey}`).toString('base64');
    return `Basic ${token}`;
};

const astrologyApi = axios.create({
    baseURL: astrologyConfig.baseUrl,
});

astrologyApi.interceptors.request.use((config) => {
    config.headers.Authorization = getAuthHeader();
    return config;
});

export const getGeoDetails = async (place: string, maxRows: number = 6): Promise<{ status: boolean; data: any[] | null }> => {
    try {
        const response = await astrologyApi.post('/geo_details', {
            place,
            maxRows: maxRows
        });

        if (response.data && response.data.geonames) {
            return {
                status: true,
                data: response.data.geonames
            };
        }
        return { status: false, data: [] };
    } catch (error: any) {
        console.error('[GeoService Astrology] API Geo Error:', error.response?.data || error.message);
        return { status: false, data: [] };
    }
};


// ==========================================
// GOOGLE PLACES API V2 RESOLVER (NEW APK)
// ==========================================

export const getGeoDetailsGoogle = async (
    place: string,
    maxRows: number = 6
): Promise<{ status: boolean; data: any[] | null }> => {
    try {
        if (!place || place.trim() === '') {
            return { status: false, data: [] };
        }

        const queryVal = place.trim();
        const normalizedQuery = queryVal.toLowerCase();

        // Check cache prefix for autocomplete matches to cut API requests
        const cachedMatches = await GeoCache.find({ query: new RegExp('^' + escapeRegex(normalizedQuery)) }).limit(maxRows);
        if (cachedMatches.length > 0) {
            console.log(`[GeoService Google] Cache hit prefix for "${queryVal}": ${cachedMatches.length} matches`);
            return {
                status: true,
                data: cachedMatches.map(c => ({
                    place_name: c.place_name,
                    place_id: c.place_id,
                    latitude: c.latitude,
                    longitude: c.longitude,
                    timezone: c.timezone,
                    timezone_id: c.timezone_id,
                    country_code: c.country_code
                }))
            };
        }

        if (!GOOGLE_MAPS_API_KEY) {
            console.warn('[GeoService Google] GOOGLE_MAPS_API_KEY is not defined');
            return { status: false, data: [] };
        }

        // Call Google Places Autocomplete API
        const autocompleteUrl = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(queryVal)}&types=(regions)&key=${GOOGLE_MAPS_API_KEY}`;
        const autoRes = await axios.get(autocompleteUrl);

        if (autoRes.data && autoRes.data.predictions) {
            const predictions = autoRes.data.predictions.slice(0, maxRows);
            const mappedResults = predictions.map((pred: any) => {
                let countryCode = 'IN';
                if (pred.terms && pred.terms.length > 0) {
                    countryCode = pred.terms[pred.terms.length - 1].value;
                }
                return {
                    place_name: pred.description,
                    place_id: pred.place_id,
                    latitude: 0, // Resolved lazily upon user selection
                    longitude: 0,
                    timezone: '5.5',
                    timezone_id: 'Asia/Kolkata',
                    country_code: countryCode
                };
            });

            return {
                status: true,
                data: mappedResults
            };
        }

        return { status: false, data: [] };
    } catch (error: any) {
        console.error('[GeoService Google] Autocomplete error:', error.message);
        return { status: false, data: [] };
    }
};

/**
 * Resolves a Place ID to coordinates using Google Place Details
 */
export const getPlaceDetailsGoogle = async (placeId: string, placeName?: string): Promise<any> => {
    try {
        // 1. Check cache by place_id
        const cached = await GeoCache.findOne({ place_id: placeId });
        if (cached) {
            console.log(`[GeoService Google] Cache hit for placeId "${placeId}"`);
            return {
                place_name: cached.place_name,
                place_id: cached.place_id,
                latitude: cached.latitude,
                longitude: cached.longitude,
                timezone: cached.timezone,
                timezone_id: cached.timezone_id,
                country_code: cached.country_code
            };
        }

        if (!GOOGLE_MAPS_API_KEY) {
            console.warn('[GeoService Google] GOOGLE_MAPS_API_KEY missing');
            return null;
        }

        // 2. Query Google Place Details API
        const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry,formatted_address,address_components&key=${GOOGLE_MAPS_API_KEY}`;
        const detailsRes = await axios.get(detailsUrl);

        if (detailsRes.data && detailsRes.data.result) {
            const result = detailsRes.data.result;
            const lat = result.geometry.location.lat;
            const lng = result.geometry.location.lng;
            const formattedAddress = result.formatted_address;

            let countryCode = 'IN';
            const countryComponent = result.address_components?.find((comp: any) => comp.types.includes('country'));
            if (countryComponent) {
                countryCode = countryComponent.short_name;
            }

            const timezone = '5.5';
            const timezoneId = 'Asia/Kolkata';

            // Cache key
            const queryKey = placeName ? placeName.trim().toLowerCase() : formattedAddress.trim().toLowerCase();

            // 3. Cache the resolved details
            const savedCache = await GeoCache.findOneAndUpdate(
                { query: queryKey },
                {
                    query: queryKey,
                    place_id: placeId,
                    place_name: formattedAddress,
                    latitude: lat,
                    longitude: lng,
                    timezone: timezone,
                    timezone_id: timezoneId,
                    country_code: countryCode,
                    createdAt: new Date()
                },
                { upsert: true, new: true }
            );

            return {
                place_name: formattedAddress,
                place_id: placeId,
                latitude: lat,
                longitude: lng,
                timezone: timezone,
                timezone_id: timezoneId,
                country_code: countryCode
            };
        }

        return null;
    } catch (error: any) {
        console.error('[GeoService Google] getPlaceDetails error:', error.message);
        return null;
    }
};

/**
 * Resolves a plain text place name to coordinates using Google Places Autocomplete + Details (fallback)
 */
export const geocodePlaceGoogle = async (placeName: string): Promise<any> => {
    try {
        const queryKey = placeName.trim().toLowerCase();

        // 1. Check Cache
        const cached = await GeoCache.findOne({ query: queryKey });
        if (cached) {
            console.log(`[GeoService Google] Cache hit for geocoding query "${placeName}"`);
            return {
                place_name: cached.place_name,
                place_id: cached.place_id,
                latitude: cached.latitude,
                longitude: cached.longitude,
                timezone: cached.timezone,
                timezone_id: cached.timezone_id,
                country_code: cached.country_code
            };
        }

        if (!GOOGLE_MAPS_API_KEY) {
            console.warn('[GeoService Google] GOOGLE_MAPS_API_KEY missing');
            return null;
        }

        // 2. Call Places Autocomplete to find matches
        const autocompleteUrl = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(placeName)}&types=(regions)&key=${GOOGLE_MAPS_API_KEY}`;
        const autoRes = await axios.get(autocompleteUrl);

        if (autoRes.data && autoRes.data.predictions && autoRes.data.predictions.length > 0) {
            const bestMatch = autoRes.data.predictions[0];
            const placeId = bestMatch.place_id;

            // 3. Resolve details
            return await getPlaceDetailsGoogle(placeId, placeName);
        }

        return null;
    } catch (error: any) {
        console.error('[GeoService Google] geocodePlace error:', error.message);
        return null;
    }
};

// Helper function to escape special characters for regex search
const escapeRegex = (text: string): string => {
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
};

export default {
    getGeoDetails,
    getGeoDetailsGoogle,
    getPlaceDetailsGoogle,
    geocodePlaceGoogle
};
