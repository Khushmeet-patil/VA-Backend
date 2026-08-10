import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

import User from '../models/User';
import ChatReview from '../models/ChatReview';
import Astrologer from '../models/Astrologer';

async function run() {
    let mongoUri = 'mongodb://localhost:27017/vedicastro';
    console.log('Connecting to', mongoUri);
    await mongoose.connect(mongoUri);
    console.log('Connected.');

    // Print count of users, reviews, astrologers
    const userCount = await User.countDocuments({});
    const reviewCount = await ChatReview.countDocuments({});
    const astroCount = await Astrologer.countDocuments({});
    console.log(`Counts: Users=${userCount}, Reviews=${reviewCount}, Astrologers=${astroCount}`);

    // Print all reviews
    const reviews = await ChatReview.find({}).populate('userId').populate('astrologerId');
    console.log(`All Reviews:`);
    for (const r of reviews) {
        console.log({
            id: r._id,
            sessionId: r.sessionId,
            rating: r.rating,
            reviewText: r.reviewText,
            status: r.status,
            createdAt: r.createdAt,
            user: r.userId ? {
                id: (r.userId as any)._id,
                name: (r.userId as any).name,
                mobile: (r.userId as any).mobile
            } : 'None',
            astrologer: r.astrologerId ? {
                id: (r.astrologerId as any)._id,
                firstName: (r.astrologerId as any).firstName,
                lastName: (r.astrologerId as any).lastName
            } : 'None'
        });
    }

    await mongoose.disconnect();
}

run().catch(console.error);
