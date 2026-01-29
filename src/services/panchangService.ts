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

api.interceptors.request.use((config) => {
    config.headers.Authorization = getAuthHeader();
    return config;
});

/**
 * Fetch advanced panchang details from Astrology API
 * @param input Birth details (day, month, year, hour, min, lat, lon, tzone)
 */
export const getAdvancedPanchang = async (input: any) => {
    try {
        console.log('[PanchangService] Astrology API /advanced_panchang input:', JSON.stringify(input));
        const response = await api.post('/advanced_panchang', input);
        return response.data;
    } catch (error: any) {
        console.error('Astrology API AdvancedPanchang Error:', error.response?.data || error.message);
        throw error;
    }
};

export default {
    getAdvancedPanchang,
};
