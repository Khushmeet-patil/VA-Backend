import { Request, Response } from 'express';
import Notification from '../models/Notification';

export const getUserNotifications = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;
        const userRole = (req as any).userRole || 'user'; // Default to user if not set

        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const skip = (page - 1) * limit;

        // Fetch notifications logic:
        // 1. 'all': Broadcast to everyone
        // 2. 'user': Specific to this user (matches userId)
        // 3. 'users': Broadcast to all users (if requester is user)
        // 4. 'astrologers': Broadcast to all astrologers (if requester is astrologer)

        const audienceFilters = [
            { audience: 'all' },
            { audience: 'user', userId: userId }
        ];

        if (userRole === 'astrologer') {
            audienceFilters.push({ audience: 'astrologers' } as any);
        } else {
            audienceFilters.push({ audience: 'users' } as any);
        }

        const query = {
            isActive: true,
            $or: audienceFilters
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
