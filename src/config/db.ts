
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(
            process.env.MONGO_URI || 'mongodb://localhost:27017/vedicastro',
            {
                // ── Connection pool ────────────────────────────────────────
                // 2 workers × 50 connections = 100 total MongoDB connections
                maxPoolSize: 50,
                minPoolSize: 5,

                // ── Timeouts ───────────────────────────────────────────────
                serverSelectionTimeoutMS: 5000,
                socketTimeoutMS: 45000,
                connectTimeoutMS: 10000,

                // ── Heartbeat ─────────────────────────────────────────────
                heartbeatFrequencyMS: 10000,
            }
        );
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error: any) {
        console.error(`MongoDB Connection Error: ${error.message}`);
        throw error;
    }
};

export default connectDB;
