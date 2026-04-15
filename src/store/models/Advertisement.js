const mongoose = require("mongoose");
const { getStoreDB } = require("../config/db");

const advertisementSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Index for efficient querying of active advertisements
advertisementSchema.index({ isActive: 1, createdAt: -1 });

module.exports = getStoreDB().models.Advertisement || getStoreDB().model("Advertisement", advertisementSchema);
