
import express from 'express';
import {
    getDashboardStats,
    getAllUsers,
    updateUser,
    getUserActivity,
    getAstrologers,
    updateAstrologerStatus,
    updateAstrologer,
    bulkUpdateAstrologers,
    createNotification
} from '../controllers/adminController';

const router = express.Router();

// Dashboard
router.get('/dashboard', getDashboardStats);

// Users
router.get('/users', getAllUsers);
router.put('/users/:userId', updateUser);
router.get('/users/:userId/activity', getUserActivity);

// Astrologers
router.get('/astrologers', getAstrologers);
router.put('/astrologers/bulk', bulkUpdateAstrologers); // Must be before :astrologerId route
router.put('/astrologers/:astrologerId/status', updateAstrologerStatus);
router.put('/astrologers/:astrologerId', updateAstrologer);

// Notifications
router.post('/notifications', createNotification);

export default router;

