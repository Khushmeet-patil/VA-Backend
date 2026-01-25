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

export const getDetailedMatchingReport = async (input: any) => {
    try {
        const response = await api.post('/match_making_detailed_report', input);
        return response.data;
    } catch (error: any) {
        console.error('Astrology API Detailed Matching Report Error:', error.response?.data || error.message);
        throw error;
    }
};

export default {
    getDetailedMatchingReport,
};
