import axios from 'axios';

// Configuration
const BASE_URL = 'http://localhost:5000/api'; // Adjust port if needed
// You might need a valid token. For test script, we often skip auth or login first.
// Assuming we need a token, we might need to login first.
// But for quick check, maybe we can mock or use a known user.

const testKundliCharts = async () => {
    try {
        console.log('Testing Kundli Charts Endpoints...');

        // 1. Login to get token (Optional: replace with hardcoded token if useful)
        // const loginRes = await axios.post(`${BASE_URL}/auth/login`, { mobile: '1234567890' });
        // const token = loginRes.data.token;

        // Mock token if auth disabled for dev or use a valid one
        const token = 'YOUR_TEST_TOKEN';

        const payload = {
            day: 15,
            month: 8,
            year: 1947,
            hour: 0,
            min: 0,
            lat: 28.61,
            lon: 77.20,
            tzone: 5.5
        };

        // 2. Test /planets
        console.log('\nTesting /kundli/planets...');
        try {
            // Note: Use a valid token here if possible, or bypass auth middleware for testing
            const planetsRes = await axios.post(`${BASE_URL}/kundli/planets`, payload, {
                headers: { Authorization: `Bearer ${token}` }
            });
            console.log('Planets Response Status:', planetsRes.status);
            console.log('Planets Data keys:', Object.keys(planetsRes.data));
            if (planetsRes.data.success) {
                console.log('Planets Data Sample:', JSON.stringify(planetsRes.data.data).substring(0, 100));
            }
        } catch (e: any) {
            console.error('Planets Error:', e.response?.data || e.message);
        }

        // 3. Test /horo-chart/D1
        console.log('\nTesting /kundli/horo-chart/D1...');
        try {
            const chartRes = await axios.post(`${BASE_URL}/kundli/horo-chart/D1`, payload, {
                headers: { Authorization: `Bearer ${token}` }
            });
            console.log('Chart Response Status:', chartRes.status);
            if (chartRes.data.success) {
                console.log('Chart Data (SVG/Image):', typeof chartRes.data.data);
            }
        } catch (e: any) {
            console.error('Chart Error:', e.response?.data || e.message);
        }

    } catch (err) {
        console.error('Test Script Error:', err);
    }
};

testKundliCharts();
