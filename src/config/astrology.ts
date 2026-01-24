import dotenv from 'dotenv';

dotenv.config();

export const astrologyConfig = {
    userId: process.env.ASTROLOGY_USER_ID || '',
    apiKey: process.env.ASTROLOGY_API_KEY || '',
    baseUrl: 'https://json.astrologyapi.com/v1',
};
