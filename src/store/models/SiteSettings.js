const mongoose = require("mongoose");
const { getStoreDB } = require("../config/db");

const siteSettingsSchema = new mongoose.Schema(
  {
    siteName: {
      type: String,
      required: true,
    },

    logo: {
      type: String,
      default: "",
    },

    favicon: {
      type: String,
      default: "",
    },

    supportEmail: {
      type: String,
      default: "",
    },

    supportPhone: {
      type: String,
      default: "",
    },

    address: {
      type: String,
      default: "",
    },

    socialLinks: {
      facebook: String,
      instagram: String,
      twitter: String,
      linkedin: String,
      youtube: String,
    },

    footerText: {
      type: String,
      default: "",
    },

    seo: {
      metaTitle: String,
      metaDescription: String,
      metaKeywords: String,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

module.exports =
  getStoreDB().models.SiteSettings || getStoreDB().model("SiteSettings", siteSettingsSchema);