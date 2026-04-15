const mongoose = require("mongoose");
const { getStoreDB } = require("../config/db");

const changeRequestSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["product", "coupon"],
      required: true,
    },

    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "typeModel",
    },

    typeModel: {
      type: String,
      required: true,
      enum: ["Product", "Coupon"],
    },

    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
    },

    oldData: {
      type: Object,
      required: true,
    },

    newData: {
      type: Object,
      required: true,
    },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },

    rejectionReason: {
      type: String,
      default: null,
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // admin
    },

    reviewedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

module.exports = getStoreDB().models.ChangeRequest || getStoreDB().model("ChangeRequest", changeRequestSchema);
