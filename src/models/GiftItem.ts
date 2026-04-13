import mongoose, { Schema, Document } from 'mongoose';

export interface IGiftItem extends Document {
    name: string;
    emoji: string;
    amount: number;
    isActive: boolean;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
}

const GiftItemSchema: Schema = new Schema({
    name: { type: String, required: true },
    emoji: { type: String, required: true, default: '🎁' },
    amount: { type: Number, required: true, min: 1 },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
}, { timestamps: true });

export default mongoose.model<IGiftItem>('GiftItem', GiftItemSchema);
