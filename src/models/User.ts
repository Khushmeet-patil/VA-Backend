
import mongoose, { Schema, Document } from 'mongoose';


export interface IUser extends Document {
    mobile: string;
    password?: string;
    name?: string;
    dob?: string;
    tob?: string;
    pob?: string;
    otp?: string;
    otpExpires?: Date;
    isVerified: boolean;
    role: 'user' | 'admin' | 'astrologer';
    walletBalance: number;
    isBlocked: boolean;
    createdAt: Date;
}

const UserSchema: Schema = new Schema({
    mobile: { type: String, required: true, unique: true },
    password: { type: String },
    name: { type: String },
    dob: { type: String },
    tob: { type: String },
    pob: { type: String },
    otp: { type: String },
    otpExpires: { type: Date },
    isVerified: { type: Boolean, default: false },
    role: { type: String, enum: ['user', 'admin', 'astrologer'], default: 'user' },
    walletBalance: { type: Number, default: 0 },
    isBlocked: { type: Boolean, default: false },
}, { timestamps: true });

export default mongoose.model<IUser>('User', UserSchema);
