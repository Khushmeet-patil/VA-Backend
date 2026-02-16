import { Request, Response } from 'express';
import kundliService from '../services/kundliService';

interface AuthRequest extends Request {
    userId?: string;
}

export const getBirthDetails = async (req: AuthRequest, res: Response) => {
    try {
        console.log('[KundliController] Received BirthDetails request:', JSON.stringify(req.body));
        const data = await kundliService.getBirthDetails(req.body);
        return res.json({ success: true, data });
    } catch (error: any) {
        console.error('[KundliController] BirthDetails Error:', error);
        return res.status(500).json({ success: false, message: error.message || 'Failed to fetch birth details' });
    }
};

export const getManglik = async (req: AuthRequest, res: Response) => {
    try {
        console.log('[KundliController] Received Manglik request:', JSON.stringify(req.body));
        const data = await kundliService.getManglik(req.body);
        return res.json({ success: true, data });
    } catch (error: any) {
        console.error('[KundliController] Manglik Error:', error);
        return res.status(500).json({ success: false, message: error.message || 'Failed to fetch manglik analysis' });
    }
};

export const getBasicPanchang = async (req: AuthRequest, res: Response) => {
    try {
        console.log('[KundliController] Received AdvancedPanchang (Basic Tab) request:', JSON.stringify(req.body));
        const data = await kundliService.getAdvancedPanchang(req.body);
        return res.json({ success: true, data });
    } catch (error: any) {
        console.error('[KundliController] AdvancedPanchang Error:', error);
        return res.status(500).json({ success: false, message: error.message || 'Failed to fetch panchang details' });
    }
};

export const getAstroDetails = async (req: AuthRequest, res: Response) => {
    try {
        console.log('[KundliController] Received AstroDetails request:', JSON.stringify(req.body));
        const data = await kundliService.getAstroDetails(req.body);
        return res.json({ success: true, data });
    } catch (error: any) {
        console.error('[KundliController] AstroDetails Error:', error);
        return res.status(500).json({ success: false, message: error.message || 'Failed to fetch astro details' });
    }

};

export const getPlanets = async (req: AuthRequest, res: Response) => {
    try {
        console.log('[KundliController] Received Planets request:', JSON.stringify(req.body));
        const data = await kundliService.getPlanets(req.body);
        return res.json({ success: true, data });
    } catch (error: any) {
        console.error('[KundliController] Planets Error:', error);
        return res.status(500).json({ success: false, message: error.message || 'Failed to fetch planetary details' });
    }
};

export const getChartImage = async (req: AuthRequest, res: Response) => {
    try {
        const { chartId } = req.params;
        console.log(`[KundliController] Received ChartImage request for ${chartId}:`, JSON.stringify(req.body));
        const data = await kundliService.getChartImage(req.body, chartId);
        return res.json({ success: true, data });
    } catch (error: any) {
        console.error('[KundliController] ChartImage Error:', error);
        return res.status(500).json({ success: false, message: error.message || 'Failed to fetch chart image' });
    }
};

export const getHoroChartData = async (req: AuthRequest, res: Response) => {
    try {
        const { chartId } = req.params;
        console.log(`[KundliController] Received HoroChartData request for ${chartId}:`, JSON.stringify(req.body));
        const data = await kundliService.getHoroChartData(req.body, chartId);
        return res.json({ success: true, data });
    } catch (error: any) {
        console.error('[KundliController] HoroChartData Error:', error);
        return res.status(500).json({ success: false, message: error.message || 'Failed to fetch horo chart data' });
    }
};

export const getKpPlanets = async (req: AuthRequest, res: Response) => {
    try {
        console.log('[KundliController] Received KpPlanets request:', JSON.stringify(req.body));
        const data = await kundliService.getKpPlanets(req.body);
        return res.json({ success: true, data });
    } catch (error: any) {
        console.error('[KundliController] KpPlanets Error:', error);
        return res.status(500).json({ success: false, message: error.message || 'Failed to fetch KP planets' });
    }
};

