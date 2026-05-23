import mongoose, { Schema, Document } from 'mongoose';

export interface IFeatureUsage extends Document {
    feature: 'numerology' | 'lal_kitab' | 'kundli' | 'horoscope' | 'panchang';
    userId?: mongoose.Types.ObjectId;
    createdAt: Date;
}

const FeatureUsageSchema: Schema = new Schema({
    feature: { type: String, enum: ['numerology', 'lal_kitab', 'kundli', 'horoscope', 'panchang'], required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model<IFeatureUsage>('FeatureUsage', FeatureUsageSchema);
