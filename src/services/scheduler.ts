import cron from 'node-cron';
import Astrologer from '../models/Astrologer';

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
                    // Simple string comparison works for "HH:mm" format 24h
                    const shouldBeOnline = currentTime >= startTime && currentTime < endTime;

                    if (shouldBeOnline && !astro.isOnline) {
                        // Should be online but is currently offline -> Turn ON
                        astro.isOnline = true;
                        await astro.save();
                        console.log(`[Scheduler] Set ${astro.firstName} ${astro.lastName} to ONLINE (Time: ${currentTime}, Schedule: ${startTime}-${endTime})`);
                    } else if (!shouldBeOnline && astro.isOnline) {
                        // Should be offline but is currently online -> Turn OFF
                        // OPTIONAL: Check if they are busy? If busy, maybe don't force offline immediately?
                        // For now, let's simplisticly turn them offline. 
                        // If they are in height of a chat, keeping them 'online' in DB might not affect active chat, 
                        // but it prevents new chats.
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
                        // Default to offline if auto-online is enabled but no schedule matches?
                        // Or should we leave them alone?
                        // "Auto-Online" implies strict adherence to schedule. So if no schedule enabled for today, go offline.
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
