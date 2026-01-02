import mongoose, { Schema, Document } from 'mongoose';

export interface ITransaction extends Document {
    fromUser: mongoose.Types.ObjectId;
    toAstrologer?: mongoose.Types.ObjectId; // Optional if it's a platform fee or wallet load
    amount: number;
    type: 'credit' | 'debit';
    status: 'success' | 'failed' | 'pending';
    description: string;
    createdAt: Date;
}

const TransactionSchema: Schema = new Schema({
    fromUser: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    toAstrologer: { type: Schema.Types.ObjectId, ref: 'Astrologer' },
    amount: { type: Number, required: true },
    type: { type: String, enum: ['credit', 'debit'], required: true },
    status: { type: String, enum: ['success', 'failed', 'pending'], default: 'pending' },
    description: { type: String }
}, { timestamps: true });

export default mongoose.model<ITransaction>('Transaction', TransactionSchema);
