// Stub service to fix build errors from missing file
// This likely needs to be replaced with the actual implementation

export const getGeoDetails = async (place: string): Promise<{ status: boolean; data: { latitude: number; longitude: number; timezone: number } | null }> => {
    console.warn('[HoroscopeService Stub] getGeoDetails called but service is missing implementation.');
    return {
        status: false,
        data: null
    };
};

export const getAstroDetails = async (payload: any): Promise<{ sign: string; sun_sign: string } | null> => {
    console.warn('[HoroscopeService Stub] getAstroDetails called but service is missing implementation.');
    return {
        sign: 'Aries', // Default
        sun_sign: 'Aries'
    };
};

export default {
    getGeoDetails,
    getAstroDetails
};
