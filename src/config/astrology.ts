import dotenv from 'dotenv';

dotenv.config();

export const astrologyConfig = {
    userId: process.env.ASTRO_USER_ID || '',
    apiKey: process.env.ASTRO_API_KEY || '',
    baseUrl: 'https://json.astrologyapi.com/v1',
};
