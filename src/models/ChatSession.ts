import mongoose, { Schema, Document } from 'mongoose';
import { randomUUID } from 'crypto';

/**
 * ChatSession Model
 * Represents a paid chat session between a user and an astrologer.
 * The backend is FULLY authoritative for timing, billing, and session state.
 */
export interface IChatSession extends Document {
    sessionId: string;                  // Unique UUID for the session
    userId: mongoose.Types.ObjectId;    // Reference to User
    astrologerId: mongoose.Types.ObjectId;  // Reference to Astrologer
    ratePerMinute: number;              // Rate locked at session creation
    status: 'PENDING' | 'ACTIVE' | 'ENDED' | 'REJECTED';
    startTime?: Date;                   // Set when status becomes ACTIVE
    endTime?: Date;                     // Set when status becomes ENDED
    totalMinutes: number;               // Completed billing cycles
    totalAmount: number;                // Total amount deducted from user
    astrologerEarnings: number;         // Total earnings for astrologer (may differ if platform fee)
    endReason?: 'USER_END' | 'ASTROLOGER_END' | 'INSUFFICIENT_BALANCE' | 'DISCONNECT' | 'TIMEOUT' | 'FREE_TRIAL_ENDED';
    intakeDetails?: {                   // User's intake form data
        name?: string;
        gender?: string;
        dob?: string;
        tob?: string;
        pob?: string;
    };
    userJoined: boolean;
    astrologerJoined: boolean;
    // Continue Chat fields
    isContinuation?: boolean;           // True if this is a continuation of a previous session
    previousSessionId?: string;         // Reference to the previous session's sessionId
    // Free Trial fields
    isFreeTrialSession?: boolean;       // True if this is a free trial session for new users
    freeTrialDurationSeconds?: number;  // Duration of free trial (default 120 = 2 minutes)
    createdAt: Date;
    updatedAt: Date;
    sharedProfiles?: any[];             // List of profiles shared in this session
}

const ChatSessionSchema: Schema = new Schema({
    sessionId: {
        type: String,
        required: true,
        unique: true,
        default: () => randomUUID()
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    astrologerId: {
        type: Schema.Types.ObjectId,
        ref: 'Astrologer',
        required: true,
        index: true
    },
    ratePerMinute: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ['PENDING', 'ACTIVE', 'ENDED', 'REJECTED'],
        default: 'PENDING',
        index: true
    },
    startTime: { type: Date },
    endTime: { type: Date },
    totalMinutes: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    astrologerEarnings: { type: Number, default: 0 },
    endReason: {
        type: String,
        enum: ['USER_END', 'ASTROLOGER_END', 'INSUFFICIENT_BALANCE', 'DISCONNECT', 'TIMEOUT', 'FREE_TRIAL_ENDED']
    },
    intakeDetails: {
        name: { type: String },
        gender: { type: String },
        dob: { type: String },
        tob: { type: String },
        pob: { type: String }
    },
    userJoined: { type: Boolean, default: false },
    astrologerJoined: { type: Boolean, default: false },
    // Continue Chat fields
    isContinuation: { type: Boolean, default: false },
    previousSessionId: { type: String },
    // Free Trial fields
    isFreeTrialSession: { type: Boolean, default: false },
    freeTrialDurationSeconds: { type: Number, default: 120 },
    // Shared Profiles
    sharedProfiles: { type: [Object], default: [] }
}, { timestamps: true });

// Compound index for finding active sessions
ChatSessionSchema.index({ astrologerId: 1, status: 1 });
ChatSessionSchema.index({ userId: 1, status: 1 });

export default mongoose.model<IChatSession>('ChatSession', ChatSessionSchema);
