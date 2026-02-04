import mongoose, { Schema, Document } from 'mongoose';

export interface ISkill extends Document {
    name: string;
    createdAt: Date;
    updatedAt: Date;
}

const SkillSchema: Schema = new Schema({
    name: { type: String, required: true, unique: true, trim: true },
}, { timestamps: true });

export default mongoose.model<ISkill>('Skill', SkillSchema);
