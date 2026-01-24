import express, { Request, Response } from 'express';
import geoService from '../services/geoService';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();

// Public route for city search (needed for registration/profile creation)
// We might want to rate limit this in production
router.get('/geo-details', async (req: Request, res: Response) => {
    try {
        const place = req.query.place as string;
        if (!place) {
            return res.status(400).json({ message: 'Place parameter is required' });
        }

        const maxRows = req.query.maxRows ? parseInt(req.query.maxRows as string) : 6;
        const result = await geoService.getGeoDetails(place, maxRows);
        if (result.status && result.data) {
            return res.json(result.data);
        } else {
            return res.status(404).json({ message: 'Place not found' });
        }
    } catch (error) {
        console.error('Geo details route error:', error);
        return res.status(500).json({ message: 'Failed to fetch geo details' });
    }
});

// Get Timezone specifically (if needed separately, otherwise geo-details covers it)
// Some frontends might ask for timezone using lat/lon
router.post('/timezone', async (req: Request, res: Response) => {
    // For now, our horoscopeService.getGeoDetails returns timezone. 
    // If we need a dedicated timezone endpoint from lat/lon, we'd need to add it to service.
    // But typically user searches city -> gets lat/lon/timezone in one go.
    return res.status(501).json({ message: 'Not implemented' });
});

export default router;
