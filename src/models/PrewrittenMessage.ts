import mongoose, { Schema, Document } from 'mongoose';

export interface IPrewrittenMessage extends Document {
    text: string;
    createdAt: Date;
    updatedAt: Date;
}

const PrewrittenMessageSchema: Schema = new Schema({
    text: { type: String, required: true, trim: true }
}, { timestamps: true });

export default mongoose.model<IPrewrittenMessage>('PrewrittenMessage', PrewrittenMessageSchema);
