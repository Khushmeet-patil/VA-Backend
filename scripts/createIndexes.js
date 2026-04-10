/**
 * MongoDB Index Creation Script
 *
 * Run ONCE on the VPS after deploying:
 *   node scripts/createIndexes.js
 *
 * Safe to run multiple times — MongoDB ignores duplicate index creation.
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/vedicastro';

async function createIndexes() {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;

    // ── ChatSession ──────────────────────────────────────────────────────────
    // Primary lookup key for every message send, accept, end
    await db.collection('chatsessions').createIndex({ sessionId: 1 }, { unique: true, background: true });
    // Finding PENDING sessions per user/astrologer
    await db.collection('chatsessions').createIndex({ userId: 1, status: 1 }, { background: true });
    await db.collection('chatsessions').createIndex({ astrologerId: 1, status: 1 }, { background: true });
    // Session maintenance scheduler queries
    await db.collection('chatsessions').createIndex({ status: 1, createdAt: 1 }, { background: true });
    console.log('✓ chatsessions indexes created');

    // ── ChatMessage ──────────────────────────────────────────────────────────
    await db.collection('chatmessages').createIndex({ sessionId: 1, timestamp: 1 }, { background: true });
    console.log('✓ chatmessages indexes created');

    // ── User ─────────────────────────────────────────────────────────────────
    await db.collection('users').createIndex({ email: 1 }, { unique: true, sparse: true, background: true });
    console.log('✓ users indexes created');

    // ── Astrologer ───────────────────────────────────────────────────────────
    await db.collection('astrologers').createIndex({ isOnline: 1, isBlocked: 1 }, { background: true });
    console.log('✓ astrologers indexes created');

    // ── Transaction ──────────────────────────────────────────────────────────
    await db.collection('transactions').createIndex({ userId: 1, createdAt: -1 }, { background: true });
    await db.collection('transactions').createIndex({ astrologerId: 1, createdAt: -1 }, { background: true });
    console.log('✓ transactions indexes created');

    await mongoose.disconnect();
    console.log('\nAll indexes created successfully.');
}

createIndexes().catch(err => {
    console.error('Index creation failed:', err);
    process.exit(1);
});
