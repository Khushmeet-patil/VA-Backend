const mongoose = require("mongoose");
const { getStoreDB } = require("../config/db");

const ratingSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: function() { return !this.isManual; },
      index: true,
    },

    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: function() { return !this.isManual; },
      index: true,
    },

    isManual: {
      type: Boolean,
      default: false,
    },

    manualUserName: {
      type: String,
      trim: true,
    },

    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },

    review: {
      type: String,
      trim: true,
      maxlength: 1000,
    },

    images: {
      type: [String],
      validate: {
        validator: function (val) {
          return val.length <= 5;
        },
        message: "Maximum 5 review images allowed",
      },
      default: [],
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

ratingSchema.index({ productId: 1, userId: 1 }, { 
  unique: true, 
  partialFilterExpression: { isManual: false } 
});

module.exports = getStoreDB().models.Rating || getStoreDB().model("Rating", ratingSchema);
