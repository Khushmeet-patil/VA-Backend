
import express from 'express';
import { getSettingByKey } from '../controllers/systemSettingController';
import { getActiveBanners, getActiveStartPopups } from '../controllers/adminController';

const router = express.Router();

// Public route to get system settings like social media links
router.get('/settings/:key', getSettingByKey);

// Public route to get active banners (for mobile app / website)
router.get('/banners/active', getActiveBanners);

// Public route to get active start pop-ups
router.get('/start-popups/active', getActiveStartPopups);

export default router;
