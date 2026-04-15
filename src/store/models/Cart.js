const mongoose = require("mongoose");
const { getStoreDB } = require("../config/db");

const cartItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },

    priceAtAdd: {
      type: Number,
      required: true,
    },
    size: {
      type: String,
      default: null,
    },
  },
  { _id: false }
);

const cartSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },

    items: [cartItemSchema],

    subtotal: {
      type: Number,
      default: 0,
    },

    totalItems: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = getStoreDB().models.Cart || getStoreDB().model("Cart", cartSchema);
