import mongoose, { Schema, Document } from 'mongoose';

export interface IAstrologerNotificationLog extends Document {
    astrologerId: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    sentAt: Date;
}

const AstrologerNotificationLogSchema: Schema = new Schema({
    astrologerId: {
        type: Schema.Types.ObjectId,
        ref: 'Astrologer',
        required: true,
        index: true
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    sentAt: {
        type: Date,
        default: Date.now,
        index: true
    }
}, { timestamps: true });

// Index for quick lookup of the last notification sent to a user by an astrologer
AstrologerNotificationLogSchema.index({ astrologerId: 1, userId: 1, sentAt: -1 });

export default mongoose.model<IAstrologerNotificationLog>('AstrologerNotificationLog', AstrologerNotificationLogSchema);
