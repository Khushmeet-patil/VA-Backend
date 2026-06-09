
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

// Public route to get active advertisements (marquee)
// This is bridged from the store module
const { getActiveAdvertisements } = require('../store/controllers/advertisement.controller');
router.get('/advertisements/active', getActiveAdvertisements);

import { authMiddleware } from '../middleware/auth';

// Authenticated route to get Zego config (for voice/video calling)
router.get('/zego-config', authMiddleware, (req, res) => {
    const appId = Number(process.env.ZEGO_APP_ID || 987654321);
    const appSign = process.env.ZEGO_APP_SIGN || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    res.json({
        success: true,
        appId,
        appSign
    });
});

export default router;
