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
        console.log('[KundliService] Astrology API /birth_details input:', JSON.stringify(input));
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
        console.log('[KundliService] Astrology API /manglik input:', JSON.stringify(input));
        const response = await api.post('/manglik', input);
        return response.data;
    } catch (error: any) {
        console.error('Astrology API Manglik Error:', error.response?.data || error.message);
        throw error;
    }
};

export const getBasicPanchang = async (input: any) => {
    try {
        console.log('[KundliService] Astrology API /basic_panchang/sunrise input:', JSON.stringify(input));
        const response = await api.post('/basic_panchang/sunrise', input);
        return response.data;
    } catch (error: any) {
        console.error('Astrology API BasicPanchang Error:', error.response?.data || error.message);
        throw error;
    }
};

export const getAstroDetails = async (input: any) => {
    try {
        console.log('[KundliService] Astrology API /astro_details input:', JSON.stringify(input));
        const response = await api.post('/astro_details', input);
        return response.data;
    } catch (error: any) {
        console.error('Astrology API AstroDetails Error:', error.response?.data || error.message);
        throw error;
    }

};

export const getPlanets = async (input: any) => {
    try {
        console.log('[KundliService] Astrology API /planets input:', JSON.stringify(input));
        const response = await api.post('/planets', input);
        return response.data;
    } catch (error: any) {
        console.error('Astrology API Planets Error:', error.response?.data || error.message);
        throw error;
    }
};

export const getChartImage = async (input: any, chartId: string) => {
    try {
        console.log(`[KundliService] Astrology API /horo_chart_image/${chartId} input:`, JSON.stringify(input));
        const response = await api.post(`/horo_chart_image/${chartId}`, input);
        return response.data;
    } catch (error: any) {
        console.error(`Astrology API Chart Image (${chartId}) Error:`, error.response?.data || error.message);
        throw error;
    }
};

export const getHoroChartData = async (input: any, chartId: string) => {
    try {
        console.log(`[KundliService] Astrology API /horo_chart/${chartId} input:`, JSON.stringify(input));
        const response = await api.post(`/horo_chart/${chartId}`, input);
        return response.data;
    } catch (error: any) {
        console.error(`Astrology API Horo Chart Data (${chartId}) Error:`, error.response?.data || error.message);
        throw error;
    }
};

export const getKpPlanets = async (input: any) => {
    try {
        console.log('[KundliService] Astrology API /kp_planets input:', JSON.stringify(input));
        const response = await api.post('/kp_planets', input);
        return response.data;
    } catch (error: any) {
        console.error('Astrology API KpPlanets Error:', error.response?.data || error.message);
        throw error;
    }
};

export const getKpHouseCusps = async (input: any) => {
    try {
        console.log('[KundliService] Astrology API /kp_house_cusps input:', JSON.stringify(input));
        const response = await api.post('/kp_house_cusps', input);
        return response.data;
    } catch (error: any) {
        console.error('Astrology API KpHouseCusps Error:', error.response?.data || error.message);
        throw error;
    }
};

export const getCuspChart = async (input: any) => {
    try {
        console.log('[KundliService] Astrology API /cusp_chart input:', JSON.stringify(input));
        const response = await api.post('/cusp_chart', input);
        return response.data;
    } catch (error: any) {
        console.error('Astrology API CuspChart Error:', error.response?.data || error.message);
        throw error;
    }
};

export const getSarvashtak = async (input: any) => {
    try {
        console.log('[KundliService] Astrology API /sarvashtak input:', JSON.stringify(input));
        const response = await api.post('/sarvashtak', input);
        // Transform the response to simpler format if needed, but for now passing raw
        // The API returns { sarvashtak: { aries: 28, ... } } usually
        return response.data;
    } catch (error: any) {
        console.error('Astrology API Sarvashtak Error:', error.response?.data || error.message);
        throw error;
    }
};

export const getPlanetAshtak = async (input: any, planetName: string) => {
    try {
        const pName = planetName.toLowerCase();
        console.log(`[KundliService] Astrology API /planet_ashtak/${pName} input:`, JSON.stringify(input));
        const response = await api.post(`/planet_ashtak/${pName}`, input);
        return response.data;
    } catch (error: any) {
        console.error(`Astrology API PlanetAshtak (${planetName}) Error:`, error.response?.data || error.message);
        throw error;
    }
};

