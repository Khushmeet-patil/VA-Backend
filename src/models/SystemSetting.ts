import mongoose, { Schema, Document } from 'mongoose';

export interface ISystemSetting extends Document {
    key: string;
    value: any;
    description?: string;
    createdAt: Date;
    updatedAt: Date;
}

const SystemSettingSchema: Schema = new Schema({
    key: { type: String, required: true, unique: true },
    value: { type: Schema.Types.Mixed, required: true },
    description: { type: String }
}, { timestamps: true });

export default mongoose.model<ISystemSetting>('SystemSetting', SystemSettingSchema);
