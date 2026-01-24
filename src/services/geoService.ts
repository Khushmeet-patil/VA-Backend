import axios from 'axios';
import { astrologyConfig } from '../config/astrology';

const getAuthHeader = () => {
    const { userId, apiKey } = astrologyConfig;
    if (!userId || !apiKey) {
        console.warn('Astrology API credentials missing in config');
    }
    const token = Buffer.from(`${userId}:${apiKey}`).toString('base64');
    return `Basic ${token}`;
};

const api = axios.create({
    baseURL: astrologyConfig.baseUrl,
});

// Add interceptor to inject auth header dynamically
api.interceptors.request.use((config) => {
    config.headers.Authorization = getAuthHeader();
    return config;
});

export const getGeoDetails = async (place: string): Promise<{ status: boolean; data: any[] | null }> => {
    try {
        const response = await api.post('/geo_details_json', {
            place_with_country_code: false,
            place
        });

        if (response.data && response.data.geonames) {
            return {
                status: true,
                data: response.data.geonames // Return full list
            };
        }
        return { status: false, data: [] };
    } catch (error: any) {
        console.error('Astrology API Geo Error:', error.response?.data || error.message);
        return { status: false, data: [] };
    }
};

export default {
    getGeoDetails
};
