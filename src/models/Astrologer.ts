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
    yearlyEarningsStartDate: Date;    // Start of current financial year tracking (April 1)
    yearlyGrossEarnings: number;      // Total earnings this financial year (before TDS)
    yearlyTdsDeducted: number;        // Total TDS deducted this financial year
    pendingWithdrawal: number;  // Amount pending payout
    missedChats: number;        // Count of missed/timed-out chat requests
    warningCount: number;       // Number of times warned by admin (max 2 before block)
    tag: 'None' | 'Celebrity' | 'Top Choice' | 'Rising Star';
    fcmToken?: string;  // Firebase Cloud Messaging token for push notifications
    fcmTokenUpdatedAt?: Date;  // When the FCM token was last updated
    createdAt: Date;
    isVerified: boolean;
    verificationDocuments: {
        name: string;
        url: string;
        uploadedAt: Date;
    }[];
    bankDetails?: {
        bankName: string;
        accountNumber: string;
        ifscCode: string;
        accountHolderName: string;
        branchName: string;
    };
    isFreeChatAvailable: boolean;
    freeChatLimit: number;
    isAutoOnlineEnabled: boolean;
    availabilitySchedule: {
        day: string;
        enabled: boolean;
        startTime: string;
        endTime: string;
    }[];
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
    yearlyEarningsStartDate: { type: Date, default: null },  // Start of current financial year tracking
    yearlyGrossEarnings: { type: Number, default: 0 },       // Total earnings this financial year
    yearlyTdsDeducted: { type: Number, default: 0 },         // Total TDS deducted this financial year
    pendingWithdrawal: { type: Number, default: 0 },
    missedChats: { type: Number, default: 0 },
    warningCount: { type: Number, default: 0 },
    tag: { type: String, enum: ['None', 'Celebrity', 'Top Choice', 'Rising Star'], default: 'None' },
    fcmToken: { type: String, index: true },  // Firebase Cloud Messaging token
    fcmTokenUpdatedAt: { type: Date },  // When FCM token was last updated

    // Verification
    isVerified: { type: Boolean, default: false },
    verificationDocuments: [{
        name: { type: String },
        url: { type: String },
        uploadedAt: { type: Date, default: Date.now }
    }],

    // Bank Details
    bankDetails: {
        bankName: { type: String, default: '' },
        accountNumber: { type: String, default: '' },
        ifscCode: { type: String, default: '' },
        accountHolderName: { type: String, default: '' },
        branchName: { type: String, default: '' }
    },

    // Free Chat Settings
    isFreeChatAvailable: { type: Boolean, default: false },
    freeChatLimit: { type: Number, default: 0 },

    // Auto-Online Scheduling
    isAutoOnlineEnabled: { type: Boolean, default: false },
    availabilitySchedule: [{
        day: { type: String, enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] },
        enabled: { type: Boolean, default: false },
        startTime: { type: String, default: '09:00' }, // "HH:mm"
        endTime: { type: String, default: '17:00' }    // "HH:mm"
    }]
}, { timestamps: true });

export default mongoose.model<IAstrologer>('Astrologer', AstrologerSchema);

