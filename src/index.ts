console.log('Starting VedicAstro Backend...');

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

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
import astrologyRoutes from './routes/astrologyProxyRoutes';
import matchingRoutes from './routes/matchingRoutes';
import kundliRoutes from './routes/kundliRoutes';

console.log('All modules loaded successfully');

// Check R2 Configuration
checkR2Connection();

// Initialize Firebase Cloud Messaging
notificationService.initialize();

dotenv.config();

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
const io = new SocketIOServer(httpServer, {
    cors: corsOptions,
    pingTimeout: 60000,
    pingInterval: 25000,
});

// Initialize socket handlers
initializeSocketHandlers(io);

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
        })
        .catch((error) => {
            console.error('Database connection failed:', error.message);
            // Don't exit - let server keep running, routes will fail gracefully
        });
});

// Export io for use in other modules if needed
export { io };
