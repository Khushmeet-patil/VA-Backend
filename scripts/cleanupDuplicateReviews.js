/**
 * Cleanup Duplicate Reviews Script
 *
 * Finds and removes duplicate astrologer reviews (with matching sessionId)
 * in the database to allow creating a unique index.
 *
 * Run on VPS/production server using:
 *   node scripts/cleanupDuplicateReviews.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/vedicastro';

async function run() {
    console.log('Connecting to MongoDB at', MONGO_URI);
    await mongoose.connect(MONGO_URI);
    console.log('Connected successfully.');

    const db = mongoose.connection.db;
    const collection = db.collection('chatreviews');

    // Find duplicates using aggregation
    console.log('Scanning for duplicate reviews by sessionId...');
    const duplicates = await collection.aggregate([
        {
            $group: {
                _id: "$sessionId",
                count: { $sum: 1 },
                docs: { $push: "$$ROOT" }
            }
        },
        {
            $match: {
                count: { $gt: 1 }
            }
        }
    ]).toArray();

    console.log(`Found ${duplicates.length} session(s) with duplicate reviews.`);

    let totalDeleted = 0;

    for (const group of duplicates) {
        const sessionId = group._id;
        const docs = group.docs;
        console.log(`\nSession ID: ${sessionId} has ${docs.length} reviews:`);

        // Sort reviews to decide which one to keep
        // Priority:
        // 1. Keep approved reviews over pending/rejected
        // 2. Keep reviews with non-empty reviewText comment
        // 3. Keep the oldest review (created first)
        docs.sort((a, b) => {
            // Status sorting: 'approved' comes first
            const statusOrder = { approved: 0, pending: 1, rejected: 2 };
            const statusA = statusOrder[a.status] !== undefined ? statusOrder[a.status] : 9;
            const statusB = statusOrder[b.status] !== undefined ? statusOrder[b.status] : 9;
            if (statusA !== statusB) return statusA - statusB;

            // Comment text sorting: non-empty reviewText comes first
            const hasTextA = a.reviewText && a.reviewText.trim().length > 0 ? 0 : 1;
            const hasTextB = b.reviewText && b.reviewText.trim().length > 0 ? 0 : 1;
            if (hasTextA !== hasTextB) return hasTextA - hasTextB;

            // Date sorting: oldest first
            return new Date(a.createdAt) - new Date(b.createdAt);
        });

        const keepDoc = docs[0];
        const deleteDocs = docs.slice(1);

        console.log(` -> KEEPING: ID: ${keepDoc._id}, Rating: ${keepDoc.rating}, Status: ${keepDoc.status}, Comment: "${keepDoc.reviewText || ''}", CreatedAt: ${keepDoc.createdAt}`);

        for (const deleteDoc of deleteDocs) {
            console.log(` -> DELETING: ID: ${deleteDoc._id}, Rating: ${deleteDoc.rating}, Status: ${deleteDoc.status}, Comment: "${deleteDoc.reviewText || ''}", CreatedAt: ${deleteDoc.createdAt}`);
            await collection.deleteOne({ _id: deleteDoc._id });
            totalDeleted++;
        }
    }

    console.log(`\nCleanup completed. Total duplicate documents deleted: ${totalDeleted}`);
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
}

run().catch(err => {
    console.error('Cleanup failed:', err);
    process.exit(1);
});
