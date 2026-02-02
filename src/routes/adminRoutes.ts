
import express from 'express';
import {
    getDashboardStats,
    getAllUsers,
    updateUser,
    getUserActivity,
    addWalletBalance,
    deductWalletBalance,
    getAstrologers,
    updateAstrologerStatus,
    updateAstrologer,
    bulkUpdateAstrologers,
    createNotification,
    deleteUser,
    addUser,
    getUserReviews,
    deleteReview,
    getUserFollows,
    createBanner,
    getBanners,
    getActiveBanners,
    updateBanner,
    deleteBanner
} from '../controllers/adminController';

const router = express.Router();

// Dashboard
router.get('/dashboard', getDashboardStats);

// Users
router.get('/users', getAllUsers);
router.put('/users/:userId', updateUser);
router.get('/users/:userId/activity', getUserActivity);
router.get('/users/:userId/reviews', getUserReviews);
router.get('/users/:userId/follows', getUserFollows);
router.post('/users/:userId/wallet/add', addWalletBalance);
router.post('/users/:userId/wallet/deduct', deductWalletBalance);
router.post('/users', addUser);
router.delete('/users/:userId', deleteUser);

// Astrologers
router.get('/astrologers', getAstrologers);
router.put('/astrologers/bulk', bulkUpdateAstrologers); // Must be before :astrologerId route
router.put('/astrologers/:astrologerId/status', updateAstrologerStatus);
router.put('/astrologers/:astrologerId', updateAstrologer);

// Reviews
router.delete('/reviews/:reviewId', deleteReview);

// Notifications
router.post('/notifications', createNotification);

// Banners
router.post('/banners', createBanner);
router.get('/banners', getBanners);
router.get('/banners/active', getActiveBanners);
router.put('/banners/:bannerId', updateBanner);
router.delete('/banners/:bannerId', deleteBanner);

// Settings
import { getAllSettings, updateSetting } from '../controllers/systemSettingController';
router.get('/settings', getAllSettings);
router.put('/settings', updateSetting);

export default router;


