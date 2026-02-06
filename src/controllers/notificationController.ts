import { Request, Response } from 'express';
import Notification from '../models/Notification';

export const getUserNotifications = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;

        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const skip = (page - 1) * limit;

        // Fetch notifications:
        // 1. Audience is 'all'
        // 2. Audience is 'user' and userId matches
        const query = {
            $or: [
                { audience: 'all' },
                { audience: 'user', userId: userId },
                { audience: 'users', userId: userId } // Handling 'users' just in case, treating like 'user'
            ],
            isActive: true
        };

        const notifications = await Notification.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await Notification.countDocuments(query);

        res.status(200).json({
            success: true,
            data: notifications,
            pagination: {
                page,
                limit,
                total,
                hasMore: (skip + notifications.length) < total
            }
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
