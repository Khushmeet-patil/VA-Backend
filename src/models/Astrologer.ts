import mongoose, { Schema, Document } from 'mongoose';

export interface IAstrologer extends Document {
    userId: mongoose.Types.ObjectId;
    firstName: string;
    lastName: string;
    gender: string;
    mobileNumber: string;
    email: string;
    experience: number;
    city: string;
    country: string;
    systemKnown: string[];
    language: string[];
    bio: string;
    status: 'approved' | 'under_review' | 'rejected';
    specialties: string[];
    rating: number;
    isOnline: boolean;
    isBlocked: boolean;
    pricePerMin: number;
    priceRangeMin: number;
    priceRangeMax: number;
    totalChats: number;
    earnings: number;
    createdAt: Date;
}

const AstrologerSchema: Schema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    gender: { type: String, required: true },
    mobileNumber: { type: String, required: true },
    email: { type: String, required: true },
    experience: { type: Number, default: 0 },
    city: { type: String, required: true },
    country: { type: String, required: true },
    systemKnown: [{ type: String }],
    language: [{ type: String }],
    bio: { type: String },
    status: { type: String, enum: ['approved', 'under_review', 'rejected'], default: 'under_review' },
    specialties: [{ type: String }],
    rating: { type: Number, default: 0 },
    isOnline: { type: Boolean, default: false },
    isBlocked: { type: Boolean, default: false },
    pricePerMin: { type: Number, default: 20 },
    priceRangeMin: { type: Number, default: 10 },
    priceRangeMax: { type: Number, default: 100 },
    totalChats: { type: Number, default: 0 },
    earnings: { type: Number, default: 0 }
}, { timestamps: true });

export default mongoose.model<IAstrologer>('Astrologer', AstrologerSchema);

