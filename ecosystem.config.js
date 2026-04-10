/**
 * PM2 Ecosystem Config — Production
 *
 * Runs 2 cluster workers (one per vCPU).
 * Socket.IO rooms are shared via Redis adapter so all workers see
 * every connected socket regardless of which process it landed on.
 *
 * Deploy:  pm2 start ecosystem.config.js --env production
 * Reload:  pm2 reload ecosystem.config.js --env production   (zero-downtime)
 * Stop:    pm2 stop ecosystem.config.js
 */
module.exports = {
    apps: [
        {
            name: 'va-backend',
            script: './dist/index.js',

            // ── Fork mode: single process (cluster mode caused PM2 hang) ──
            instances: 1,
            exec_mode: 'fork',

            // ── Memory guard ───────────────────────────────────────────────
            // Restart a worker if it leaks past 1.5 GB (leaves headroom for OS + MongoDB)
            max_memory_restart: '1500M',

            // ── Restart policy ─────────────────────────────────────────────
            autorestart: true,
            restart_delay: 1000,

            // ── Logging ────────────────────────────────────────────────────
            merge_logs: true,
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

            // ── Environment ────────────────────────────────────────────────
            env: {
                NODE_ENV: 'development',
                PORT: 5000,
            },
            env_production: {
                NODE_ENV: 'production',
                PORT: 5000,
            },

            // ── Node.js flags ──────────────────────────────────────────────
            // Increase libuv thread pool for heavy I/O (MongoDB + Redis)
            node_args: '--max-old-space-size=1400',
        },
    ],
};