// Vimshottari Dasha proxy methods
export const getMajorVdasha = async (input: any) => {
    try {
        const response = await api.post('/major_vdasha', input);
        return response.data;
    } catch (error: any) {
        console.error('Astrology API Major Vdasha Error:', error.response?.data || error.message);
        throw error;
    }
};

export const getSubVdasha = async (input: any, md: string) => {
    try {
        const response = await api.post(`/sub_vdasha/${md.toLowerCase()}`, input);
        return response.data;
    } catch (error: any) {
        console.error(`Astrology API Sub Vdasha (${md}) Error:`, error.response?.data || error.message);
        throw error;
    }
};

export const getSubSubVdasha = async (input: any, md: string, ad: string) => {
    try {
        const response = await api.post(`/sub_sub_vdasha/${md.toLowerCase()}/${ad.toLowerCase()}`, input);
        return response.data;
    } catch (error: any) {
        console.error(`Astrology API Sub Sub Vdasha (${md}/${ad}) Error:`, error.response?.data || error.message);
        throw error;
    }
};

export const getSubSubSubVdasha = async (input: any, md: string, ad: string, pd: string) => {
    try {
        const response = await api.post(`/sub_sub_sub_vdasha/${md.toLowerCase()}/${ad.toLowerCase()}/${pd.toLowerCase()}`, input);
        return response.data;
    } catch (error: any) {
        console.error(`Astrology API Sub Sub Sub Vdasha (${md}/${ad}/${pd}) Error:`, error.response?.data || error.message);
        throw error;
    }
};

export const getSubSubSubSubVdasha = async (input: any, md: string, ad: string, pd: string, sd: string) => {
    try {
        const response = await api.post(`/sub_sub_sub_sub_vdasha/${md.toLowerCase()}/${ad.toLowerCase()}/${pd.toLowerCase()}/${sd.toLowerCase()}`, input);
        return response.data;
    } catch (error: any) {
        console.error(`Astrology API Sub Sub Sub Sub Vdasha (${md}/${ad}/${pd}/${sd}) Error:`, error.response?.data || error.message);
        throw error;
    }
};

// Yogini Dasha proxy methods
export const getMajorYoginiDasha = async (input: any) => {
    try {
        const response = await api.post('/major_yogini_dasha', input);
        return response.data;
    } catch (error: any) {
        console.error('Astrology API Major Yogini Dasha Error:', error.response?.data || error.message);
        throw error;
    }
};

export const getSubYoginiDasha = async (input: any) => {
    try {
        const response = await api.post('/sub_yogini_dasha', input);
        return response.data;
    } catch (error: any) {
        console.error('Astrology API Sub Yogini Dasha Error:', error.response?.data || error.message);
        throw error;
    }
};


// Report APIs
export const getGeneralAscendantReport = async (input: any) => {
    try {
        console.log('[KundliService] Astrology API /general_ascendant_report input:', JSON.stringify(input));
        const response = await api.post('/general_ascendant_report', input);
        return response.data;
    } catch (error: any) {
        console.error('Astrology API GeneralAscendantReport Error:', error.response?.data || error.message);
        throw error;
    }
};

export const getGeneralHouseReport = async (input: any, planetName: string) => {
    try {
        const pName = planetName.toLowerCase();
        console.log(`[KundliService] Astrology API /general_house_report/${pName} input:`, JSON.stringify(input));
        const response = await api.post(`/general_house_report/${pName}`, input);
        return response.data;
    } catch (error: any) {
        console.error(`Astrology API GeneralHouseReport (${planetName}) Error:`, error.response?.data || error.message);
        throw error;
    }
};

export const getRudrakshaSuggestion = async (input: any) => {
    try {
        console.log('[KundliService] Astrology API /rudraksha_suggestion input:', JSON.stringify(input));
        const response = await api.post('/rudraksha_suggestion', input);
        return response.data;
    } catch (error: any) {
        console.error('Astrology API RudrakshaSuggestion Error:', error.response?.data || error.message);
        throw error;
    }
};

export default {
    getBirthDetails,
    getManglik,
    getBasicPanchang,
    getAstroDetails,
    getPlanets,
    getChartImage,
    getHoroChartData,
    getKpPlanets,
    getKpHouseCusps,
    getCuspChart,
    getSarvashtak,
    getPlanetAshtak,
    getMajorVdasha,
    getSubVdasha,
    getSubSubVdasha,
    getSubSubSubVdasha,
    getSubSubSubSubVdasha,
    getMajorYoginiDasha,
    getSubYoginiDasha,
    getGeneralAscendantReport,
    getGeneralHouseReport,
    getRudrakshaSuggestion
};
