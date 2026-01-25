import { Request, Response } from 'express';
import kundliService from '../services/kundliService';

interface AuthRequest extends Request {
    userId?: string;
}

export const getBirthDetails = async (req: AuthRequest, res: Response) => {
    try {
        const data = await kundliService.getBirthDetails(req.body);
        return res.json({ success: true, data });
    } catch (error: any) {
        console.error('[KundliController] BirthDetails Error:', error);
        return res.status(500).json({ success: false, message: error.message || 'Failed to fetch birth details' });
    }
};

export const getManglik = async (req: AuthRequest, res: Response) => {
    try {
        const data = await kundliService.getManglik(req.body);
        return res.json({ success: true, data });
    } catch (error: any) {
        console.error('[KundliController] Manglik Error:', error);
        return res.status(500).json({ success: false, message: error.message || 'Failed to fetch manglik analysis' });
    }
};

export const getBasicPanchang = async (req: AuthRequest, res: Response) => {
    try {
        const data = await kundliService.getBasicPanchang(req.body);
        return res.json({ success: true, data });
    } catch (error: any) {
        console.error('[KundliController] BasicPanchang Error:', error);
        return res.status(500).json({ success: false, message: error.message || 'Failed to fetch panchang details' });
    }
};

export const getAstroDetails = async (req: AuthRequest, res: Response) => {
    try {
        const data = await kundliService.getAstroDetails(req.body);
        return res.json({ success: true, data });
    } catch (error: any) {
        console.error('[KundliController] AstroDetails Error:', error);
        return res.status(500).json({ success: false, message: error.message || 'Failed to fetch astro details' });
    }
};

export default {
    getBirthDetails,
    getManglik,
    getBasicPanchang,
    getAstroDetails
};
