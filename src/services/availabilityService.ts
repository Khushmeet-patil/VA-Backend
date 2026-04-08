import AstrologerAvailabilityLog from '../models/AstrologerAvailabilityLog';
import mongoose from 'mongoose';

/**
 * Service to track astrologer online availability
 */
class AvailabilityService {
    /**
     * Start a new online session session
     * @param astrologerId Astrologer ID
     */
    async recordOnline(astrologerId: string | mongoose.Types.ObjectId): Promise<void> {
        try {
            // Close any existing open session (safety)
            await this.recordOffline(astrologerId);

            const now = new Date();
            // IST Date (YYYY-MM-DD)
            const istDate = new Date(now.getTime() + (5.5 * 60 * 60 * 1000)).toISOString().split('T')[0];

            const log = new AstrologerAvailabilityLog({
                astrologerId,
                startTime: now,
                date: istDate
            });

            await log.save();
            console.log(`[AvailabilityService] Online session started for ${astrologerId}`);
        } catch (error) {
            console.error(`[AvailabilityService] Error recording online for ${astrologerId}:`, error);
        }
    }

    /**
     * Close an active online session
     * @param astrologerId Astrologer ID
     */
    async recordOffline(astrologerId: string | mongoose.Types.ObjectId): Promise<void> {
        try {
            const activeLog = await AstrologerAvailabilityLog.findOne({
                astrologerId,
                endTime: { $exists: false }
            }).sort({ startTime: -1 });

            if (activeLog) {
                const now = new Date();
                const durationMs = now.getTime() - activeLog.startTime.getTime();
                const durationMinutes = Math.max(0, durationMs / 60000);

                activeLog.endTime = now;
                activeLog.duration = parseFloat(durationMinutes.toFixed(2));
                await activeLog.save();
                console.log(`[AvailabilityService] Offline session recorded for ${astrologerId} (Duration: ${activeLog.duration} mins)`);
            }
        } catch (error) {
            console.error(`[AvailabilityService] Error recording offline for ${astrologerId}:`, error);
        }
    }

    /**
     * Get total online hours for today (IST)
     * @param astrologerId Astrologer ID
     */
    async getTodayTotalHours(astrologerId: string | mongoose.Types.ObjectId): Promise<number> {
        try {
            const istNow = new Date(new Date().getTime() + (5.5 * 60 * 60 * 1000));
            const istDateStr = istNow.toISOString().split('T')[0];

            // 1. Get closed sessions for today
            const logs = await AstrologerAvailabilityLog.find({
                astrologerId,
                date: istDateStr,
                endTime: { $exists: true }
            });

            let totalMinutes = logs.reduce((sum, log) => sum + (log.duration || 0), 0);

            // 2. Add current active session if it exists and started today
            const activeLog = await AstrologerAvailabilityLog.findOne({
                astrologerId,
                endTime: { $exists: false }
            });

            if (activeLog) {
                const now = new Date();
                // If it started before today IST, we should only count minutes from start of today IST
                // But for simplicity of "today", let's just count from startTime
                const durationMs = now.getTime() - activeLog.startTime.getTime();
                totalMinutes += (durationMs / 60000);
            }

            return parseFloat((totalMinutes / 60).toFixed(2));
        } catch (error) {
            console.error(`[AvailabilityService] Error getting today hours for ${astrologerId}:`, error);
            return 0;
        }
    }
}

export default new AvailabilityService();
