import mongoose, { Schema, Document } from 'mongoose';

export interface IKundliPdfRequest extends Document {
    user: mongoose.Types.ObjectId;
    reportType: 'kundli' | 'numerology' | 'matchmaking';
    name?: string;
    gender?: 'male' | 'female';
    day?: number;
    month?: number;
    year?: number;
    hour?: number;
    min?: number;
    lat?: number;
    lon?: number;
    tzone?: number;
    place?: string;
    pdfType: 'basic' | 'pro' | 'numerology' | 'matchmaking';
    language: string;
    email: string;
    amount: number;
    pdfUrl?: string;
    paymentId?: string;
    status: 'pending' | 'success' | 'failed';
    
    // Match Making Fields
    mFirstName?: string;
    mLastName?: string;
    mDay?: number;
    mMonth?: number;
    mYear?: number;
    mHour?: number;
    mMinute?: number;
    mLatitude?: number;
    mLongitude?: number;
    mTimezone?: number;
    mPlace?: string;
    fFirstName?: string;
    fLastName?: string;
    fDay?: number;
    fMonth?: number;
    fYear?: number;
    fHour?: number;
    fMinute?: number;
    fLatitude?: number;
    fLongitude?: number;
    fTimezone?: number;
    fPlace?: string;
    
    createdAt: Date;
    updatedAt: Date;
}

const KundliPdfRequestSchema: Schema = new Schema({
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reportType: { type: String, enum: ['kundli', 'numerology', 'matchmaking'], default: 'kundli' },
    name: { type: String },
    gender: { type: String, enum: ['male', 'female'] },
    day: { type: Number },
    month: { type: Number },
    year: { type: Number },
    hour: { type: Number },
    min: { type: Number },
    lat: { type: Number },
    lon: { type: Number },
    tzone: { type: Number },
    place: { type: String },
    pdfType: { type: String, enum: ['basic', 'pro', 'numerology', 'matchmaking'] },
    language: { type: String, default: 'en', required: true },
    email: { type: String, required: true },
    amount: { type: Number, required: true },
    pdfUrl: { type: String },
    paymentId: { type: String, sparse: true, unique: true },
    status: { type: String, enum: ['pending', 'success', 'failed'], default: 'pending' },

    // Matchmaking fields
    mFirstName: { type: String },
    mLastName: { type: String },
    mDay: { type: Number },
    mMonth: { type: Number },
    mYear: { type: Number },
    mHour: { type: Number },
    mMinute: { type: Number },
    mLatitude: { type: Number },
    mLongitude: { type: Number },
    mTimezone: { type: Number },
    mPlace: { type: String },
    fFirstName: { type: String },
    fLastName: { type: String },
    fDay: { type: Number },
    fMonth: { type: Number },
    fYear: { type: Number },
    fHour: { type: Number },
    fMinute: { type: Number },
    fLatitude: { type: Number },
    fLongitude: { type: Number },
    fTimezone: { type: Number },
    fPlace: { type: String }
}, { timestamps: true });

export default mongoose.model<IKundliPdfRequest>('KundliPdfRequest', KundliPdfRequestSchema);
