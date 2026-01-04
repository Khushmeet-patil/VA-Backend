import mongoose, { Schema, Document } from 'mongoose';

/**
 * ChatMessage Model
 * Stores individual messages within a chat session.
 * All messages are persisted to MongoDB for history.
 */
export interface IChatMessage extends Document {
    sessionId: string;                  // Reference to ChatSession.sessionId
    senderId: mongoose.Types.ObjectId;  // User or Astrologer ID
    senderType: 'user' | 'astrologer';
    text: string;
    timestamp: Date;
    createdAt: Date;
}

const ChatMessageSchema: Schema = new Schema({
    sessionId: {
        type: String,
        required: true,
        index: true
    },
    senderId: {
        type: Schema.Types.ObjectId,
        required: true
    },
    senderType: {
        type: String,
        enum: ['user', 'astrologer'],
        required: true
    },
    text: {
        type: String,
        required: true,
        maxlength: 2000  // Limit message length
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

// Index for fetching chat history efficiently
ChatMessageSchema.index({ sessionId: 1, timestamp: 1 });

export default mongoose.model<IChatMessage>('ChatMessage', ChatMessageSchema);
