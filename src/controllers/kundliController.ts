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
        console.log('[KundliController] Received BasicPanchang request:', JSON.stringify(req.body));
        const data = await kundliService.getBasicPanchang(req.body);
        return res.json({ success: true, data });
    } catch (error: any) {
        console.error('[KundliController] BasicPanchang Error:', error);
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
    getPlanetAshtak
};
