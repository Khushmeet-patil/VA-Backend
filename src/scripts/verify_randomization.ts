import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Astrologer from '../models/Astrologer';

dotenv.config();

const MONGODB_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/vedicastro';

async function runVerification() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('Connected.');

        const query = {
            status: 'approved',
            isBlocked: { $ne: true },
            isDeletionRequested: { $ne: true },
            activeDeviceId: { $exists: true }
        };

        const total = await Astrologer.countDocuments(query);
        console.log(`Total approved astrologers: ${total}`);

        if (total < 5) {
            console.log('Not enough astrologers to test randomization properly.');
            await mongoose.disconnect();
            return;
        }

        // Test 1: Randomness
        console.log('\n--- Test 1: Randomness ---');
        const limit = 3;
        
        const fetchRandom = async () => {
             return await Astrologer.aggregate([
                { $match: query },
                { $addFields: { randomSortField: { $rand: {} } } },
                { $sort: { isOnline: -1, randomSortField: 1 } },
                { $limit: limit },
                { $project: { firstName: 1, isOnline: 1 } }
            ]);
        };

        const set1 = await fetchRandom();
        const set2 = await fetchRandom();

        console.log('Set 1:', set1.map(a => a.firstName).join(', '));
        console.log('Set 2:', set2.map(a => a.firstName).join(', '));

        const set1Ids = set1.map(a => a._id.toString());
        const set2Ids = set2.map(a => a._id.toString());
        
        const intersection = set1Ids.filter(id => set2Ids.includes(id));
        console.log(`Intersection count: ${intersection.length}`);
        if (intersection.length < limit) {
             console.log('✅ Randomization seems to work (different sets returned).');
        } else {
             console.log('⚠️ Sets are identical. This might happen by chance but is unlikely if total is large.');
        }

        // Test 2: Exclusion
        console.log('\n--- Test 2: Exclusion ---');
        const excludeIds = set1Ids.map(id => new mongoose.Types.ObjectId(id));
        
        const set3 = await Astrologer.aggregate([
            { $match: { ...query, _id: { $nin: excludeIds } } },
            { $addFields: { randomSortField: { $rand: {} } } },
            { $sort: { isOnline: -1, randomSortField: 1 } },
            { $limit: limit },
            { $project: { firstName: 1 } }
        ]);

        console.log('Set 3 (excluding Set 1):', set3.map(a => a.firstName).join(', '));
        
        const set3Ids = set3.map(a => a._id.toString());
        const hasOverlap = set3Ids.some(id => set1Ids.includes(id));
        
        if (!hasOverlap) {
            console.log('✅ Exclusion works (no overlap with excluded IDs).');
        } else {
            console.log('❌ Exclusion failed (overlap found).');
        }

        await mongoose.disconnect();
        console.log('\nVerification complete.');
    } catch (error) {
        console.error('Verification error:', error);
        process.exit(1);
    }
}

runVerification();
