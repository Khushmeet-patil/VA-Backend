import mongoose, { Schema, Document } from 'mongoose';

/**
 * ChatReview Model
 * Stores user reviews/ratings for astrologers after chat sessions.
 */
export interface IChatReview extends Document {
    sessionId: string;                  // Reference to ChatSession.sessionId
    userId: mongoose.Types.ObjectId;    // Reference to User who gave review
    astrologerId: mongoose.Types.ObjectId;  // Reference to Astrologer being reviewed
    rating: 1 | 2 | 3 | 4 | 5;
    reviewText?: string;
    createdAt: Date;
}

const ChatReviewSchema: Schema = new Schema({
    sessionId: {
        type: String,
        required: true,
        unique: true  // One review per session
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    astrologerId: {
        type: Schema.Types.ObjectId,
        ref: 'Astrologer',
        required: true,
        index: true
    },
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    reviewText: {
        type: String,
        maxlength: 500
    }
}, { timestamps: true });

// Index for fetching reviews for an astrologer
ChatReviewSchema.index({ astrologerId: 1, createdAt: -1 });

export default mongoose.model<IChatReview>('ChatReview', ChatReviewSchema);
