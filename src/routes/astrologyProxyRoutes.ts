import express, { Request, Response } from 'express';
import geoService from '../services/geoService';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();

// LEGACY ROUTE: Called by old APK versions. Uses Astrology API.
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

// V2 ROUTE: Called by new APK versions. Uses Google Places Autocomplete.
router.get('/geo-details-v2', async (req: Request, res: Response) => {
    try {
        const place = req.query.place as string;
        if (!place) {
            return res.status(400).json({ message: 'Place parameter is required' });
        }

        const maxRows = req.query.maxRows ? parseInt(req.query.maxRows as string) : 6;
        const result = await geoService.getGeoDetailsGoogle(place, maxRows);
        if (result.status && result.data) {
            return res.json(result.data);
        } else {
            return res.status(404).json({ message: 'Place not found' });
        }
    } catch (error) {
        console.error('Geo details v2 route error:', error);
        return res.status(500).json({ message: 'Failed to fetch geo details v2' });
    }
});

// V2 ROUTE: Resolves Place ID to Coordinates (lat/lon) when selected from autocomplete list.
router.get('/place-details-v2', async (req: Request, res: Response) => {
    try {
        const placeId = req.query.placeId as string;
        const placeName = req.query.placeName as string;

        if (!placeId) {
            return res.status(400).json({ message: 'placeId parameter is required' });
        }

        const result = await geoService.getPlaceDetailsGoogle(placeId, placeName);
        if (result) {
            return res.json(result);
        } else {
            return res.status(404).json({ message: 'Place details not found' });
        }
    } catch (error) {
        console.error('Place details v2 route error:', error);
        return res.status(500).json({ message: 'Failed to fetch place details' });
    }
});

// Get Timezone specifically (if needed separately, otherwise geo-details covers it)
router.post('/timezone', async (req: Request, res: Response) => {
    return res.status(501).json({ message: 'Not implemented' });
});

export default router;
