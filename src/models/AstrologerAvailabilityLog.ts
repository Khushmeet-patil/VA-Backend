import mongoose, { Schema, Document } from 'mongoose';

export interface IAstrologerAvailabilityLog extends Document {
    astrologerId: mongoose.Types.ObjectId;
    startTime: Date;
    endTime?: Date;
    duration?: number; // Duration in minutes
    date: string; // YYYY-MM-DD for simpler daily querying
}

const AstrologerAvailabilityLogSchema: Schema = new Schema({
    astrologerId: { type: Schema.Types.ObjectId, ref: 'Astrologer', required: true, index: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date },
    duration: { type: Number },
    date: { type: String, required: true, index: true }
}, { timestamps: true });

export default mongoose.model<IAstrologerAvailabilityLog>('AstrologerAvailabilityLog', AstrologerAvailabilityLogSchema);
