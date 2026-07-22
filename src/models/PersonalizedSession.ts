import mongoose, { Schema, Document } from 'mongoose';
import { randomUUID } from 'crypto';

export interface IPersonalizedSession extends Document {
    sessionId: string;
    userId: mongoose.Types.ObjectId;
    astrologerId: mongoose.Types.ObjectId;
    profileId?: string;
    profileData?: {
        name: string;
        gender?: string;
        dateOfBirth?: string;
        timeOfBirth?: string;
        placeOfBirth?: string;
        relationshipStatus?: string;
        topic?: string;
    };
    serviceType: 'chat' | 'call' | 'video';
    durationMinutes: number;
    basePrice: number;
    gstAmount: number;
    totalAmountPaid: number;
    astrologerEarning: number;
    platformCommission: number;
    commissionPercentage: number;
    status: 'PAID_PENDING_ACCEPT' | 'ACTIVE' | 'COMPLETED' | 'MISSED' | 'CANCELLED';
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    startTime?: Date;
    endTime?: Date;
    missedAt?: Date;
    zegoRoomId?: string;
    chatMessages?: {
        senderId: string;
        senderType: 'user' | 'astrologer';
        message: string;
        timestamp: Date;
    }[];
    notes?: string;
    createdAt: Date;
    updatedAt: Date;
}

const PersonalizedSessionSchema: Schema = new Schema({
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
    profileId: { type: String },
    profileData: {
        name: { type: String },
        gender: { type: String },
        dateOfBirth: { type: String },
        timeOfBirth: { type: String },
        placeOfBirth: { type: String },
        relationshipStatus: { type: String },
        topic: { type: String }
    },
    serviceType: {
        type: String,
        enum: ['chat', 'call', 'video'],
        required: true
    },
    durationMinutes: {
        type: Number,
        required: true
    },
    basePrice: {
        type: Number,
        required: true
    },
    gstAmount: {
        type: Number,
        default: 0
    },
    totalAmountPaid: {
        type: Number,
        required: true
    },
    astrologerEarning: {
        type: Number,
        default: 0
    },
    platformCommission: {
        type: Number,
        default: 0
    },
    commissionPercentage: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['PAID_PENDING_ACCEPT', 'ACTIVE', 'COMPLETED', 'MISSED', 'CANCELLED'],
        default: 'PAID_PENDING_ACCEPT',
        index: true
    },
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    startTime: { type: Date },
    endTime: { type: Date },
    missedAt: { type: Date },
    zegoRoomId: { type: String },
    chatMessages: [{
        senderId: { type: String },
        senderType: { type: String, enum: ['user', 'astrologer'] },
        message: { type: String },
        timestamp: { type: Date, default: Date.now }
    }],
    notes: { type: String }
}, { timestamps: true });

export default mongoose.model<IPersonalizedSession>('PersonalizedSession', PersonalizedSessionSchema);
