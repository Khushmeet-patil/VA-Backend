const mongoose = require("mongoose");
const { getStoreDB } = require("../config/db");

const bannerSchema = new mongoose.Schema(
  {
    image: {
      type: String,
      required: true,
    },

    category: {
      type: String,
      default: null,
    },
    type: {
      type: String,
      enum: ["main", "contextual"],
      default: "main",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    linkType: {
      type: String,
      enum: ["none", "app_screen", "product"],
      default: "none",
    },
    linkValue: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = getStoreDB().models.Banner || getStoreDB().model("Banner", bannerSchema);
