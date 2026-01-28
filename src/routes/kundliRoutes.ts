import express from 'express';
import { authMiddleware } from '../middleware/auth';
import kundliController from '../controllers/kundliController';

const router = express.Router();

// Protected routes for Kundli-related data
router.post('/birth-details', authMiddleware, kundliController.getBirthDetails);
router.post('/manglik', authMiddleware, kundliController.getManglik);
router.post('/panchang', authMiddleware, kundliController.getBasicPanchang);
router.post('/astro-details', authMiddleware, kundliController.getAstroDetails);
router.post('/planets', authMiddleware, kundliController.getPlanets);
router.post('/horo-chart/:chartId', authMiddleware, kundliController.getChartImage);
router.post('/horo-chart-data/:chartId', authMiddleware, kundliController.getHoroChartData);
router.post('/kp-planets', authMiddleware, kundliController.getKpPlanets);
router.post('/kp-house-cusps', authMiddleware, kundliController.getKpHouseCusps);
router.post('/cusp-chart', authMiddleware, kundliController.getCuspChart);
router.post('/sarvashtak', authMiddleware, kundliController.getSarvashtak);
router.post('/planet-ashtak/:planetName', authMiddleware, kundliController.getPlanetAshtak);

export default router;
