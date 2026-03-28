import cron from 'node-cron';
import chatService from './chatService';

/**
 * Start the session maintenance scheduler
 * This runs every minute to:
 * 1. Resume billing timers for active sessions after server restart
 * 2. Cleanup sessions that have been disconnected for too long
 */
export const startSessionScheduler = () => {
    // Run every minute
    cron.schedule('* * * * *', async () => {
        console.log('[SessionScheduler] Running maintenance tick...');
        try {
            // 1. Resume billing for sessions that lost their in-memory timers
            await chatService.resumeActiveSessions();
            
            // 2. Cleanup sessions where participants have been offline for > 2 mins
            await chatService.cleanupStaleSessions();
            
        } catch (error) {
            console.error('[SessionScheduler] Error in maintenance tick:', error);
        }
    });

    console.log('[SessionScheduler] Started.');
};

export default startSessionScheduler;
