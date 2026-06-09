import cron from 'node-cron';
import chatService from './chatService';
import callService from './callService';

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
            // 1. Resume billing/call timers that lost in-memory timers
            await chatService.resumeActiveSessions();
            await callService.resumeActiveCalls();
            
            // 2. Cleanup sessions that have been disconnected or timed out
            await chatService.cleanupStaleSessions();
            await callService.cleanupStaleCalls();

            // 3. Verify billing consistency (self-healing for lost timers)
            await chatService.verifyBillingConsistency();
            
        } catch (error) {
            console.error('[SessionScheduler] Error in maintenance tick:', error);
        }
    });

    console.log('[SessionScheduler] Started.');
};

export default startSessionScheduler;
