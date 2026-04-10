console.log('Starting VedicAstro Backend...');

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { redisPub, redisSub } from './config/redis';

console.log('Imports loaded, loading local modules...');


import connectDB from './config/db';
import healthRoutes from './routes/healthRoutes';
import authRoutes from './routes/authRoutes';
import adminRoutes from './routes/adminRoutes';
import astrologerRoutes from './routes/astrologerRoutes';
import astrologerPanelRoutes from './routes/astrologerPanelRoutes';
import chatRoutes from './routes/chatRoutes';
import profileRoutes from './routes/profileRoutes';
import initializeSocketHandlers from './services/socketHandlers';
import { checkR2Connection } from './services/r2Service';
import notificationService from './services/notificationService';
import notificationRoutes from './routes/notificationRoutes';
import scheduledNotificationService from './services/scheduledNotificationService';
import scheduleAutoOnline, { scheduleDailyReset, scheduleZombieCleanup, setIOInstance } from './services/scheduler'; // Auto-online scheduler
import { startSessionScheduler } from './services/sessionScheduler'; // Session maintenance
import astrologyRoutes from './routes/astrologyProxyRoutes';
import matchingRoutes from './routes/matchingRoutes';
import kundliRoutes from './routes/kundliRoutes';
import panchangRoutes from './routes/panchangRoutes';
import policyRoutes from './routes/policyRoutes';
import systemRoutes from './routes/systemRoutes';

console.log('All modules loaded successfully');

// Check R2 Configuration
checkR2Connection();

// Initialize Firebase Cloud Messaging
console.log('[Main] Initializing Notification Service...');
notificationService.initialize();

// Initialize Auto-Online Scheduling (cron registration - io will be injected below)
scheduleAutoOnline();
scheduleDailyReset(); // Reset freeChatsToday & isManualOverride daily at midnight IST
scheduleZombieCleanup(); // Periodically clean up offline astrologers
startSessionScheduler(); // Start chat session maintenance & billing recovery

const app = express();

// Create HTTP server for both Express and Socket.IO
const httpServer = createServer(app);

// CORS Configuration for production
const corsOptions = {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/uploads', express.static('uploads'));

// Initialize Socket.IO
// pingInterval + pingTimeout determines how fast dead connections are detected.
// Old: 25s + 60s = up to 85s "zombie" window. New: 10s + 20s = ~30s max.
// connectionStateRecovery buffers events for 2 minutes so reconnecting clients
// automatically receive any missed events without application-level re-delivery.
const io = new SocketIOServer(httpServer, {
    cors: corsOptions,

    // ── Ping / zombie detection ────────────────────────────────────────────
    pingInterval: 10000,   // Send ping every 10 s
    pingTimeout: 20000,    // Disconnect if no pong within 20 s (~30 s zombie window)

    // ── Transport ─────────────────────────────────────────────────────────
    // Prefer WebSocket; fall back to polling only if WS is blocked
    transports: ['websocket', 'polling'],

    // ── Payload limits ────────────────────────────────────────────────────
    maxHttpBufferSize: 1e6, // 1 MB max per message (guards against large payloads)

    // ── Connection state recovery ─────────────────────────────────────────
    // Buffers missed events for reconnecting clients (up to 2 minutes)
    connectionStateRecovery: {
        maxDisconnectionDuration: 2 * 60 * 1000,
        skipMiddlewares: true,
    },

    // ── Per-socket send buffer ─────────────────────────────────────────────
    // Drop messages if the client can't keep up (prevents memory bloat)
    // Default is Infinity — cap it to protect the server under load
    // (socket.io v4.6+ only)
});

// Attach Redis adapter so all cluster workers share Socket.IO rooms
io.adapter(createAdapter(redisPub, redisSub));
console.log('[Socket.IO] Redis adapter attached');

// Initialize socket handlers
initializeSocketHandlers(io);

// NOW inject io into the scheduler so it can emit socket events
setIOInstance(io);

// Routes - these are registered immediately so health check works
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/astrologer', astrologerRoutes);
app.use('/api/panel', astrologerPanelRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/astrology', astrologyRoutes);
app.use('/api/matching', matchingRoutes);
app.use('/api/kundli', kundliRoutes);
app.use('/api/panchang', panchangRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/policies', policyRoutes);

// Root route
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        message: 'VedicAstro Backend Running',
        version: '1.0.0',
        features: ['REST API', 'Socket.IO Chat'],
        timestamp: new Date().toISOString()
    });
});

// Railway uses PORT environment variable
const port = process.env.PORT || 5000;

console.log(`Attempting to start server on port ${port}...`);

// START SERVER IMMEDIATELY - so Railway healthcheck passes
httpServer.listen(Number(port), '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
    console.log(`Socket.IO enabled`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

    // Connect to database AFTER server is listening
    connectDB()
        .then(() => {
            console.log('Database connected successfully');
            // Initialize scheduled notifications after DB is connected
            scheduledNotificationService.initialize();
        })
        .catch((error) => {
            console.error('Database connection failed:', error.message);
            // Don't exit - let server keep running, routes will fail gracefully
        });
});

// Export io for use in other modules if needed
export { io };
