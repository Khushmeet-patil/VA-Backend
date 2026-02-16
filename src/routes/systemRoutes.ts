
import express from 'express';
import { getSettingByKey } from '../controllers/systemSettingController';

const router = express.Router();

// Public route to get system settings like social media links
router.get('/settings/:key', getSettingByKey);

export default router;
