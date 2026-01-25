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

export const getBirthDetails = async (input: any) => {
    try {
        const response = await api.post('/birth_details', input);
        return response.data;
    } catch (error: any) {
        console.warn('Astrology API BirthDetails Restricted, falling back to basic data');
        // Return minimal data that we can provide from input
        return {
            day: input.day,
            month: input.month,
            year: input.year,
            hour: input.hour,
            minute: input.min,
            latitude: input.lat,
            longitude: input.lon,
            timezone: input.tzone,
            success: true
        };
    }
};

export const getManglik = async (input: any) => {
    try {
        const response = await api.post('/manglik', input);
        return response.data;
    } catch (error: any) {
        console.error('Astrology API Manglik Error:', error.response?.data || error.message);
        throw error;
    }
};

export const getBasicPanchang = async (input: any) => {
    try {
        const response = await api.post('/basic_panchang/sunrise', input);
        return response.data;
    } catch (error: any) {
        console.error('Astrology API BasicPanchang Error:', error.response?.data || error.message);
        throw error;
    }
};

export const getAstroDetails = async (input: any) => {
    try {
        const response = await api.post('/astro_details', input);
        return response.data;
    } catch (error: any) {
        console.error('Astrology API AstroDetails Error:', error.response?.data || error.message);
        throw error;
    }
};

export default {
    getBirthDetails,
    getManglik,
    getBasicPanchang,
    getAstroDetails
};
