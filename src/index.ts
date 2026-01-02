
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import connectDB from './config/db';
import healthRoutes from './routes/healthRoutes';
import authRoutes from './routes/authRoutes';
import adminRoutes from './routes/adminRoutes';
import astrologerRoutes from './routes/astrologerRoutes';
import astrologerPanelRoutes from './routes/astrologerPanelRoutes';

dotenv.config();

const app = express();

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

// Database
connectDB();

// Routes
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/astrologer', astrologerRoutes);
app.use('/api/panel', astrologerPanelRoutes);

// Root route
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        message: 'VedicAstro Backend Running',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
});

// Railway uses PORT environment variable
const port = process.env.PORT || 5000;

// Listen on 0.0.0.0 for Railway
app.listen(Number(port), '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
