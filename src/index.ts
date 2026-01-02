
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

// Middleware
app.use(cors());
app.use(express.json());

// Database
connectDB();

// Routes
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/astrologer', astrologerRoutes);
app.use('/api/panel', astrologerPanelRoutes);


app.get('/', (req, res) => {
    res.send('VedicAstro Backend Running');
});


const port = process.env.PORT || 5000;
const host = process.env.HOST || '0.0.0.0';

app.listen(Number(port), host, () => {
    console.log(`Server running on http://${host}:${port}`);
});
