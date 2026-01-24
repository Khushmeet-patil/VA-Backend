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

interface AstroDetailsInput {
    day: number;
    month: number;
    year: number;
    hour: number;
    min: number;
    lat: number;
    lon: number;
    tzone: number;
}

export const getAstroDetails = async (input: AstroDetailsInput) => {
    try {
        const response = await api.post('/astro_details', {
            day: input.day,
            month: input.month,
            year: input.year,
            hour: input.hour,
            min: input.min,
            lat: input.lat,
            lon: input.lon,
            tzone: input.tzone,
        });

        return response.data;
    } catch (error: any) {
        console.error('Astrology API AstroDetails Error:', error.response?.data || error.message);
        throw error;
    }
};

export default {
    getAstroDetails,
};
