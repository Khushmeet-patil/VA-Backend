import { Router, Request, Response } from 'express';
import notificationService from '../services/notificationService';
import User from '../models/User';
import Astrologer from '../models/Astrologer';
import jwt from 'jsonwebtoken';

const router = Router();

/**
 * Middleware to verify JWT token and extract user info
 */
const authenticateToken = async (req: Request, res: Response, next: Function) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, message: 'Access token required' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as {
            id: string;
            role?: string;
        };

        (req as any).userId = decoded.id;
        (req as any).userRole = decoded.role || 'user';
        next();
    } catch (error) {
        return res.status(403).json({ success: false, message: 'Invalid token' });
    }
};

/**
 * POST /api/notifications/register-token
 * Register or update FCM token for the authenticated user/astrologer
 * 
 * Body: { fcmToken: string }
 */
router.post('/register-token', authenticateToken, async (req: Request, res: Response) => {
    try {
        const { fcmToken } = req.body;
        const userId = (req as any).userId;
        const userRole = (req as any).userRole;

        if (!fcmToken) {
            return res.status(400).json({
                success: false,
                message: 'FCM token is required'
            });
        }

        let success = false;

        if (userRole === 'astrologer') {
            // Register token for astrologer
            success = await notificationService.registerAstrologerToken(userId, fcmToken);
        } else {
            // Register token for user
            success = await notificationService.registerUserToken(userId, fcmToken);
        }

        if (success) {
            res.json({
                success: true,
                message: 'FCM token registered successfully'
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Failed to register FCM token'
            });
        }
    } catch (error) {
        console.error('[NotificationRoutes] Register token error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

/**
 * DELETE /api/notifications/unregister-token
 * Remove FCM token for the authenticated user/astrologer (on logout)
 */
router.delete('/unregister-token', authenticateToken, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;
        const userRole = (req as any).userRole;

        if (userRole === 'astrologer') {
            await notificationService.clearAstrologerToken(userId);
        } else {
            await notificationService.clearUserToken(userId);
        }

        res.json({
            success: true,
            message: 'FCM token unregistered successfully'
        });
    } catch (error) {
        console.error('[NotificationRoutes] Unregister token error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

export default router;
