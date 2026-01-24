import dotenv from 'dotenv';
import path from 'path';
import horoscopeService from './src/services/horoscopeService';

// Load environment variables correctly
dotenv.config({ path: path.join(__dirname, '.env') });

const testAPI = async () => {
    console.log("Testing Horoscope API Access...");

    // Test 1: Today (Expected to work on basic plans)
    console.log("\n--- Testing 'Today' ---");
    const today = await horoscopeService.getDailyPrediction('aries', 'today');
    console.log("Today Result:", today.status ? "Success" : "Failed");
    if (!today.status || today.prediction?.personal_life?.includes("Upgrade")) {
        console.log("Today Data seems to be Fallback/Error");
    } else {
        console.log("Today Data is REAL!");
    }

    // Test 2: Tomorrow (Likely restricted)
    console.log("\n--- Testing 'Tomorrow' ---");
    const tomorrow = await horoscopeService.getDailyPrediction('aries', 'tomorrow');
    console.log("Tomorrow Result:", tomorrow.status ? "Success" : "Failed");
    if (tomorrow.prediction?.personal_life?.includes("Upgrade")) {
        console.log("Tomorrow Data is FALLBACK (Expected if restricted)");
    }

    // Test 3: Monthly (Likely restricted)
    console.log("\n--- Testing 'Monthly' ---");
    const monthly = await horoscopeService.getMonthlyPrediction('aries');
    console.log("Monthly Result:", monthly.status ? "Success" : "Failed");

};

testAPI();
