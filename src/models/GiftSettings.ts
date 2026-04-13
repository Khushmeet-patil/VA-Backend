import mongoose, { Schema, Document } from 'mongoose';

export interface IGiftSettings extends Document {
    commissionPercent: number;
    updatedAt: Date;
}

const GiftSettingsSchema: Schema = new Schema({
    commissionPercent: { type: Number, required: true, default: 20, min: 0, max: 100 },
}, { timestamps: true });

export default mongoose.model<IGiftSettings>('GiftSettings', GiftSettingsSchema);
