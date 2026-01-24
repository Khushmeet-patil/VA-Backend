import express from 'express';
import * as horoscopeController from '../controllers/horoscopeController';

const router = express.Router();

router.post('/rashi', horoscopeController.getRashi);
router.post('/daily', horoscopeController.getDailyPrediction);
router.post('/numero', horoscopeController.getNumeroPrediction);
router.post('/panchang', horoscopeController.getLuckyTime);
router.post('/monthly', horoscopeController.getMonthlyPrediction);
router.post('/yearly', horoscopeController.getYearlyPrediction);
router.get('/remedies/:sign', horoscopeController.getRemedies);

export default router;