export const getKpHouseCusps = async (req: AuthRequest, res: Response) => {
    try {
        console.log('[KundliController] Received KpHouseCusps request:', JSON.stringify(req.body));
        const data = await kundliService.getKpHouseCusps(req.body);
        return res.json({ success: true, data });
    } catch (error: any) {
        console.error('[KundliController] KpHouseCusps Error:', error);
        return res.status(500).json({ success: false, message: error.message || 'Failed to fetch KP house cusps' });
    }
};

export const getCuspChart = async (req: AuthRequest, res: Response) => {
    try {
        console.log('[KundliController] Received CuspChart request:', JSON.stringify(req.body));
        const data = await kundliService.getCuspChart(req.body);
        return res.json({ success: true, data });
    } catch (error: any) {
        console.error('[KundliController] CuspChart Error:', error);
        return res.status(500).json({ success: false, message: error.message || 'Failed to fetch cusp chart' });
    }
};

export const getSarvashtak = async (req: AuthRequest, res: Response) => {
    try {
        console.log('[KundliController] Received Sarvashtak request:', JSON.stringify(req.body));
        const data = await kundliService.getSarvashtak(req.body);
        return res.json({ success: true, data });
    } catch (error: any) {
        console.error('[KundliController] Sarvashtak Error:', error);
        return res.status(500).json({ success: false, message: error.message || 'Failed to fetch sarvashtak data' });
    }
};

export const getPlanetAshtak = async (req: AuthRequest, res: Response) => {
    try {
        const { planetName } = req.params;
        console.log(`[KundliController] Received PlanetAshtak request for ${planetName}:`, JSON.stringify(req.body));
        const data = await kundliService.getPlanetAshtak(req.body, planetName);
        return res.json({ success: true, data });
    } catch (error: any) {
        console.error('[KundliController] PlanetAshtak Error:', error);
        return res.status(500).json({ success: false, message: error.message || 'Failed to fetch planet ashtak data' });
    }
};

