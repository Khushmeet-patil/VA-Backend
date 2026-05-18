import mongoose, { Schema, Document } from 'mongoose';

export interface INotification extends Document {
    title: string;
    message: string;
    type: 'info' | 'promo' | 'alert';
    audience: 'all' | 'user' | 'users' | 'astrologers';
    userId?: mongoose.Types.ObjectId; // If audience is user
    imageUrl?: string; // Optional image URL uploaded to R2
    isRead: boolean;
    readBy: mongoose.Types.ObjectId[];
    isScheduled: boolean;
    scheduledTime?: string; // HH:mm format for daily
    startDate?: Date; // Optional start date for daily scheduling
    endDate?: Date; // Optional end date for daily scheduling
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
    imageUrl: { type: String },
    isRead: { type: Boolean, default: false },
    readBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    isScheduled: { type: Boolean, default: false },
    scheduledTime: { type: String },
    startDate: { type: Date },
    endDate: { type: Date },
    isActive: { type: Boolean, default: true },
    navigateType: { type: String, enum: ['screen', 'url', 'none'], default: 'none' },
    navigateTarget: { type: String }
}, { timestamps: true });

export default mongoose.model<INotification>('Notification', NotificationSchema);

