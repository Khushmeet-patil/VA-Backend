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

// Mark as read
export const markRead = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;
        const { notificationId, all } = req.body;

        if (all) {
            // Mark all notifications for this user as read
            // This is tricky because some notifications are broadcast ('all', 'users', 'astrologers')
            // and don't have a specific userId. 
            // For now, let's just mark the ones specifically for this user.
            // A better way would be a separate 'NotificationRead' collection to track reads for broadcast messages.
            // But to keep it simple as per current schema:
            await Notification.updateMany(
                { userId: userId, isRead: false },
                { $set: { isRead: true } }
            );
        } else if (notificationId) {
            await Notification.findOneAndUpdate(
                { _id: notificationId, userId: userId },
                { $set: { isRead: true } }
            );
        }

        res.status(200).json({ success: true, message: 'Notifications marked as read' });
    } catch (error) {
        console.error('[NotificationController] MarkRead error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Get unread count
export const getUnreadCount = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;
        const userRole = (req as any).userRole || 'user';

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
            isRead: false,
            $or: audienceFilters
        };

        const count = await Notification.countDocuments(query);

        res.status(200).json({
            success: true,
            unreadCount: count
        });
    } catch (error) {
        console.error('[NotificationController] UnreadCount error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
