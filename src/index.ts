
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

import connectDB from './config/db';
import healthRoutes from './routes/healthRoutes';
import authRoutes from './routes/authRoutes';
import adminRoutes from './routes/adminRoutes';
import astrologerRoutes from './routes/astrologerRoutes';
import astrologerPanelRoutes from './routes/astrologerPanelRoutes';
import chatRoutes from './routes/chatRoutes';
import initializeSocketHandlers from './services/socketHandlers';

dotenv.config();

const app = express();

// Create HTTP server for both Express and Socket.IO
const httpServer = createServer(app);

// CORS Configuration for production
const corsOptions = {
    origin: process.env.CORS_ORIGIN || '*', // Allow all origins in development, restrict in production
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Initialize Socket.IO
const io = new SocketIOServer(httpServer, {
    cors: corsOptions,
    pingTimeout: 60000, // 60 seconds
    pingInterval: 25000, // 25 seconds
});

// Initialize socket handlers
initializeSocketHandlers(io);

// Database
connectDB();

// Routes
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/astrologer', astrologerRoutes);
app.use('/api/panel', astrologerPanelRoutes);
app.use('/api/chat', chatRoutes);

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

// Listen on 0.0.0.0 for Railway - use httpServer instead of app
httpServer.listen(Number(port), '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
    console.log(`Socket.IO enabled`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Export io for use in other modules if needed
export { io };
