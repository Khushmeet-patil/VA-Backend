import { Request, Response } from 'express';
import matchingService from '../services/matchingService';

interface AuthRequest extends Request {
    userId?: string;
    userRole?: string;
}

/**
 * POST /api/matching/detailed-report
 * Proxies the detailed matching report request to Astrology API
 */
export const getDetailedMatchingReport = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Authentication required' });
        }

        const reportData = await matchingService.getDetailedMatchingReport(req.body);

        return res.json({
            success: true,
            data: reportData
        });
    } catch (error: any) {
        console.error('[MatchingController] Error:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch matching report',
            error: process.env.NODE_ENV === 'development' ? error : undefined
        });
    }
};

export default {
    getDetailedMatchingReport,
};
