
import mongoose, { Schema, Document } from 'mongoose';

export interface IDeletionRequest extends Document {
    userId?: mongoose.Types.ObjectId;
    astrologerId?: mongoose.Types.ObjectId;
    userType: 'user' | 'astrologer';
    reason: string;
    status: 'pending' | 'processed' | 'rejected'; // 'processed' means deleted
    adminNote?: string;
    createdAt: Date;
    updatedAt: Date;
}

const DeletionRequestSchema: Schema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    astrologerId: { type: Schema.Types.ObjectId, ref: 'Astrologer' },
    userType: {
        type: String,
        enum: ['user', 'astrologer'],
        required: true
    },
    reason: { type: String, required: true },
    status: {
        type: String,
        enum: ['pending', 'processed', 'rejected'],
        default: 'pending'
    },
    adminNote: { type: String, default: '' }
}, { timestamps: true });

// Index for efficient queries
DeletionRequestSchema.index({ status: 1, createdAt: -1 });
DeletionRequestSchema.index({ userId: 1, status: 1 });
DeletionRequestSchema.index({ astrologerId: 1, status: 1 });

export default mongoose.model<IDeletionRequest>('DeletionRequest', DeletionRequestSchema);
