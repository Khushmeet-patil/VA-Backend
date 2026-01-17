
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
    addUser
} from '../controllers/adminController';

const router = express.Router();

// Dashboard
router.get('/dashboard', getDashboardStats);

// Users
router.get('/users', getAllUsers);
router.put('/users/:userId', updateUser);
router.get('/users/:userId/activity', getUserActivity);
router.post('/users/:userId/wallet/add', addWalletBalance);
router.post('/users/:userId/wallet/deduct', deductWalletBalance);
router.post('/users', addUser);
router.delete('/users/:userId', deleteUser);

// Astrologers
router.get('/astrologers', getAstrologers);
router.put('/astrologers/bulk', bulkUpdateAstrologers); // Must be before :astrologerId route
router.put('/astrologers/:astrologerId/status', updateAstrologerStatus);
router.put('/astrologers/:astrologerId', updateAstrologer);

// Notifications
router.post('/notifications', createNotification);

export default router;

