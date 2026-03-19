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
                let shouldBeOnline = false;

                if (todaySchedule && todaySchedule.enabled) {
                    const startMins = parseInt(todaySchedule.startTime.split(':')[0]) * 60 + parseInt(todaySchedule.startTime.split(':')[1]);
                    const endMins = parseInt(todaySchedule.endTime.split(':')[0]) * 60 + parseInt(todaySchedule.endTime.split(':')[1]);
                    const currentMins = parseInt(hours) * 60 + parseInt(minutes);
                    
                    shouldBeOnline = currentMins >= startMins && currentMins < endMins;
                }

                const expectedState = shouldBeOnline ? 'online' : 'offline';

                if ((astro as any).expectedScheduleState !== expectedState) {
                    // BOUNDARY HAS BEEN CROSSED (whether exactly on time or delayed)
                    // Absolute force override!
                    astro.isOnline = shouldBeOnline;
                    astro.isManualOverride = false;
                    (astro as any).expectedScheduleState = expectedState;
                    await astro.save();
                    
                    console.log(`[Scheduler] Boundary CROSSED to ${expectedState.toUpperCase()} for ${astro.firstName}`);
                    io.to(`astrologer:${astro._id.toString()}`).emit('ASTROLOGER_STATUS_UPDATED', { isOnline: shouldBeOnline });

                    if (shouldBeOnline) {
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
                } else {
                    // We are maintaining the current state block. Respect manual overrides!
                    if (shouldBeOnline) {
                        if (!astro.isOnline && !astro.isManualOverride) {
                            astro.isOnline = true;
                            await astro.save();
                            io.to(`astrologer:${astro._id.toString()}`).emit('ASTROLOGER_STATUS_UPDATED', { isOnline: true });
                            console.log(`[Scheduler] Enforcing ONLINE block for ${astro.firstName}.`);
                        } else if (astro.isOnline && astro.isManualOverride) {
                            astro.isManualOverride = false;
                            await astro.save();
                        }
                    } else {
                        if (astro.isOnline && !astro.isManualOverride) {
                            astro.isOnline = false;
                            await astro.save();
                            io.to(`astrologer:${astro._id.toString()}`).emit('ASTROLOGER_STATUS_UPDATED', { isOnline: false });
                            console.log(`[Scheduler] Enforcing OFFLINE out-of-block for ${astro.firstName}.`);
                        } else if (!astro.isOnline && astro.isManualOverride) {
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
