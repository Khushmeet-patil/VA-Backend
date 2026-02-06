import { Request, Response } from 'express';
import Notification from '../models/Notification';

export const getUserNotifications = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;

        // Fetch notifications:
        // 1. Audience is 'all'
        // 2. Audience is 'user' and userId matches
        const notifications = await Notification.find({
            $or: [
                { audience: 'all' },
                { audience: 'user', userId: userId },
                { audience: 'users', userId: userId } // Handling 'users' just in case, treating like 'user'
            ],
            isActive: true
        })
            .sort({ createdAt: -1 })
            .limit(50); // Limit to last 50 notifications

        res.status(200).json({
            success: true,
            data: notifications
        });
    } catch (error) {
        console.error('[NotificationController] Fetch error:', error);
        res.status(500).json({ success: false, message: 'Server error', error });
    }
};

// Mark as read (optional, can be added later if needed)
export const markRead = async (req: Request, res: Response) => {
    // Implementation for marking specific notifications as read
};
