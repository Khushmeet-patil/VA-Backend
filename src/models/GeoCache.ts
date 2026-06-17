import mongoose, { Schema, Document } from 'mongoose';

export interface IGeoCache extends Document {
    query: string; // Normalized query (lowercase, trimmed)
    place_id: string; // Google Place ID
    place_name: string; // Full formatted place name
    latitude: number;
    longitude: number;
    timezone_id: string; // "Asia/Kolkata"
    timezone: string; // "5.5"
    country_code: string; // e.g. "IN"
    createdAt: Date;
}

const GeoCacheSchema: Schema = new Schema({
    query: { type: String, required: true, unique: true, index: true },
    place_id: { type: String, index: true },
    place_name: { type: String, required: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    timezone_id: { type: String, default: 'Asia/Kolkata' },
    timezone: { type: String, default: '5.5' },
    country_code: { type: String, default: 'IN' },
    createdAt: { type: Date, default: Date.now, expires: '30d' } // Automatically clear cache after 30 days
});

export default mongoose.model<IGeoCache>('GeoCache', GeoCacheSchema);
