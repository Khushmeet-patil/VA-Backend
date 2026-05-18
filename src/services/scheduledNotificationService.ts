import cron from 'node-cron';
import Notification from '../models/Notification';
import User from '../models/User';
import notificationService from './notificationService';

class ScheduledNotificationService {
    private activeJobs: Map<string, any> = new Map();

    /**
     * Initialize all active scheduled notifications on server start
     */
    async initialize() {
        console.log(`[ScheduledNotificationService] Initializing scheduled jobs. Server local time: ${new Date().toString()}`);
        try {
            const activeSchedules = await Notification.find({
                isScheduled: true,
                isActive: true
            });

            console.log(`[ScheduledNotificationService] Found ${activeSchedules.length} active schedules`);

            const dFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
            const todayStr = dFormat.format(new Date());

            for (const notification of activeSchedules) {
                // If it has expired, disable it and don't schedule
                if (notification.endDate) {
                    const endStr = dFormat.format(new Date(notification.endDate));
                    if (todayStr > endStr) {
                        console.log(`[ScheduledNotificationService] Job ${notification._id} has expired (today ${todayStr} > end ${endStr}) on initialization. Disabling.`);
                        notification.isActive = false;
                        await notification.save();
                        continue;
                    }
                }

                this.scheduleJob(notification);
            }
        } catch (error) {
            console.error('[ScheduledNotificationService] Initialization error:', error);
        }
    }

    /**
     * Schedule a new or updated notification
     */
    scheduleJob(notification: any) {
        if (!notification.isScheduled || !notification.scheduledTime) return;

        // Cancel existing job if any
        this.cancelJob(notification._id.toString());

        // Check if expired before scheduling
        if (notification.endDate) {
            const dFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
            const todayStr = dFormat.format(new Date());
            const endStr = dFormat.format(new Date(notification.endDate));
            if (todayStr > endStr) {
                console.log(`[ScheduledNotificationService] Attempted to schedule expired job ${notification._id}. Disabling.`);
                notification.isActive = false;
                notification.save().catch((err: any) => console.error('[ScheduledNotificationService] Error saving inactive state:', err));
                return;
            }
        }

        try {
            const [hours, minutes] = notification.scheduledTime.split(':');
            // Cron format: minute hour dayOfMonth month dayOfWeek
            // Daily at HH:mm -> "mm HH * * *"
            const cronExpression = `${minutes} ${hours} * * *`;

            const job = cron.schedule(cronExpression, async () => {
                console.log(`[ScheduledNotificationService] Executing daily job: ${notification.title} (${notification._id})`);

                try {
                    // Fetch latest to check if still active
                    const latest = await Notification.findById(notification._id);
                    if (!latest || !latest.isActive) {
                        console.log(`[ScheduledNotificationService] Job ${notification._id} is no longer active, skipping.`);
                        this.cancelJob(notification._id.toString());
                        return;
                    }

                    const dFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
                    const todayStr = dFormat.format(new Date());

                    // Check Start Date
                    if (latest.startDate) {
                        const startStr = dFormat.format(new Date(latest.startDate));
                        if (todayStr < startStr) {
                            console.log(`[ScheduledNotificationService] Job ${notification._id} is not yet active (today ${todayStr} < start ${startStr}), skipping execution.`);
                            return;
                        }
                    }

                    // Check End Date
                    if (latest.endDate) {
                        const endStr = dFormat.format(new Date(latest.endDate));
                        if (todayStr > endStr) {
                            console.log(`[ScheduledNotificationService] Job ${notification._id} has expired (today ${todayStr} > end ${endStr}), disabling.`);
                            latest.isActive = false;
                            await latest.save();
                            this.cancelJob(notification._id.toString());
                            return;
                        }
                    }

                    // 1. Send Push Notification
                    if (latest.audience === 'user' && latest.userId) {
                        const targetUser = await User.findById(latest.userId);
                        if (targetUser) {
                            const notifPayload = { title: latest.title, body: latest.message, imageUrl: latest.imageUrl };
                            const notifData = {
                                navigateType: latest.navigateType || 'none',
                                navigateTarget: latest.navigateTarget || ''
                            };

                            if (targetUser.role === 'astrologer') {
                                await notificationService.sendToAstrologer(latest.userId.toString(), notifPayload, notifData);
                            } else {
                                await notificationService.sendToUser(latest.userId.toString(), notifPayload, notifData);
                            }
                        } else {
                            console.log(`[ScheduledNotificationService] Targeted user ${latest.userId} not found`);
                        }
                    } else {
                        await notificationService.broadcast(
                            latest.audience as any,
                            { title: latest.title, body: latest.message, imageUrl: latest.imageUrl },
                            {
                                navigateType: latest.navigateType || 'none',
                                navigateTarget: latest.navigateTarget || ''
                            }
                        );
                    }

                    // 2. Save a record to DB so it appears in App Notification History
                    // This instance is NOT scheduled, it's a delivered record
                    await Notification.create({
                        title: latest.title,
                        message: latest.message,
                        type: latest.type || 'info',
                        audience: latest.audience,
                        userId: latest.audience === 'user' ? latest.userId : undefined,
                        imageUrl: latest.imageUrl,
                        isActive: true,
                        isScheduled: false, // Delivered instance
                        navigateType: latest.navigateType || 'none',
                        navigateTarget: latest.navigateTarget || '',
                        deliveredAt: new Date()
                    });

                    console.log(`[ScheduledNotificationService] Single user / broadcast notification and DB record completed for ${latest._id}`);
                } catch (err) {
                    console.error(`[ScheduledNotificationService] Execution failed for ${notification._id}:`, err);
                }
            }, {
                timezone: "Asia/Kolkata"
            });

            this.activeJobs.set(notification._id.toString(), job);
            console.log(`[ScheduledNotificationService] Scheduled: "${notification.title}" for ${notification.scheduledTime} DAILY`);
        } catch (error) {
            console.error(`[ScheduledNotificationService] Failed to schedule ${notification._id}:`, error);
        }
    }

    /**
     * Cancel an active job
     */
    cancelJob(notificationId: string) {
        const job = this.activeJobs.get(notificationId);
        if (job) {
            job.stop();
            this.activeJobs.delete(notificationId);
            console.log(`[ScheduledNotificationService] Cancelled job: ${notificationId}`);
        }
    }
}

export const scheduledNotificationService = new ScheduledNotificationService();
export default scheduledNotificationService;
