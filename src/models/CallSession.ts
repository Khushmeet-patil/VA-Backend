import mongoose, { Schema, Document } from 'mongoose';
import { randomUUID } from 'crypto';

/**
 * CallSession Model
 * Represents a paid call (voice or video) session between a user and an astrologer.
 * The backend is FULLY authoritative for timing, billing, and session state.
 */
export interface ICallSession extends Document {
    sessionId: string;                  // Unique UUID for the session
    userId: mongoose.Types.ObjectId;    // Reference to User
    astrologerId: mongoose.Types.ObjectId;  // Reference to Astrologer
    ratePerMinute: number;              // Rate locked at session creation
    status: 'PENDING' | 'ACTIVE' | 'ENDED' | 'REJECTED';
    startTime?: Date;                   // Set when status becomes ACTIVE
    endTime?: Date;                     // Set when status becomes ENDED
    totalMinutes: number;               // Completed billing cycles
    totalAmount: number;                // Total amount deducted from user
    totalRealDeducted: number;          // Total real money portion deducted from user
    totalBonusDeducted: number;         // Total bonus money portion deducted from user
    astrologerEarnings: number;         // Gross earnings (after commission, before TDS)
    astrologerNetEarnings: number;      // Net earnings (after commission and TDS)
    endReason?: 'USER_END' | 'ASTROLOGER_END' | 'INSUFFICIENT_BALANCE' | 'DISCONNECT' | 'TIMEOUT' | 'FREE_TRIAL_ENDED' | 'ASTROLOGER_REJECTED' | 'ASTROLOGER_TIMEOUT' | 'USER_CANCEL_WHILE_PENDING' | 'ASTROLOGER_OFFLINE_DURING_REQUEST' | 'INSUFFICIENT_BALANCE_AT_ACCEPT';
    intakeDetails?: Record<string, any>; // User's intake form data (Mixed)
    userJoined: boolean;
    astrologerJoined: boolean;
    lastBilledAt?: Date;                // Time of last billing cycle completion
    userLastSeen?: Date;                // Time user was last seen connected
    astrologerLastSeen?: Date;          // Time astrologer was last seen connected
    // Continue Call fields
    isContinuation?: boolean;           // True if this is a continuation of a previous session
    previousSessionId?: string;         // Reference to the previous session's sessionId
    // Free Trial fields
    isFreeTrialSession?: boolean;       // True if this is a free trial session for new users
    freeTrialDurationSeconds?: number;  // Duration of free trial (default 120 = 2 minutes)
    isIntroSession?: boolean;           // True if this is an introductory session for new users
    createdAt: Date;
    updatedAt: Date;
    sharedProfiles?: any[];             // List of profiles shared in this session
    profileId?: string;                 // ID of the profile used for this call
    penaltyAmount?: number;             // Amount deducted if session was missed/timed out
    errorDescription?: string;         // Captures unexpected error details
    sessionType?: 'voice_call' | 'video_call';
}

const CallSessionSchema: Schema = new Schema({
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
    totalRealDeducted: { type: Number, default: 0 },
    totalBonusDeducted: { type: Number, default: 0 },
    astrologerEarnings: { type: Number, default: 0 },
    astrologerNetEarnings: { type: Number, default: 0 },
    penaltyAmount: { type: Number, default: 0 },
    endReason: {
        type: String,
        enum: [
            'USER_END', 
            'ASTROLOGER_END', 
            'INSUFFICIENT_BALANCE', 
            'DISCONNECT', 
            'TIMEOUT', 
            'FREE_TRIAL_ENDED',
            'ASTROLOGER_REJECTED',
            'ASTROLOGER_TIMEOUT',
            'USER_CANCEL_WHILE_PENDING',
            'ASTROLOGER_OFFLINE_DURING_REQUEST',
            'INSUFFICIENT_BALANCE_AT_ACCEPT'
        ]
    },
    intakeDetails: { type: Schema.Types.Mixed },
    userJoined: { type: Boolean, default: false },
    astrologerJoined: { type: Boolean, default: false },
    lastBilledAt: { type: Date },
    userLastSeen: { type: Date, default: Date.now },
    astrologerLastSeen: { type: Date, default: Date.now },
    // Continue Call fields
    isContinuation: { type: Boolean, default: false },
    previousSessionId: { type: String },
    // Free Trial fields
    isFreeTrialSession: { type: Boolean, default: false },
    freeTrialDurationSeconds: { type: Number, default: 120 },
    isIntroSession: { type: Boolean, default: false },
    // Shared Profiles
    sharedProfiles: { type: [Object], default: [] },
    // Profile Reference
    profileId: { type: String }, // 'default' or specific profile ID
    errorDescription: { type: String }, // Details for system errors
    sessionType: {
        type: String,
        enum: ['voice_call', 'video_call'],
        default: 'voice_call',
        index: true
    }
}, { timestamps: true });

// Compound index for finding active sessions
CallSessionSchema.index({ astrologerId: 1, status: 1 });
CallSessionSchema.index({ userId: 1, status: 1 });

export default mongoose.model<ICallSession>('CallSession', CallSessionSchema);
