
import dotenv from 'dotenv';
import path from 'path';

// Load env vars from .env file
dotenv.config({ path: path.join(__dirname, '.env') });

import horoscopeService from './src/services/horoscopeService';

async function testHoroscope() {
    console.log('Testing Horoscope Service...');
    console.log('User ID present:', !!process.env.ASTRO_USER_ID);
    console.log('API Key present:', !!process.env.ASTRO_API_KEY);

    try {
        console.log('\n1. Testing Daily Prediction (Aries)...');
        const daily = await horoscopeService.getDailyPrediction('aries', 'today');
        console.log('Success:', daily ? 'Yes' : 'No');
        if (daily) console.log('Prediction snippet:', JSON.stringify(daily).substring(0, 100));

    } catch (error: any) {
        console.error('FAILED Daily Prediction:', error.message);
    }

    try {
        console.log('\n2. Testing Panchang (with Time)...');
        const date = new Date();
        const panchang = await horoscopeService.getLuckyTime({
            day: date.getDate(),
            month: date.getMonth() + 1,
            year: date.getFullYear(),
            lat: 28.6139,
            lon: 77.2090,
            tzone: 5.5,
            hour: 12,
            min: 0
        });
        console.log('Success:', panchang ? 'Yes' : 'No');
    } catch (error: any) {
        console.error('FAILED Panchang:', error.message);
        // ...
    }
}

testHoroscope();
