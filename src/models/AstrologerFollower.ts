import mongoose, { Schema, Document } from 'mongoose';

/**
 * AstrologerFollower Model
 * Tracks which users are following which astrologers.
 */
export interface IAstrologerFollower extends Document {
    userId: mongoose.Types.ObjectId;        // User who is following
    astrologerId: mongoose.Types.ObjectId;  // Astrologer being followed
    createdAt: Date;
}

const AstrologerFollowerSchema: Schema = new Schema({
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
    }
}, { timestamps: true });

// Compound unique index to prevent duplicate follows
AstrologerFollowerSchema.index({ userId: 1, astrologerId: 1 }, { unique: true });

export default mongoose.model<IAstrologerFollower>('AstrologerFollower', AstrologerFollowerSchema);
