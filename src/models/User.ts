
import mongoose, { Schema, Document } from 'mongoose';

// Birth profile interface for storing multiple profiles per user
export interface IBirthProfile {
    _id?: mongoose.Types.ObjectId;
    name: string;
    gender: string;
    dateOfBirth: string;  // ISO date string
    timeOfBirth: string;  // HH:mm format
    placeOfBirth: string;
    lat?: number;
    lon?: number;
    timezone?: string;
    createdAt: Date;
}

export interface IUser extends Document {
    mobile: string;
    password?: string;
    name?: string;
    gender?: string;  // User's gender
    dob?: string;
    tob?: string;
    pob?: string;
    lat?: number;
    lon?: number;
    timezone?: string;
    profilePhoto?: string;  // R2 URL or base64 (legacy) profile picture
    otp?: string;
    otpExpires?: Date;
    isVerified: boolean;
    role: 'user' | 'admin' | 'astrologer';
    walletBalance: number;
    isBlocked: boolean;
    hasUsedFreeTrial: boolean;  // True after user has used their one-time free trial chat
    birthProfiles: IBirthProfile[];  // Saved birth profiles for chat intake
    fcmToken?: string;  // Firebase Cloud Messaging token for push notifications
    fcmTokenUpdatedAt?: Date;  // When the FCM token was last updated
    createdAt: Date;
}

const BirthProfileSchema: Schema = new Schema({
    name: { type: String, required: true },
    gender: { type: String, required: true },
    dateOfBirth: { type: String, required: true },
    timeOfBirth: { type: String, required: true },
    placeOfBirth: { type: String, required: true },
    lat: { type: Number },
    lon: { type: Number },
    timezone: { type: String },
    createdAt: { type: Date, default: Date.now }
});

const UserSchema: Schema = new Schema({
    mobile: { type: String, required: true, unique: true },
    password: { type: String }, // Optional now as we use OTP only
    name: { type: String },
    gender: { type: String },
    dob: { type: String },
    tob: { type: String },
    pob: { type: String },
    lat: { type: Number },
    lon: { type: Number },
    timezone: { type: String },
    profilePhoto: { type: String },  // R2 URL or base64 (legacy) profile picture
    otp: { type: String },
    otpExpires: { type: Date },
    isVerified: { type: Boolean, default: false },
    role: { type: String, enum: ['user', 'admin', 'astrologer'], default: 'user' },
    walletBalance: { type: Number, default: 0 },
    isBlocked: { type: Boolean, default: false },
    hasUsedFreeTrial: { type: Boolean, default: false },
    birthProfiles: { type: [BirthProfileSchema], default: [] },
    fcmToken: { type: String },  // Firebase Cloud Messaging token
    fcmTokenUpdatedAt: { type: Date },  // When FCM token was last updated
}, { timestamps: true });

export default mongoose.model<IUser>('User', UserSchema);

