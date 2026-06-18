import mongoose, { Schema, Document } from 'mongoose';

export interface IKundliPdfRequest extends Document {
    user: mongoose.Types.ObjectId;
    reportType: 'kundli' | 'numerology';
    name: string;
    gender: 'male' | 'female';
    day: number;
    month: number;
    year: number;
    hour: number;
    min: number;
    lat: number;
    lon: number;
    tzone: number;
    place: string;
    pdfType: 'basic' | 'pro';
    language: string;
    email: string;
    amount: number;
    pdfUrl?: string;
    paymentId?: string;
    status: 'pending' | 'success' | 'failed';
    createdAt: Date;
    updatedAt: Date;
}

const KundliPdfRequestSchema: Schema = new Schema({
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reportType: { type: String, enum: ['kundli', 'numerology'], default: 'kundli' },
    name: { type: String, required: true },
    gender: { type: String, enum: ['male', 'female'] },
    day: { type: Number, required: true },
    month: { type: Number, required: true },
    year: { type: Number, required: true },
    hour: { type: Number },
    min: { type: Number },
    lat: { type: Number },
    lon: { type: Number },
    tzone: { type: Number },
    place: { type: String },
    pdfType: { type: String, enum: ['basic', 'pro'] },
    language: { type: String, default: 'en', required: true },
    email: { type: String, required: true },
    amount: { type: Number, required: true },
    pdfUrl: { type: String },
    paymentId: { type: String, sparse: true, unique: true },
    status: { type: String, enum: ['pending', 'success', 'failed'], default: 'pending' }
}, { timestamps: true });

export default mongoose.model<IKundliPdfRequest>('KundliPdfRequest', KundliPdfRequestSchema);
