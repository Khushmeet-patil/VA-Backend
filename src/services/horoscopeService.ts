import axios from 'axios';

class HoroscopeService {
    private userId: string;
    private apiKey: string;
    private baseURL: string;

    constructor() {
        // AstrologyAPI requires both UserID and API Key
        this.userId = process.env.ASTRO_USER_ID || '';
        this.apiKey = process.env.ASTRO_API_KEY || '';
        this.baseURL = 'https://json.astrologyapi.com/v1';
    }

    // --- 1. FIXED AUTHENTICATION ---
    private getHeaders() {
        const token = Buffer.from(`${this.userId}:${this.apiKey}`).toString('base64');
        return {
            'Authorization': `Basic ${token}`,
            'Content-Type': 'application/json'
        };
    }

    private async callApi(endpoint: string, data: any) {
        try {
            const response = await axios.post(`${this.baseURL}/${endpoint}`, data, {
                headers: this.getHeaders() // Use Headers, not params
            });
            return response.data;
        } catch (error: any) {
            console.error(`Error calling ${endpoint}:`, error.response?.data || error.message);
            throw new Error(error.response?.data?.message || 'Failed to fetch horoscope data');
        }
    }

    /**
     * Get Rashi/Sign Details (My Rashi)
     * Endpoint: astro_details
     */
    async getAstroDetails(data: { day: number; month: number; year: number; hour: number; min: number; lat: number; lon: number; tzone: number }) {
        return this.callApi('astro_details', data);
    }

    /**
     * Get Daily Prediction
     */
    async getDailyPrediction(sign: string, day: 'yesterday' | 'today' | 'tomorrow' = 'today', timezone: number = 5.5) {
        try {
            // Handling the sub-path logic correctly
            const endpoint = day === 'today'
                ? `sun_sign_prediction/daily/${sign}`
                : `sun_sign_prediction/daily/${day === 'tomorrow' ? 'next' : 'previous'}/${sign}`;

            return await this.callApi(endpoint, { timezone });
        } catch (error: any) {
            console.warn(`[HoroscopeService] API call failed for ${sign} ${day}:`, error.message);
            // Fallback for unauthorized plans or API errors
            return {
                status: true,
                prediction: {
                    personal_life: `Your stars are aligning for a peaceful ${day}. Focus on your inner self. (Plan Upgrade Required for full details)`,
                    profession: "Work requires patience today. Avoid rushing into decisions.",
                    health: "Drink plenty of water and stay active.",
                    travel: "Short trips may be beneficial.",
                    luck: ["Red", "White"], // Adapting format to match UI expected
                    lucky_color: "Red, White",
                    lucky_number: "7",
                    mood: "Hopeful"
                }
            };
        }
    }

    /**
     * Get Numero Prediction
     */
    async getNumeroPrediction(day: number, month: number, year: number, name: string) {
        return this.callApi('numero_prediction/daily', { day, month, year, name });
    }

    /**
     * --- 2. FIXED LUCKY TIME ---
     * Endpoint: advanced_panchang (Extract Abhijit Muhurat manually)
     */
    async getLuckyTime(data: { day: number; month: number; year: number; lat: number; lon: number; tzone: number; hour?: number; min?: number }) {
        const payload = { ...data, hour: data.hour || 0, min: data.min || 0 };
        const response = await this.callApi('advanced_panchang', payload);

        // Extract the specific 'Lucky Time' (Abhijit Muhurta)
        if (response.abhijit_muhurta) {
            return {
                status: true,
                lucky_time_start: response.abhijit_muhurta.start,
                lucky_time_end: response.abhijit_muhurta.end,
                full_panchang: response // Optional: send full data if needed
            };
        }
        return { status: false, message: "Lucky time not calculated for this date/location" };
    }

    /**
     * Get Monthly Horoscope
     */
    async getMonthlyPrediction(sign: string, timezone: number = 5.5) {
        return this.callApi(`horoscope_prediction/monthly/${sign}`, { timezone });
    }

    /**
     * Get Yearly Horoscope
     */
    async getYearlyPrediction(sign: string, year: number, timezone: number = 5.5) {
        return this.callApi(`horoscope_prediction/yearly/${sign}`, { year, timezone });
    }

    /**
     * Get Remedies (Static Logic - Good!)
     */
    getRemedies(sign: string) {
        const remedies: Record<string, string[]> = {
            aries: ["Offer water to the Sun every morning.", "Recite Hanuman Chalisa on Tuesdays."],
            taurus: ["Donate white clothes or food on Fridays.", "Worship Goddess Lakshmi."],
            gemini: ["Feed green grass to cows on Wednesdays.", "Worship Lord Ganesha."],
            cancer: ["Offer milk to Shiva Lingam on Mondays.", "Respect your mother."],
            leo: ["Offer water to the Sun at sunrise.", "Donate wheat on Sundays."],
            virgo: ["Feed birds on Wednesdays.", "Wear green clothes."],
            libra: ["Use perfumes/fragrances.", "Worship Goddess Durga."],
            scorpio: ["Light a lamp for Hanumanji on Tuesdays.", "Donate Masoor Dal."],
            sagittarius: ["Offer water to Peepal tree on Thursdays.", "Donate bananas."],
            capricorn: ["Light mustard oil lamp under Peepal tree on Saturdays.", "Help the needy."],
            aquarius: ["Donate black blankets on Saturday.", "Chant Shani Mantra."],
            pisces: ["Worship Lord Vishnu.", "Donate yellow sweets on Thursdays."]
        };
        return remedies[sign.toLowerCase()] || ["Perform daily meditation.", "Help the needy."];
    }
}

export const horoscopeService = new HoroscopeService();
export default horoscopeService;