import cron from 'node-cron';
import Astrologer from '../models/Astrologer';
import { notificationService } from './notificationService';

// We need io but it's created AFTER this module loads in index.ts.
// So we store a reference that gets set later.
let ioInstance: any = null;

export function setIOInstance(io: any) {
    ioInstance = io;
    console.log('[Scheduler] Socket.IO instance registered.');
}

export function getIOInstance() {
    return ioInstance;
}


// Run every minute
const scheduleAutoOnline = () => {
    cron.schedule('* * * * *', async () => {
        const nowUTC = new Date();
        const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
        const now = new Date(nowUTC.getTime() + istOffset);

        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const currentDay = days[now.getUTCDay()];

        const hours = now.getUTCHours().toString().padStart(2, '0');
        const minutes = now.getUTCMinutes().toString().padStart(2, '0');
        const currentTime = `${hours}:${minutes}`;
        const currentMins = parseInt(hours) * 60 + parseInt(minutes);

        console.log(`[Scheduler] Tick: ${currentDay} ${currentTime} (${currentMins} mins) | IO ready: ${!!ioInstance}`);

        try {
            const astrologers = await Astrologer.find({
                isAutoOnlineEnabled: true,
                status: 'approved',
                isBlocked: { $ne: true }
            });

            console.log(`[Scheduler] Found ${astrologers.length} auto-online astrologers`);

            for (const astro of astrologers) {
                const todaySchedule = astro.availabilitySchedule.find(s => s.day === currentDay);
                let shouldBeOnline = false;
                let scheduleInfo = 'No schedule today';

                if (todaySchedule && todaySchedule.enabled) {
                    const startMins = parseInt(todaySchedule.startTime.split(':')[0]) * 60 + parseInt(todaySchedule.startTime.split(':')[1]);
                    const endMins = parseInt(todaySchedule.endTime.split(':')[0]) * 60 + parseInt(todaySchedule.endTime.split(':')[1]);
                    shouldBeOnline = currentMins >= startMins && currentMins < endMins;
                    scheduleInfo = `${todaySchedule.startTime}-${todaySchedule.endTime} (${startMins}-${endMins} mins), current=${currentMins}, shouldBeOnline=${shouldBeOnline}`;
                }

                const currentExpected = (astro as any).expectedScheduleState || 'none';
                const newExpected = shouldBeOnline ? 'online' : 'offline';

                console.log(`[Scheduler] ${astro.firstName}: isOnline=${astro.isOnline}, manualOverride=${astro.isManualOverride}, expectedState=${currentExpected}, newExpected=${newExpected}, schedule=${scheduleInfo}`);

                // CASE 1: Boundary crossing — expectedScheduleState changed
                if (currentExpected !== newExpected) {
                    // Only force-set if NOT manually overridden
                    // If manual override is active, just update expectedScheduleState for tracking
                    if (astro.isManualOverride) {
                        console.log(`[Scheduler] >>> BOUNDARY CROSSED for ${astro.firstName}: ${currentExpected} -> ${newExpected}. Manual override active, clearing override but respecting current state.`);
                        astro.isManualOverride = false;
                        (astro as any).expectedScheduleState = newExpected;
                        await astro.save();
                    } else {
                        console.log(`[Scheduler] >>> BOUNDARY CROSSED for ${astro.firstName}: ${currentExpected} -> ${newExpected}. Setting isOnline=${shouldBeOnline}`);
                        astro.isOnline = shouldBeOnline;
                        astro.isManualOverride = false;
                        (astro as any).expectedScheduleState = newExpected;
                        await astro.save();
                        console.log(`[Scheduler] >>> SAVED ${astro.firstName}: isOnline=${astro.isOnline}`);

                        // Emit socket event
                        if (ioInstance) {
                            const room = `astrologer:${astro._id.toString()}`;
                            ioInstance.to(room).emit('ASTROLOGER_STATUS_UPDATED', { isOnline: shouldBeOnline });
                            console.log(`[Scheduler] >>> Emitted ASTROLOGER_STATUS_UPDATED to room ${room}`);
                        } else {
                            console.warn(`[Scheduler] >>> IO instance not available, cannot emit socket event!`);
                        }

                        // Send notification to users when astrologer goes online
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
                                console.error(`[Scheduler] Failed to send notification:`, notifyError);
                            }
                        }
                    }
                }
                // CASE 2: Same expected state, but actual status doesn't match (manual override handling)
                else if (shouldBeOnline && !astro.isOnline && !astro.isManualOverride) {
                    console.log(`[Scheduler] Enforcing ONLINE for ${astro.firstName} (override cleared, schedule active)`);
                    astro.isOnline = true;
                    await astro.save();
                    if (ioInstance) {
                        ioInstance.to(`astrologer:${astro._id.toString()}`).emit('ASTROLOGER_STATUS_UPDATED', { isOnline: true });
                    }
                }
                else if (!shouldBeOnline && astro.isOnline && !astro.isManualOverride) {
                    console.log(`[Scheduler] Enforcing OFFLINE for ${astro.firstName} (override cleared, outside schedule)`);
                    astro.isOnline = false;
                    await astro.save();
                    if (ioInstance) {
                        ioInstance.to(`astrologer:${astro._id.toString()}`).emit('ASTROLOGER_STATUS_UPDATED', { isOnline: false });
                    }
                }
                // CASE 3: State matches schedule, clear stale manual override
                else if (astro.isManualOverride && astro.isOnline === shouldBeOnline) {
                    console.log(`[Scheduler] Clearing stale manual override for ${astro.firstName}`);
                    astro.isManualOverride = false;
                    await astro.save();
                }
                else {
                    // Everything is in sync, nothing to do
                }
            }
        } catch (error) {
            console.error('[Scheduler] Error in auto-online check:', error);
        }
    });
};

export default scheduleAutoOnline;

export const scheduleDailyReset = () => {
    cron.schedule('0 0 * * *', async () => {
        console.log('[Scheduler] Running daily reset for free chat counts & manual overrides...');
        try {
            const result = await Astrologer.updateMany(
                {},
                { $set: { freeChatsToday: 0, isManualOverride: false, expectedScheduleState: 'none' } }
            );
            console.log(`[Scheduler] Reset freeChatsToday & isManualOverride for ${result.modifiedCount} astrologers.`);
        } catch (error) {
            console.error('[Scheduler] Error in daily reset:', error);
        }
    }, {
        timezone: "Asia/Kolkata"
    });
};
