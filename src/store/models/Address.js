const mongoose = require("mongoose");
const { getStoreDB } = require("../config/db");

const addressSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    phone: {
      type: String,
      required: true,
      trim: true,
    },

    addressLine1: {
      type: String,
      required: true,
      trim: true,
    },

    addressLine2: {
      type: String,
      trim: true,
    },

    landmark: {
      type: String,
      trim: true,
    },

    city: {
      type: String,
      required: true,
      trim: true,
    },

    state: {
      type: String,
      required: true,
      trim: true,
    },

    country: {
      type: String,
      default: "India",
      trim: true,
    },

    pincode: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    /* ================= TYPE & LABEL ================= */
    type: {
      type: String,
      enum: [
        "home",
        "work",
        "relative",
        "friend",
        "other",
      ],
      default: "home",
    },

    label: {
      type: String,
      trim: true,
      maxlength: 50,
    },

    isDefault: {
      type: Boolean,
      default: false,
      index: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

/* ================= INDEXES ================= */
addressSchema.index({ userId: 1, isDefault: 1 });
addressSchema.index({ userId: 1, isActive: 1 });

module.exports = getStoreDB().models.Address || getStoreDB().model("Address", addressSchema);
