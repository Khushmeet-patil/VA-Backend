import mongoose, { Schema, Document } from 'mongoose';

/**
 * PaymentBatch Model
 * Records each batch of withdrawal payments processed by admin
 */
export interface IPaymentBatch extends Document {
    withdrawalIds: mongoose.Types.ObjectId[];
    astrologerIds: mongoose.Types.ObjectId[];
    totalAmount: number;
    totalEntries: number;
    paidAt: Date;
    notes?: string;
    paidBy: string;
    createdAt: Date;
    updatedAt: Date;
}

const PaymentBatchSchema: Schema = new Schema({
    withdrawalIds: [{
        type: Schema.Types.ObjectId,
        ref: 'Withdrawal',
        required: true
    }],
    astrologerIds: [{
        type: Schema.Types.ObjectId,
        ref: 'Astrologer',
        required: true
    }],
    totalAmount: {
        type: Number,
        required: true,
        min: 0
    },
    totalEntries: {
        type: Number,
        required: true,
        min: 1
    },
    paidAt: {
        type: Date,
        default: Date.now
    },
    notes: {
        type: String,
        default: ''
    },
    paidBy: {
        type: String,
        default: 'Admin'
    }
}, { timestamps: true });

PaymentBatchSchema.index({ paidAt: -1 });

export default mongoose.model<IPaymentBatch>('PaymentBatch', PaymentBatchSchema);
