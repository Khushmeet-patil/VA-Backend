import mongoose, { Schema, Document } from 'mongoose';

export interface IGiftTransaction extends Document {
    fromUser: mongoose.Types.ObjectId;
    toAstrologer: mongoose.Types.ObjectId;
    giftItem: mongoose.Types.ObjectId;
    giftName: string;
    giftEmoji: string;
    amount: number;           // Full amount deducted from user
    commissionPercent: number;
    commissionAmount: number; // Platform cut
    astrologerAmount: number; // Net amount for astrologer
    sessionId?: string;       // UUID string from ChatSession.sessionId (not a MongoDB ObjectId)
    createdAt: Date;
}

const GiftTransactionSchema: Schema = new Schema({
    fromUser: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    toAstrologer: { type: Schema.Types.ObjectId, ref: 'Astrologer', required: true },
    giftItem: { type: Schema.Types.ObjectId, ref: 'GiftItem', required: true },
    giftName: { type: String, required: true },
    giftEmoji: { type: String, required: true },
    amount: { type: Number, required: true },
    commissionPercent: { type: Number, required: true, default: 20 },
    commissionAmount: { type: Number, required: true },
    astrologerAmount: { type: Number, required: true },
    sessionId: { type: String },  // UUID string from ChatSession.sessionId
}, { timestamps: true });

export default mongoose.model<IGiftTransaction>('GiftTransaction', GiftTransactionSchema);
