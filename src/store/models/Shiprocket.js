const mongoose = require("mongoose");
const { getStoreDB } = require("../config/db");

const shiprocketAccountSchema = new mongoose.Schema(
  {
    // 🔐 Login credentials
    email: {
      type: String,
      required: true,
    },

    password: {
      type: String,
      required: true,
    },

    channelId: {
      type: Number,
      required: true,
    },

    pickupLocation: {
      type: String,
      default: "Primary",
    },

    // 🔑 Token caching
    token: {
      type: String,
      default: null,
    },

    tokenExpiry: {
      type: Date,
      default: null,
    },

    // 🏷️ Marketplace support (optional)
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      default: null,
    },

    // ✅ Flags
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

module.exports =
  getStoreDB().models.Shiprocket || getStoreDB().model("Shiprocket", shiprocketAccountSchema);
