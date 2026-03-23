
import mongoose, { Schema, Document } from 'mongoose';

export interface IStartPopup extends Document {
    imageUrl: string;          // Cloudflare R2 URL
    navigationType: 'app_route' | 'external_url' | 'none';
    navigationValue?: string;  // Route name or URL
    isActive: boolean;         // Enable/disable pop-up
    showOnStart: boolean;      // Show pop-up when app starts
    dailyLimit: number;        // Max times to show per user per day
    createdAt: Date;
    updatedAt: Date;
}

const StartPopupSchema: Schema = new Schema({
    imageUrl: { type: String, required: true },
    navigationType: {
        type: String,
        enum: ['app_route', 'external_url', 'none'],
        default: 'none'
    },
    navigationValue: { type: String },
    isActive: { type: Boolean, default: true },
    showOnStart: { type: Boolean, default: false },
    dailyLimit: { type: Number, default: 1 },
}, { timestamps: true });

// Index for efficient querying of active pop-ups
StartPopupSchema.index({ isActive: 1, createdAt: -1 });

export default mongoose.model<IStartPopup>('StartPopup', StartPopupSchema);
