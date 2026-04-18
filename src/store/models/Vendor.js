const mongoose = require("mongoose");
const { getStoreDB } = require("../config/db");

const vendorSchema = new mongoose.Schema(
  {
    /* ================= BASIC ================= */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
      default: null,
    },

    /* ================= BUSINESS ================= */
    businessType: {
      type: String,
      enum: ["individual", "partnership", "private_limited", "public_limited"],
      required: true,
    },
    businessName: {
      type: String,
      required: true,
    },
    businessDescription: {
      type: String,
      required: true,
    },
    businessCategory: {
      type: [String],
      default: [],
    },
    businessSubcategory: String,

    /* ================= STORE ================= */
    storeName: {
      type: String,
      required: true,
    },
    storeDescription: {
      type: String,
      default: "",
    },
    storePhone: {
      type: String,
      required: true,
    },
    storeEmail: {
      type: String,
      required: true,
    },
    storeWebsite: String,

    /* ================= LEGAL / COMPLIANCE (APPROVED DATA) ================= */
    businessLicense: {
      type: String,
      required: true,
    },
    businessLicenseNumber: {
      type: String,
      required: true,
    },
    businessLicenseExpiry: {
      type: Date,
      required: true,
    },
    taxId: {
      type: String,
      required: true,
    },
    gstNumber: String,
    pan: String,

    /* ================= ADDRESS ================= */
    businessAddress: {
      street: String,
      city: String,
      state: String,
      postalCode: String,
      country: String,
    },

    /* ================= PICKUP ADDRESS (KWIKSHIP) ================= */
    // Warehouse / pickup location used when generating Kwikship waybills.
    // Falls back to businessAddress + storeName/storePhone when not set.
    pickupAddress: {
      name: String,
      email: String,
      phone: String,
      alternatePhone: String,
      address1: String,
      address2: String,
      pincode: String,
      city: String,
      state: String,
      stateCode: String,
      country: { type: String, default: "India" },
      countryCode: { type: String, default: "IN" },
      gstin: String,
    },

    /* ================= BANK (APPROVED DATA) ================= */
    bankAccountName: {
      type: String,
      required: true,
    },
    bankAccountNumber: {
      type: String,
      required: true,
    },
    bankIFSCCode: {
      type: String,
      required: true,
    },
    bankName: {
      type: String,
      required: true,
    },
    accountType: {
      type: String,
      enum: ["savings", "current"],
      required: true,
    },

    /* ================= DOCUMENTS (APPROVED DATA) ================= */
    documentsUploaded: {
      businessLicense: String,
      idProof: String,
      addressProof: String,
      cancelledCheque: String,
    },

    /* =====================================================
       🔁 PENDING UPDATES (WAITING FOR ADMIN VERIFICATION)
       ===================================================== */
    pendingUpdates: {
      // Compliance
      gstNumber: String,
      pan: String,
      taxId: String,

      // Bank
      bankAccountName: String,
      bankAccountNumber: String,
      bankIFSCCode: String,
      bankName: String,
      accountType: {
        type: String,
        enum: ["savings", "current"],
      },

      // Documents
      documentsUploaded: {
        businessLicense: String,
        idProof: String,
        addressProof: String,
        cancelledCheque: String,
      },

      updatedAt: Date,
    },

    /* ================= STATUS ================= */
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "suspended"],
      default: "pending",
    },
    approvalNotes: String,
    rejectionReason: String,

    /* ================= METRICS (SUMMARY / CACHE) ================= */
    commissionRate: {
      type: Number,
      default: 5,
    },
    wallet: {
      type: Number,
      default: 0,
    },
    rating: {
      type: Number,
      default: 0,
    },

    verificationStage: {
      type: String,
      enum: [
        "application", // initial vendor apply
        "reverification", // sensitive data update
        null,
      ],
      default: null,
    },

    // (Derived – can be recalculated anytime)
    totalProducts: {
      type: Number,
      default: 0,
    },
    totalOrders: {
      type: Number,
      default: 0,
    },
    totalSales: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

module.exports =
  getStoreDB().models.Vendor || getStoreDB().model("Vendor", vendorSchema);
