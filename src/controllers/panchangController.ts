import { Request, Response } from 'express';
import panchangService from '../services/panchangService';

interface AuthRequest extends Request {
    userId?: string;
}

/**
 * Handle request for advanced panchang data
 */
export const getAdvancedPanchang = async (req: AuthRequest, res: Response) => {
    try {
        console.log('[PanchangController] Received AdvancedPanchang request:', JSON.stringify(req.body));
        const data = await panchangService.getAdvancedPanchang(req.body);
        return res.json({ success: true, data });
    } catch (error: any) {
        console.error('[PanchangController] AdvancedPanchang Error:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch advanced panchang details'
        });
    }
};

export default {
    getAdvancedPanchang,
};
