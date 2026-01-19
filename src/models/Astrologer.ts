import mongoose, { Schema, Document } from 'mongoose';

export interface IAstrologer extends Document {
    userId: mongoose.Types.ObjectId;
    firstName: string;
    lastName: string;
    gender: string;
    mobileNumber: string;
    email: string;
    experience: number;
    city: string;
    country: string;
    systemKnown: string[];
    language: string[];
    bio: string;
    aboutMe: string;                    // Detailed about section
    profilePhoto?: string;              // R2 URL or base64 (legacy) profile picture
    status: 'approved' | 'under_review' | 'rejected';
    specialties: string[];
    rating: number;
    reviewsCount: number;               // Total number of reviews
    totalRatingSum: number;             // Sum of all ratings (for calculating average)
    followersCount: number;             // Number of followers
    isOnline: boolean;
    isBlocked: boolean;
    isBusy: boolean;                    // TRUE when in active chat
    activeSessionId?: string;           // Current active session ID
    pricePerMin: number;
    priceRangeMin: number;
    priceRangeMax: number;
    totalChats: number;
    earnings: number;
    pendingWithdrawal: number;  // Amount pending payout
    tag: 'None' | 'Celebrity' | 'Top Choice' | 'Rising Star';
    fcmToken?: string;  // FCM device token for push notifications
    createdAt: Date;
}

const AstrologerSchema: Schema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    gender: { type: String, required: true },
    mobileNumber: { type: String, required: true },
    email: { type: String, required: true },
    experience: { type: Number, default: 0 },
    city: { type: String, required: true },
    country: { type: String, required: true },
    systemKnown: [{ type: String }],
    language: [{ type: String }],
    bio: { type: String },
    aboutMe: { type: String, default: '' },  // Detailed about section
    profilePhoto: { type: String },          // R2 URL or base64 (legacy) profile picture
    status: { type: String, enum: ['approved', 'under_review', 'rejected'], default: 'under_review' },
    specialties: [{ type: String }],
    rating: { type: Number, default: 0 },
    reviewsCount: { type: Number, default: 0 },       // Total number of reviews
    totalRatingSum: { type: Number, default: 0 },     // Sum of all ratings
    followersCount: { type: Number, default: 0 },     // Number of followers
    isOnline: { type: Boolean, default: false },
    isBlocked: { type: Boolean, default: false },
    isBusy: { type: Boolean, default: false },
    activeSessionId: { type: String },
    pricePerMin: { type: Number, default: 20 },
    priceRangeMin: { type: Number, default: 10 },
    priceRangeMax: { type: Number, default: 100 },
    totalChats: { type: Number, default: 0 },
    earnings: { type: Number, default: 0 },
    pendingWithdrawal: { type: Number, default: 0 },
    tag: { type: String, enum: ['None', 'Celebrity', 'Top Choice', 'Rising Star'], default: 'None' },
    fcmToken: { type: String },
}, { timestamps: true });

export default mongoose.model<IAstrologer>('Astrologer', AstrologerSchema);

