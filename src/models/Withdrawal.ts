import mongoose, { Schema, Document } from 'mongoose';

/**
 * Withdrawal Model
 * Tracks withdrawal requests from astrologers
 */
export interface IWithdrawal extends Document {
    astrologerId: mongoose.Types.ObjectId;
    amount: number;
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAID';
    requestedAt: Date;
    processedAt?: Date;
    notes?: string;
    createdAt: Date;
    updatedAt: Date;
}

const WithdrawalSchema: Schema = new Schema({
    astrologerId: {
        type: Schema.Types.ObjectId,
        ref: 'Astrologer',
        required: true,
        index: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    status: {
        type: String,
        enum: ['PENDING', 'APPROVED', 'REJECTED', 'PAID'],
        default: 'PENDING',
        index: true
    },
    requestedAt: {
        type: Date,
        default: Date.now
    },
    processedAt: {
        type: Date
    },
    notes: {
        type: String
    }
}, { timestamps: true });

// Compound index for astrologer's withdrawal history
WithdrawalSchema.index({ astrologerId: 1, requestedAt: -1 });

export default mongoose.model<IWithdrawal>('Withdrawal', WithdrawalSchema);
