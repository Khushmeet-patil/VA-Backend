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

                let shouldBeOnline = false;
                let startTime = '';
                let endTime = '';

                if (todaySchedule && todaySchedule.enabled) {
                    startTime = todaySchedule.startTime;
                    endTime = todaySchedule.endTime;
                    // Check if current time is within the range
                    shouldBeOnline = currentTime >= startTime && currentTime < endTime;
                }

                if (shouldBeOnline) {
                    if (astro.isOnline) {
                        // Astrologer is already online, which matches the schedule!
                        // They might have turned on manually early. Since the state aligns with the schedule,
                        // we can clear the manual override flag so the NEXT schedule boundary acts automatically.
                        if (astro.isManualOverride) {
                            astro.isManualOverride = false;
                            await astro.save();
                            console.log(`[Scheduler] ${astro.firstName} state matches schedule -> cleared manual override.`);
                        }
                    } else {
                        // Astrologer is offline, but the schedule says they should be online.
                        if (astro.isManualOverride) {
                            // Astrologer manually turned offline! Respect their choice, skip turning them on.
                            console.log(`[Scheduler] Skipping ONLINE for ${astro.firstName} (Manual Override Active)`);
                        } else {
                            // No manual override, apply the schedule!
                            astro.isOnline = true;
                            await astro.save();
                            console.log(`[Scheduler] Set ${astro.firstName} ${astro.lastName} to ONLINE (Time: ${currentTime}, Schedule: ${startTime}-${endTime})`);

                            // Send notification to all users
                            try {
                                const firstName = astro.firstName.charAt(0).toUpperCase() + astro.firstName.slice(1);
                                const lastName = astro.lastName.charAt(0).toUpperCase() + astro.lastName.slice(1);

                                await notificationService.broadcast('users', {
                                    title: 'Astrologer Online!',
                                    body: `${firstName} ${lastName} is now available for consultation.`
                                }, {
                                    type: 'astrologer_online',
                                    astrologerId: astro._id.toString()
                                });
                            } catch (notifyError) {
                                console.error(`[Scheduler] Failed to send notification for ${astro.firstName}:`, notifyError);
                            }
                        }
                    }
                } else {
                    // Schedule says they should be offline
                    if (!astro.isOnline) {
                        // Astrologer is offline, which matches the schedule!
                        if (astro.isManualOverride) {
                            astro.isManualOverride = false;
                            await astro.save();
                            console.log(`[Scheduler] ${astro.firstName} state matches schedule -> cleared manual override.`);
                        }
                    } else {
                        // Astrologer is online, but the schedule says they should be offline.
                        if (astro.isManualOverride) {
                            // Astrologer manually turned online out of schedule! Respect their choice.
                            console.log(`[Scheduler] Skipping OFFLINE for ${astro.firstName} (Manual Override Active)`);
                        } else {
                            // No manual override, apply the schedule!
                            if (!astro.isBusy) {
                                astro.isOnline = false;
                                await astro.save();
                                console.log(`[Scheduler] Set ${astro.firstName} ${astro.lastName} to OFFLINE`);
                            } else {
                                console.log(`[Scheduler] Skipping OFFLINE for ${astro.firstName} ${astro.lastName} (Currently BUSY)`);
                            }
                        }
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
        console.log('[Scheduler] Running daily reset for free chat counts & manual overrides...');
        try {
            const result = await Astrologer.updateMany(
                {},
                { $set: { freeChatsToday: 0, isManualOverride: false } }
            );
            console.log(`[Scheduler] Reset freeChatsToday & isManualOverride for ${result.modifiedCount} astrologers.`);
        } catch (error) {
            console.error('[Scheduler] Error in daily reset:', error);
        }
    }, {
        timezone: "Asia/Kolkata"
    });
};
