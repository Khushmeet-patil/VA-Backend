const mongoose = require("mongoose");
const { getStoreDB } = require("../config/db");

const activitySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true, // ORDER_CREATED, VENDOR_APPROVED, etc
    },

    title: {
      type: String,
      required: true,
    },

    description: {
      type: String,
    },

    amount: {
      type: Number, // revenue, payout, etc (optional)
    },

    role: {
      type: String,
      enum: ["admin", "vendor", "customer"],
      required: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
    },

    metadata: {
      type: Object,
    },
  },
  { timestamps: true }
);

module.exports =
  getStoreDB().models.Activity || getStoreDB().model("Activity", activitySchema);
