
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
    getScheduledNotifications,
    deleteNotification,
    deleteUser,
    addUser,
    adminAddAstrologer,
    getUserReviews,
    deleteReview,
    getUserFollows,
    createBanner,
    getBanners,
    getActiveBanners,
    updateBanner,
    deleteBanner,
    getSkills,
    addSkill,
    updateSkill,
    deleteSkill,
    verifyAstrologer,
    uploadVerificationDocument,
    getAstrologerDetails,
    getAstrologerEarnings,
    getAstrologerWithdrawals,
    getAstrologerChats,
    warnAstrologer,
    getChangeRequests,
    approveChangeRequest,
    rejectChangeRequest
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
router.post('/astrologers', adminAddAstrologer);
router.get('/astrologers', getAstrologers);
router.put('/astrologers/bulk', bulkUpdateAstrologers); // Must be before :astrologerId route
router.put('/astrologers/:astrologerId/status', updateAstrologerStatus);
router.put('/astrologers/:astrologerId', updateAstrologer);
router.put('/astrologers/:astrologerId/verification', verifyAstrologer);
router.post('/astrologers/:astrologerId/verification/upload', uploadVerificationDocument);
router.post('/astrologers/:astrologerId/warn', warnAstrologer); // Add warning route
router.get('/astrologers/:astrologerId', getAstrologerDetails);
router.get('/astrologers/:astrologerId/earnings', getAstrologerEarnings);
router.get('/astrologers/:astrologerId/withdrawals', getAstrologerWithdrawals);
router.get('/astrologers/:astrologerId/chats', getAstrologerChats);

// Reviews
router.delete('/reviews/:reviewId', deleteReview);

// Notifications
router.post('/notifications', createNotification);
router.get('/notifications/scheduled', getScheduledNotifications);
router.delete('/notifications/:id', deleteNotification);

// Banners
router.post('/banners', createBanner);
router.get('/banners', getBanners);
router.get('/banners/active', getActiveBanners);
router.put('/banners/:bannerId', updateBanner);
router.delete('/banners/:bannerId', deleteBanner);

// Skills
router.get('/skills', getSkills);
router.post('/skills', addSkill);
router.put('/skills/:skillId', updateSkill);
router.delete('/skills/:skillId', deleteSkill);

// Settings
import { getAllSettings, updateSetting } from '../controllers/systemSettingController';
router.get('/settings', getAllSettings);
router.put('/settings', updateSetting);

// Change Requests (Astrologer profile edit approval)
router.get('/change-requests', getChangeRequests);
router.put('/change-requests/:id/approve', approveChangeRequest);
router.put('/change-requests/:id/reject', rejectChangeRequest);

export default router;


