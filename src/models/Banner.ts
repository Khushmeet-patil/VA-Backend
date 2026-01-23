
import mongoose, { Schema, Document } from 'mongoose';

export interface IBanner extends Document {
    imageUrl: string;          // Cloudflare R2 URL
    title?: string;            // Optional banner title
    subtitle?: string;         // Optional banner subtitle
    backgroundColor?: string;  // Background color (fallback/overlay)
    navigationType: 'app_route' | 'external_url' | 'none';
    navigationValue?: string;  // Route name or URL
    isActive: boolean;         // Enable/disable banner
    order: number;             // Display order
    createdAt: Date;
    updatedAt: Date;
}

const BannerSchema: Schema = new Schema({
    imageUrl: { type: String, required: true },
    title: { type: String },
    subtitle: { type: String },
    backgroundColor: { type: String, default: '#FF6B00' },
    navigationType: {
        type: String,
        enum: ['app_route', 'external_url', 'none'],
        default: 'none'
    },
    navigationValue: { type: String },
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
}, { timestamps: true });

// Index for efficient querying of active banners sorted by order
BannerSchema.index({ isActive: 1, order: 1 });

export default mongoose.model<IBanner>('Banner', BannerSchema);
