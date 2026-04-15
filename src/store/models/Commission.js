const mongoose = require("mongoose");
const { getStoreDB } = require("../config/db");

const commissionSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },

    orderItemId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
      index: true,
    },

    amount: {
      type: Number,
      required: true, // final item amount
    },

    commissionRate: {
      type: Number,
      required: true, // %
    },

    commissionAmount: {
      type: Number,
      required: true,
    },

    vendorEarning: {
      type: Number,
      required: true,
    },

    status: {
      type: String,
      enum: ["pending", "credited"],
      default: "pending",
    },

    creditedAt: Date,
  },
  { timestamps: true }
);

module.exports = getStoreDB().models.Commission || getStoreDB().model("Commission", commissionSchema);
