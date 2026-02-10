import mongoose, { Schema, Document } from 'mongoose';

export interface IProfileChangeRequest extends Document {
    astrologerId: mongoose.Types.ObjectId;
    requestType: 'profile_update' | 'rate_update' | 'photo_update';
    beforeData: Record<string, any>;
    afterData: Record<string, any>;
    status: 'pending' | 'approved' | 'rejected';
    adminNote?: string;
    createdAt: Date;
    updatedAt: Date;
}

const ProfileChangeRequestSchema: Schema = new Schema({
    astrologerId: { type: Schema.Types.ObjectId, ref: 'Astrologer', required: true },
    requestType: {
        type: String,
        enum: ['profile_update', 'rate_update', 'photo_update'],
        required: true
    },
    beforeData: { type: Schema.Types.Mixed, required: true },
    afterData: { type: Schema.Types.Mixed, required: true },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    adminNote: { type: String, default: '' }
}, { timestamps: true });

// Index for efficient queries
ProfileChangeRequestSchema.index({ status: 1, createdAt: -1 });
ProfileChangeRequestSchema.index({ astrologerId: 1, status: 1 });

export default mongoose.model<IProfileChangeRequest>('ProfileChangeRequest', ProfileChangeRequestSchema);
