const mongoose = require("mongoose");
const { getStoreDB } = require("../config/db");

/* ================= ORDER ITEM (PER VENDOR) ================= */
const orderItemSchema = new mongoose.Schema(
  {
    /* -------- PRODUCT -------- */
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    image: String,

    quantity: {
      type: Number,
      required: true,
      min: 1,
    },

    /* ================= PRICING SNAPSHOT ================= */
    // These values NEVER change once order is placed

    mrp: {
      type: Number,
      required: true, // Price including GST (per unit)
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
      default: 0, // TOTAL discount for this item (qty included)
    },

    discountedPrice: {
      type: Number,
      required: true, // per unit (after discount, before GST)
    },

    gstRate: {
      type: Number,
      default: 0,
    },

    gstAmount: {
      type: Number,
      default: 0, // TOTAL GST for this item (qty included)
    },

    price: {
      type: Number,
      required: true, // FINAL price per unit (after GST)
    },

    totalPrice: {
      type: Number,
      required: true, // FINAL price * quantity
    },

    commissionRate: {
      type: Number,
      default: 0, // %
    },

    /* ================= ITEM STATUS ================= */
    status: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "processing",
        "shipped",
        "out_for_delivery",
        "delivered",
        "cancelled",
        "returned",
        "refunded",
      ],
      default: "pending",
    },

    /* ================= STATUS HISTORY ================= */
    statusHistory: [
      {
        status: {
          type: String,
          required: true,
        },
        updatedAt: {
          type: Date,
          default: Date.now,
        },
        updatedBy: {
          type: String, // vendor | admin | system
        },
        note: String,
      },
    ],

    /* ================= SHIPPING (PER ITEM) ================= */
    size: {
      type: String,
      default: null, // to track which variant size was ordered
    },

    shipping: {
      shipmentId: String,
      shiprocketOrderId: String,
      awb: String,
      courierName: String,
      trackingUrl: String,
      labelUrl: String,
      invoiceUrl: String,
      status: String,
      shippedAt: Date,
      deliveredAt: Date,
    },
  },
  { _id: true }
);

/* ================= MAIN ORDER ================= */
const orderSchema = new mongoose.Schema(
  {
    /* ================= CUSTOMER ================= */
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    /* ================= ORDER NUMBER ================= */
    orderNumber: {
      type: String,
      required: true,
      unique: true,
    },

    /* ================= ITEMS ================= */
    items: {
      type: [orderItemSchema],
      required: true,
    },

    /* ================= PRICING (ORDER LEVEL) ================= */
    subtotal: {
      type: Number,
      required: true, // after discount, before GST
    },

    discount: {
      type: Number,
      default: 0, // total discount of order
    },

    tax: {
      type: Number,
      default: 0, // total GST
    },

    shippingFee: {
      type: Number,
      default: 0,
    },

    totalAmount: {
      type: Number,
      required: true, // final payable
    },

    currency: {
      type: String,
      default: "INR",
    },

    /* ================= PAYMENT ================= */
    paymentMethod: {
      type: String,
      enum: ["razorpay", "cod", "RAZORPAY", "COD"],
      default: "razorpay",
    },

    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
    },

    paidAt: Date,

    razorpay: {
      orderId: String,
      paymentId: String,
      signature: String,
    },

    /* ================= OVERALL ORDER STATUS ================= */
    // Derived from item statuses
    orderStatus: {
      type: String,
      enum: [
        "created",
        "confirmed",
        "processing",
        "partially_shipped",
        "shipped",
        "completed",
        "cancelled",
        "pending",
      ],
      default: "created",
    },
    /* ================= COUPON (ORDER LEVEL) ================= */
    coupon: {
      couponId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Coupon",
        default: null,
      },
      code: {
        type: String,
      },
      discount: {
        type: Number,
        default: 0,
      },
    },

    /* ================= SHIPPING ADDRESS ================= */
    shippingAddress: {
      fullName: String,
      phone: String,
      addressLine1: String,
      addressLine2: String,
      city: String,
      state: String,
      postalCode: String,
      country: {
        type: String,
        default: "India",
      },
    },

    /* ================= REFUND (ORDER LEVEL) ================= */
    refund: {
      status: {
        type: String,
        enum: ["none", "pending", "completed"],
        default: "none",
      },
      amount: Number,
      refundedAt: Date,
    },

    /* ================= META ================= */
    notes: String,

    /* ================= KWIKSHIP DATA ================= */
    kwikship: {
      waybill: String,
      courierName: String,
      shippingLabel: String,
      routingCode: String,
      status: String,
      lastUpdated: Date,
    },
  },
  { timestamps: true }
);

/* ================= INDEXES ================= */
orderSchema.index({ createdAt: -1 });
orderSchema.index({ customerId: 1, createdAt: -1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ orderStatus: 1 });
orderSchema.index({ "items.vendorId": 1 });
orderSchema.index({ "items.status": 1 });

module.exports = getStoreDB().models.Order || getStoreDB().model("Order", orderSchema);
