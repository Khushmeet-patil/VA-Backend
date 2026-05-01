const mongoose = require("mongoose");
const { getStoreDB } = require("../config/db");

const purposeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    image: {
      type: String,
      default: null,
    },
    color: {
      type: String,
      default: "#000000",
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

module.exports = getStoreDB().models.Purpose || getStoreDB().model("Purpose", purposeSchema);
