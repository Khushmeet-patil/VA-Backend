import cron from 'node-cron';
import Astrologer from '../models/Astrologer';
import { notificationService } from './notificationService';
import { io } from '../index';

// Run every minute
const scheduleAutoOnline = () => {
    cron.schedule('* * * * *', async () => {
        console.log('[Scheduler] Running auto-online check...');
        const nowUTC = new Date();
        const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
        const now = new Date(nowUTC.getTime() + istOffset);

        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        // Use getUTCDay() since we added the offset manually to the timestamp, so the "UTC" methods will return the IST values
        const currentDay = days[now.getUTCDay()];

        // Format current time as "HH:mm" in IST
        const hours = now.getUTCHours().toString().padStart(2, '0');
        const minutes = now.getUTCMinutes().toString().padStart(2, '0');
        const currentTime = `${hours}:${minutes}`;

        console.log(`[Scheduler] Current IST time: ${currentDay} ${currentTime}`);

        try {
            // Find approved, non-blocked astrologers who have auto-online enabled
            // Note: isVerified is for KYC/payment only - NOT for scheduling eligibility
            const astrologers = await Astrologer.find({
                isAutoOnlineEnabled: true,
                status: 'approved',
                isBlocked: { $ne: true }
            });

            for (const astro of astrologers) {
                const todaySchedule = astro.availabilitySchedule.find(s => s.day === currentDay);
                let handled = false;

                if (todaySchedule && todaySchedule.enabled) {
                    const { startTime, endTime } = todaySchedule;

                    if (currentTime === startTime) {
                        // Boundary: Start of schedule. Enforce ONLINE.
                        astro.isOnline = true;
                        astro.isManualOverride = false;
                        await astro.save();
                        console.log(`[Scheduler] Boundary START for ${astro.firstName}. Set ONLINE.`);
                        io.to(`astrologer:${astro._id.toString()}`).emit('ASTROLOGER_STATUS_UPDATED', { isOnline: true });
                        
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
                        handled = true;
                    } 
                    else if (currentTime === endTime) {
                        // Boundary: End of schedule. Enforce OFFLINE immediately regardless of busy state.
                        astro.isOnline = false;
                        astro.isManualOverride = false;
                        await astro.save();
                        console.log(`[Scheduler] Boundary END for ${astro.firstName}. Set OFFLINE.`);
                        io.to(`astrologer:${astro._id.toString()}`).emit('ASTROLOGER_STATUS_UPDATED', { isOnline: false });
                        handled = true;
                    }
                    else if (currentTime > startTime && currentTime < endTime) {
                        // Mid-schedule block
                        if (!astro.isOnline) {
                            if (!astro.isManualOverride) {
                                astro.isOnline = true;
                                await astro.save();
                                console.log(`[Scheduler] Enforcing ONLINE block for ${astro.firstName}.`);
                                io.to(`astrologer:${astro._id.toString()}`).emit('ASTROLOGER_STATUS_UPDATED', { isOnline: true });
                            }
                        } else {
                            // Already online, clear override if true to reset clean state
                            if (astro.isManualOverride) {
                                astro.isManualOverride = false;
                                await astro.save();
                            }
                        }
                        handled = true;
                    }
                }

                if (!handled) {
                    // Outside schedule hours
                    if (astro.isOnline) {
                        if (!astro.isManualOverride) {
                            astro.isOnline = false;
                            await astro.save();
                            console.log(`[Scheduler] Enforcing OFFLINE out-of-block for ${astro.firstName}.`);
                            io.to(`astrologer:${astro._id.toString()}`).emit('ASTROLOGER_STATUS_UPDATED', { isOnline: false });
                        }
                    } else {
                        // Already offline, clear override if true to reset clean state
                        if (astro.isManualOverride) {
                            astro.isManualOverride = false;
                            await astro.save();
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
