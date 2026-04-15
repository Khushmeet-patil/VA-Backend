const mongoose = require("mongoose");
const { getStoreDB } = require("../config/db");

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      select: false,
    },
    role: {
      type: String,
      enum: ["customer", "admin", "vendor", "user", "astrologer"],
      default: "customer",
    },
    profilePhoto: {
      type: String,
      default: "",
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    mobile: {
      type: String,
      required: false,
      unique: true,
      sparse: true,
    },
    // Wishlist (embedded subdocuments)
    wishlist: {
      type: [
        {
          product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            required: true,
          },
          quantity: { type: Number, default: 1 },
          size: { type: String, default: null },
        },
      ],
      default: [],
    },
    // Reset Password Fields
    resetPasswordToken: String,
    resetPasswordExpire: Date,
    // Vendor specific (first-time password set)
    setPasswordToken: String,
    setPasswordExpire: Date,
  },
  { timestamps: true }
);

// Map _id to id for JSON responses if needed
userSchema.virtual("id").get(function () {
  return this._id.toHexString();
});

userSchema.set("toJSON", {
  virtuals: true,
});

module.exports = getStoreDB().models.User || getStoreDB().model("User", userSchema);
