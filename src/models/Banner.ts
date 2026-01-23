
import mongoose, { Schema, Document } from 'mongoose';

export interface IBanner extends Document {
    imageUrl: string;          // Cloudflare R2 URL
    navigationType: 'app_route' | 'external_url' | 'none';
    navigationValue?: string;  // Route name or URL
    isActive: boolean;         // Enable/disable banner
    createdAt: Date;
    updatedAt: Date;
}

const BannerSchema: Schema = new Schema({
    imageUrl: { type: String, required: true },
    navigationType: {
        type: String,
        enum: ['app_route', 'external_url', 'none'],
        default: 'none'
    },
    navigationValue: { type: String },
    isActive: { type: Boolean, default: true },
}, { timestamps: true });

// Index for efficient querying of active banners
BannerSchema.index({ isActive: 1, createdAt: -1 });

export default mongoose.model<IBanner>('Banner', BannerSchema);
