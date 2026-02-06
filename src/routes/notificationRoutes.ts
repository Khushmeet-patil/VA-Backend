import { Router, Request, Response } from 'express';
import notificationService from '../services/notificationService';
import * as notificationController from '../controllers/notificationController';
import User from '../models/User';
import Astrologer from '../models/Astrologer';
import jwt from 'jsonwebtoken';

const router = Router();

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
 * GET /api/notifications
 * Fetch notifications for the authenticated user
 */
router.get('/', authenticateToken, notificationController.getUserNotifications);

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

/**
 * POST /api/notifications/test-call/:id
 * Admin test route to trigger a high-priority ring on a specific astrologer's device
 */
router.post('/test-call/:id', authenticateToken, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userRole = (req as any).userRole;

        // Security: In production, you might want to restrict this more
        // if (userRole !== 'admin') return res.status(403).json({ success: false, message: 'Unauthorized' });

        const success = await notificationService.sendHighPriorityChatRequest(id, {
            sessionId: 'test-session-' + Date.now(),
            userId: 'test-user-id',
            userName: 'TEST USER',
            ratePerMinute: 0,
            intakeDetails: { note: 'This is a system test' }
        });

        if (success) {
            res.json({ success: true, message: 'Test call sent successfully' });
        } else {
            res.status(500).json({ success: false, message: 'Failed to send test call. Check if astrologer has valid FCM token.' });
        }
    } catch (error) {
        console.error('[NotificationRoutes] Test call error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

/**
 * POST /api/notifications/test-broadcast
 * Admin test route to send a notification to ALL users
 */
router.post('/test-broadcast', authenticateToken, async (req: Request, res: Response) => {
    try {
        const { title, body } = req.body;

        const result = await notificationService.broadcast('all', {
            title: title || 'Test Broadcast',
            body: body || 'This is a test notification from the admin system'
        });

        res.json({ success: true, message: 'Broadcast completed', result });
    } catch (error) {
        console.error('[NotificationRoutes] Test broadcast error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

export default router;
