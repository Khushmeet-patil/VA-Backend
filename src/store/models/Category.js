const mongoose = require("mongoose");
const { getStoreDB } = require("../config/db");

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    image: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports =
  getStoreDB().models.Category || getStoreDB().model("Category", categorySchema, "categories");
