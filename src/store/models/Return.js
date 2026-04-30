const mongoose = require("mongoose");
const { getStoreDB } = require("../config/db");

const returnSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    items: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        name: String,
        quantity: Number,
        price: Number,
        image: String,
      },
    ],
    type: {
      type: String,
      enum: ["return", "replace"],
      required: true,
    },
    reason: {
      type: String,
      required: true,
    },
    images: [String],
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "completed"],
      default: "pending",
    },

    /* ================= KWIKSHIP (REVERSE SHIPMENT) ================= */
    kwikship: {
      waybill: String,
      courierName: String,
      shippingLabel: String,
      routingCode: String,
      status: String,
      shipmentCode: String,
      createdAt: Date,
      lastUpdated: Date,
    },

    /* ================= REPLACEMENT FORWARD SHIPMENT ================= */
    // Populated only when type === "replace" and the reverse leg is delivered.
    replacementShipment: {
      waybill: String,
      courierName: String,
      shippingLabel: String,
      status: String,
      shipmentCode: String,
      createdAt: Date,
      lastUpdated: Date,
    },

    /* ================= REFUND ================= */
    // Populated only when type === "return" and reverse leg is delivered.
    refund: {
      status: {
        type: String,
        enum: ["none", "pending", "completed", "manual_pending", "failed"],
        default: "none",
      },
      amount: Number,
      method: { type: String, enum: ["razorpay", "manual"] },
      razorpayRefundId: String,
      processedAt: Date,
      note: String,
    },
  },
  { timestamps: true }
);

module.exports = getStoreDB().models.Return || getStoreDB().model("Return", returnSchema);
