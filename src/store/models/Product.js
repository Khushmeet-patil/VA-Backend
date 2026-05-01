const mongoose = require("mongoose");
const { getStoreDB } = require("../config/db");


const productSchema = new mongoose.Schema(
  {
    /* ================= BASIC INFO ================= */
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
    },

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },

    shortDescription: String,
    description: String,

    /* ================= PRICING ================= */
     pricing: {
       mrp: {
         type: Number,
         required: true, // Total Price including GST
         min: 0,
       },
 
       discountType: {
         type: String,
         enum: ["percentage", "flat", "none"],
         default: "none",
       },
 
       discountValue: {
         type: Number,
         default: 0,
       },
 
       discountAmount: {
         type: Number,
         default: 0, // Calculated discount
       },
 
       discountedPrice: {
         type: Number,
         required: true, // Price after discount, before GST (for internal use)
         min: 0,
       },
 
       gstRate: {
        type: Number,
        required: true, // 3, 5, 12, 18
      },

      gstAmount: {
        type: Number,
        default: 0,
      },

      finalPrice: {
        type: Number,
        required: true, // USER PAYS THIS
        min: 0,
      },
    },

    /* ================= MEDIA ================= */
    images: [
      {
        type: String,
        trim: true,
      },
    ],

    /* ================= STOCK ================= */
    sku: {
      type: String,
      unique: true,
      sparse: true, // allows null values
    },

    stock: {
      type: Number,
      default: 0,
      min: 0,
    },

    inStock: {
      type: Boolean,
      default: true,
    },

    /* ================= ASTROLOGY DATA ================= */
    rashi: [String],
    planet: [String],
    benefits: [String],
    whoShouldUse: String,
    tags: [String],

    /* ================= GEMSTONE / ITEM DETAILS ================= */
    material: String,
    weight: String,
    size: String,

    /* ================= VARIANTS ================= */
    variantName: {
      type: String,
      default: "Size",
    },
    variants: [
      {
        size: {
          type: String,
          required: true,
        },
        stock: {
          type: Number,
          default: 0,
          min: 0,
        },
      },
    ],
    specifications: [
      {
        key: { type: String, trim: true },
        value: { type: String, trim: true },
      },
    ],
    detailedInfo: {
      benefits: {
        content: { type: String, default: "" },
        show: { type: Boolean, default: false }
      },
      howToWear: {
        content: { type: String, default: "" },
        show: { type: Boolean, default: false }
      },
      bestDayToWear: {
        content: { type: String, default: "" },
        show: { type: Boolean, default: false }
      },
      mythology: {
        content: { type: String, default: "" },
        show: { type: Boolean, default: false }
      },
      careInstructions: {
        content: { type: String, default: "" },
        show: { type: Boolean, default: false }
      },
      returnsExchange: {
        content: { type: String, default: "" },
        show: { type: Boolean, default: false }
      },
      customSections: [
        {
          title: { type: String, required: true },
          content: { type: String, required: true },
          show: { type: Boolean, default: true }
        }
      ]
    },

    certified: {
      type: Boolean,
      default: false,
    },
    certificateImage: {
      type: String,
      default: null,
    },
    freeDelivery: {
      type: Boolean,
      default: true,
    },
    fastDelivery: {
      type: Number,
      default: 0, // days
    },
    returnPolicy: {
      type: Boolean,
      default: false,
    },
    returnDays: {
      type: Number,
      default: 7, // days
    },
    xRayTested: {
      type: Boolean,
      default: false
    },

    /* ================= FLAGS ================= */
    featured: {
      type: Boolean,
      default: false,
      index: true,
    },

    status: {
      type: Boolean,
      default: true, // active / inactive
    },
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
    },
    purposes: [
      {
        type: String,
        index: true,
      },
    ],


    /* ================= APPROVAL FLOW (BEST PRACTICE) ================= */
    approval: {
      status: {
        type: String,
        enum: ["pending", "approved", "rejected"],
        default: "pending",
        index: true,
      },

      reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User", // admin
      },

      reviewedAt: {
        type: Date,
      },

      rejectionReason: {
        type: String,
        default: null,
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

productSchema.virtual("isVisible").get(function () {
  return this.status === true && this.approval.status === "approved";
});

productSchema.index({ "approval.status": 1, status: 1 });
productSchema.index({ category: 1, featured: 1 });
productSchema.index({
  name: "text",
  slug: "text",
  shortDescription: "text",
  description: "text",
});

module.exports = getStoreDB().models.Product || getStoreDB().model("Product", productSchema);