// Vimshottari Dasha handlers
export const getMajorVdasha = async (req: AuthRequest, res: Response) => {
    try {
        const data = await kundliService.getMajorVdasha(req.body);
        return res.json({ success: true, data });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getSubVdasha = async (req: AuthRequest, res: Response) => {
    try {
        const { md } = req.params;
        const data = await kundliService.getSubVdasha(req.body, md);
        return res.json({ success: true, data });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getSubSubVdasha = async (req: AuthRequest, res: Response) => {
    try {
        const { md, ad } = req.params;
        const data = await kundliService.getSubSubVdasha(req.body, md, ad);
        return res.json({ success: true, data });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getSubSubSubVdasha = async (req: AuthRequest, res: Response) => {
    try {
        const { md, ad, pd } = req.params;
        const data = await kundliService.getSubSubSubVdasha(req.body, md, ad, pd);
        return res.json({ success: true, data });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getSubSubSubSubVdasha = async (req: AuthRequest, res: Response) => {
    try {
        const { md, ad, pd, sd } = req.params;
        const data = await kundliService.getSubSubSubSubVdasha(req.body, md, ad, pd, sd);
        return res.json({ success: true, data });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// Yogini Dasha handlers
export const getMajorYoginiDasha = async (req: AuthRequest, res: Response) => {
    try {
        const data = await kundliService.getMajorYoginiDasha(req.body);
        return res.json({ success: true, data });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getSubYoginiDasha = async (req: AuthRequest, res: Response) => {
    try {
        const data = await kundliService.getSubYoginiDasha(req.body);
        return res.json({ success: true, data });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};


export const getGeneralAscendantReport = async (req: AuthRequest, res: Response) => {
    try {
        console.log('[KundliController] Received GeneralAscendantReport request:', JSON.stringify(req.body));
        const data = await kundliService.getGeneralAscendantReport(req.body);
        return res.json({ success: true, data });
    } catch (error: any) {
        console.error('[KundliController] GeneralAscendantReport Error:', error);
        return res.status(500).json({ success: false, message: error.message || 'Failed to fetch general ascendant report' });
    }
};

export const getGeneralHouseReport = async (req: AuthRequest, res: Response) => {
    try {
        const { planetName } = req.params;
        console.log(`[KundliController] Received GeneralHouseReport request for ${planetName}:`, JSON.stringify(req.body));
        const data = await kundliService.getGeneralHouseReport(req.body, planetName);
        return res.json({ success: true, data });
    } catch (error: any) {
        console.error('[KundliController] GeneralHouseReport Error:', error);
        return res.status(500).json({ success: false, message: error.message || 'Failed to fetch general house report' });
    }
};


export const getRudrakshaSuggestion = async (req: AuthRequest, res: Response) => {
    try {
        console.log('[KundliController] Received RudrakshaSuggestion request:', JSON.stringify(req.body));
        const data = await kundliService.getRudrakshaSuggestion(req.body);
        return res.json({ success: true, data });
    } catch (error: any) {
        console.error('[KundliController] RudrakshaSuggestion Error:', error);
        return res.status(500).json({ success: false, message: error.message || 'Failed to fetch rudraksha suggestion' });
    }
};


export const getGemSuggestion = async (req: AuthRequest, res: Response) => {
    try {
        console.log('[KundliController] Received GemSuggestion request:', JSON.stringify(req.body));
        const data = await kundliService.getGemSuggestion(req.body);
        return res.json({ success: true, data });
    } catch (error: any) {
        console.error('[KundliController] GemSuggestion Error:', error);
        return res.status(500).json({ success: false, message: error.message || 'Failed to fetch gemstone suggestion' });
    }
};


export const getKalsarpaDetails = async (req: AuthRequest, res: Response) => {
    try {
        console.log('[KundliController] Received KalsarpaDetails request:', JSON.stringify(req.body));
        const data = await kundliService.getKalsarpaDetails(req.body);
        return res.json({ success: true, data });
    } catch (error: any) {
        console.error('[KundliController] KalsarpaDetails Error:', error);
        return res.status(500).json({ success: false, message: error.message || 'Failed to fetch kalsarpa details' });
    }
};

export const getSadhesatiLifeDetails = async (req: AuthRequest, res: Response) => {
    try {
        console.log('[KundliController] Received SadhesatiLifeDetails request:', JSON.stringify(req.body));
        const data = await kundliService.getSadhesatiLifeDetails(req.body);
        return res.json({ success: true, data });
    } catch (error: any) {
        console.error('[KundliController] SadhesatiLifeDetails Error:', error);
        return res.status(500).json({ success: false, message: error.message || 'Failed to fetch Sadhesati life details' });
    }
};

export const getSadhesatiCurrentStatus = async (req: AuthRequest, res: Response) => {
    try {
        console.log('[KundliController] Received SadhesatiCurrentStatus request:', JSON.stringify(req.body));
        const data = await kundliService.getSadhesatiCurrentStatus(req.body);
        return res.json({ success: true, data });
    } catch (error: any) {
        console.error('[KundliController] SadhesatiCurrentStatus Error:', error);
        return res.status(500).json({ success: false, message: error.message || 'Failed to fetch Sadhesati current status' });
    }
};

export const getSunSignPrediction = async (req: AuthRequest, res: Response) => {
    try {
        const { zodiacName, type } = req.params;
        console.log(`[KundliController] SunSignPrediction: ${zodiacName}, ${type}`, JSON.stringify(req.body));
        const data = await kundliService.getSunSignPrediction(zodiacName, type as any, req.body);
        return res.json({ success: true, data });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getNumeroPrediction = async (req: AuthRequest, res: Response) => {
    try {
        const data = await kundliService.getNumeroPrediction(req.body);
        return res.json({ success: true, data });
    } catch (error: any) {
        return res.status(500).json({ success: false, message: error.message });
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
    getRudrakshaSuggestion,
    getGemSuggestion,
    getKalsarpaDetails,
    getSadhesatiLifeDetails,
    getSadhesatiCurrentStatus,
    getSunSignPrediction,
    getNumeroPrediction
};
