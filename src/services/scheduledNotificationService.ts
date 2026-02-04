import cron from 'node-cron';
import Notification from '../models/Notification';
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

            for (const notification of activeSchedules) {
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

                    await notificationService.broadcast(
                        latest.audience as any,
                        { title: latest.title, body: latest.message },
                        {
                            navigateType: latest.navigateType || 'none',
                            navigateTarget: latest.navigateTarget || ''
                        }
                    );
                    console.log(`[ScheduledNotificationService] Broadcast completed for ${latest._id}`);
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
