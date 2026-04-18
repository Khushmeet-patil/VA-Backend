const mongoose = require("mongoose");
const { getStoreDB } = require("../config/db");

const kwikshipAccountSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
    },

    password: {
      type: String,
      required: true,
    },

    // 🔑 Token caching
    token: {
      type: String,
      default: null,
    },

    tokenExpiry: {
      type: Date,
      default: null,
    },

    // ✅ Flags
    isActive: {
      type: Boolean,
      default: true,
    },

    isDev: {
      type: Boolean,
      default: false,
    }
  },
  {
    timestamps: true,
  },
);

module.exports =
  getStoreDB().models.Kwikship || getStoreDB().model("Kwikship", kwikshipAccountSchema);
