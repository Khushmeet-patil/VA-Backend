import cron from 'node-cron';
import Astrologer from '../models/Astrologer';
import { notificationService } from './notificationService';

// Run every minute
const scheduleAutoOnline = () => {
    cron.schedule('* * * * *', async () => {
        console.log('[Scheduler] Running auto-online check...');
        const now = new Date();
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const currentDay = days[now.getDay()];

        // Format current time as "HH:mm"
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const currentTime = `${hours}:${minutes}`;

        try {
            // Find astrologers who have auto-online enabled
            const astrologers = await Astrologer.find({
                isAutoOnlineEnabled: true,
                isVerified: true,
                isBlocked: false
            });

            for (const astro of astrologers) {
                // Find today's schedule
                const todaySchedule = astro.availabilitySchedule.find(s => s.day === currentDay);

                if (todaySchedule && todaySchedule.enabled) {
                    const { startTime, endTime } = todaySchedule;

                    // Check if current time is within the range
                    const shouldBeOnline = currentTime >= startTime && currentTime < endTime;

                    if (shouldBeOnline && !astro.isOnline) {
                        // Should be online but is currently offline -> Turn ON
                        astro.isOnline = true;
                        await astro.save();
                        console.log(`[Scheduler] Set ${astro.firstName} ${astro.lastName} to ONLINE (Time: ${currentTime}, Schedule: ${startTime}-${endTime})`);

                        // Send notification to all users
                        try {
                            // Ensure first letter of names is capitalized for notification
                            const firstName = astro.firstName.charAt(0).toUpperCase() + astro.firstName.slice(1);
                            const lastName = astro.lastName.charAt(0).toUpperCase() + astro.lastName.slice(1);

                            await notificationService.broadcast('users', {
                                title: 'Astrologer Online!',
                                body: `${firstName} ${lastName} is now available for consultation.`
                            }, {
                                type: 'astrologer_online',
                                astrologerId: astro._id.toString()
                            });
                            console.log(`[Scheduler] Notification sent for ${firstName}`);
                        } catch (notifyError) {
                            console.error(`[Scheduler] Failed to send notification for ${astro.firstName}:`, notifyError);
                        }

                    } else if (!shouldBeOnline && astro.isOnline) {
                        // Should be offline but is currently online -> Turn OFF
                        if (!astro.isBusy) {
                            astro.isOnline = false;
                            await astro.save();
                            console.log(`[Scheduler] Set ${astro.firstName} ${astro.lastName} to OFFLINE (Time: ${currentTime}, Schedule: ${startTime}-${endTime})`);
                        } else {
                            console.log(`[Scheduler] Skipping OFFLINE for ${astro.firstName} ${astro.lastName} (Currently BUSY)`);
                        }
                    }
                } else {
                    // No schedule for today or disabled for today
                    if (astro.isOnline && !astro.isBusy) {
                        astro.isOnline = false;
                        await astro.save();
                        console.log(`[Scheduler] Set ${astro.firstName} ${astro.lastName} to OFFLINE (No schedule for ${currentDay})`);
                    }
                }
            }
        } catch (error) {
            console.error('[Scheduler] Error in auto-online check:', error);
        }
    });
};

export default scheduleAutoOnline;

// Run every day at midnight (IST)
// Server time might be UTC, so we should check timezone or use specific hour
// Assuming server is UTC, IST midnight is 18:30 UTC previous day.
// But simpler to run at 00:00 system time and assume system is configured or just use node-cron timezone if available.
// Let's run at 00:00 and log it.
export const scheduleDailyReset = () => {
    cron.schedule('0 0 * * *', async () => {
        console.log('[Scheduler] Running daily reset for free chat counts...');
        try {
            const result = await Astrologer.updateMany(
                {},
                { $set: { freeChatsToday: 0 } }
            );
            console.log(`[Scheduler] Reset freeChatsToday for ${result.modifiedCount} astrologers.`);
        } catch (error) {
            console.error('[Scheduler] Error in daily reset:', error);
        }
    }, {
        timezone: "Asia/Kolkata"
    });
};
