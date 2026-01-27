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

export default router;
