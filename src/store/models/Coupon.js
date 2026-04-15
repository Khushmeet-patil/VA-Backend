const mongoose = require("mongoose");
const { getStoreDB } = require("../config/db");

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
    },

    discountType: {
      type: String,
      enum: ["percentage", "flat"],
      required: true,
    },

    discountValue: {
      type: Number,
      required: true,
    },

    maxDiscount: {
      type: Number,
    },

    minOrderAmount: {
      type: Number,
      default: 0,
    },

    validFrom: {
      type: Date,
      required: true,
    },

    validTill: {
      type: Date,
      required: true,
    },

    usageLimit: {
      type: Number, // total usage
    },

    usedCount: {
      type: Number,
      default: 0,
    },

    perUserLimit: {
      type: Number,
      default: 1,
    },

    applicableProducts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
    ],

    applicableCategories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category",
      },
    ],

    isActive: {
      type: Boolean,
      default: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    approval: {
      status: {
        type: String,
        enum: ["pending", "approved", "rejected"],
        default: "pending",
        index: true,
      },

      reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User", // admin
      },

      reviewedAt: {
        type: Date,
      },

      rejectionReason: {
        type: String,
        default: null,
      },
    },
  },
  { timestamps: true }
);

module.exports = getStoreDB().models.Coupon || getStoreDB().model("Coupon", couponSchema);
