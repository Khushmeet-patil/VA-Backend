const mongoose = require("mongoose");
const { getStoreDB } = require("../config/db");

const liveTempleSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    liveUrl: {
      type: String,
      required: true,
      trim: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = getStoreDB().models.LiveTemple || getStoreDB().model("LiveTemple", liveTempleSchema);
