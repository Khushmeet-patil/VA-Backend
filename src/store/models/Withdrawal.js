const mongoose = require("mongoose");
const { getStoreDB } = require("../config/db");

const withdrawalSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
    },

    amount: {
      type: Number,
      required: true,
    },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "paid"],
      default: "pending",
      index: true,
    },

    bankDetails: {
      accountHolderName: String,
      accountNumber: String,
      ifsc: String,
      bankName: String,
    },

    adminRemark: {
      type: String,
      default: null,
    },

    paymentProof: {
      type: String,
      default: null,
    },

    approvedAmount: {
      type: Number,
      default: null,
    },

    approvedAt: Date,
    paidAt: Date,
  },
  { timestamps: true }
);

/* ======================================================
   🔒 PREVENT MULTIPLE PENDING REQUESTS (DB LEVEL)
====================================================== */
withdrawalSchema.index(
  { vendorId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "pending" },
  }
);

module.exports = getStoreDB().models.Withdrawal || getStoreDB().model("Withdrawal", withdrawalSchema);
