import mongoose, { Schema, Document } from 'mongoose';

export interface INotification extends Document {
    title: string;
    message: string;
    type: 'info' | 'promo' | 'alert';
    audience: 'all' | 'user' | 'users' | 'astrologers';
    userId?: mongoose.Types.ObjectId; // If audience is user
    isRead: boolean;
    isScheduled: boolean;
    scheduledTime?: string; // HH:mm format for daily
    isActive: boolean;
    navigateType?: 'screen' | 'url' | 'none';
    navigateTarget?: string;
    createdAt: Date;
}

const NotificationSchema: Schema = new Schema({
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { type: String, enum: ['info', 'promo', 'alert'], default: 'info' },
    audience: { type: String, enum: ['all', 'user', 'users', 'astrologers'], default: 'all' },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    isRead: { type: Boolean, default: false },
    isScheduled: { type: Boolean, default: false },
    scheduledTime: { type: String },
    isActive: { type: Boolean, default: true },
    navigateType: { type: String, enum: ['screen', 'url', 'none'], default: 'none' },
    navigateTarget: { type: String }
}, { timestamps: true });

export default mongoose.model<INotification>('Notification', NotificationSchema);
