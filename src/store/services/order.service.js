const crypto = require("crypto");
const Order = require("../models/Order");
const Product = require("../models/Product");
const Cart = require("../models/Cart");
const activityService = require("../services/activity.service");
const razorpay = require("../utils/razorpay");
const sendEmail = require("../utils/email/sendEmail");
const newOrderReceivedTemplate = require("../utils/email/templates/newOrderReceivedTemplate");
const orderStatusUpdateTemplate = require("../utils/email/templates/orderStatusUpdateTemplate");
const EMAIL_SUBJECTS = require("../constants/emailSubjects");
const generateOrderNumber = require("../utils/generateOrderNumber");
const commissionService = require("../services/commission.service");
const logger = require("../utils/logger");
const mongoose = require("mongoose");
const Vendor = require("../models/Vendor");
const { validateAndApplyCoupon } = require("./coupon.service");
const CouponUsage = require("../models/CouponUsage");
const { default: KwikshipService, createFullShipment } = require("./kwikship.service");

/* =====================================================
   CREATE ORDER
===================================================== */
exports.createOrder = async ({
  customerId,
  items,
  shippingAddress,
  paymentMethod = "razorpay",
  notes,
  couponCode,
  paymentStatus = "pending",
  orderStatus = "pending",
  razorpayData = null,
}) => {
  if (!items || !items.length) {
    throw new Error("No items in order");
  }

  const orderNumber = await generateOrderNumber();

  const safeItems = [];
  let subtotal = 0;
  let productDiscount = 0;
  let totalGst = 0;
  let totalAmount = 0;
  const vendorMap = {};

  for (const item of items) {
    const product = await Product.findById(item.productId);
    if (!product) throw new Error("Product not found");

    const vendor = await Vendor.findById(product.vendorId);
    if (!vendor) throw new Error("Vendor not found");

    const qty = Number(item.quantity);
    const p = product.pricing;

    const mrp = p.mrp || p.basePrice || 0;
    const discountPerUnit = p.discountAmount || 0;
    const discountedPrice = p.discountedPrice || (p.finalPrice - p.gstAmount);
    const gstPerUnit = p.gstAmount || 0;
    const finalPrice = p.finalPrice;

    /* ================= STOCK CHECK ================= */
    if (item.size) {
      const variant = product.variants.find(v => v.size === item.size);
      if (!variant || variant.stock < qty) {
        throw new Error(`Insufficient stock for ${product.name} (Size: ${item.size})`);
      }
    } else if (product.stock < qty) {
      throw new Error(`Insufficient stock for ${product.name}`);
    }

    subtotal += discountedPrice * qty;
    productDiscount += discountPerUnit * qty;
    totalGst += gstPerUnit * qty;
    totalAmount += finalPrice * qty;

    const orderItem = {
      productId: product._id,
      vendorId: vendor._id,
      name: product.name,
      image: product.images?.[0] || null,
      quantity: qty,
      mrp,
      basePrice: mrp, // legacy fallback 
      discountedPrice,
      discountAmount: discountPerUnit * qty,
      gstAmount: gstPerUnit * qty,
      price: finalPrice,
      totalPrice: finalPrice * qty,
      size: item.size || null,
      commissionRate: vendor.commissionRate || 10,
      status: orderStatus === "confirmed" ? "confirmed" : "pending",
    };

    safeItems.push(orderItem);

    vendorMap[vendor.storeEmail] ??= {
      vendorName: vendor.storeName,
      items: [],
    };
    vendorMap[vendor.storeEmail].items.push(orderItem);
  }

  const { discount: couponDiscount, coupon } = await validateAndApplyCoupon({
    couponCode,
    customerId,
    subtotal,
  });

  const payableAmount = Math.max(totalAmount - couponDiscount, 0);

  const order = await Order.create({
    customerId,
    orderNumber,
    items: safeItems,
    subtotal,
    discount: productDiscount + couponDiscount,
    coupon: coupon
      ? { couponId: coupon._id, code: coupon.code, discount: couponDiscount }
      : null,
    tax: totalGst,
    shippingFee: 0,
    totalAmount: payableAmount,
    currency: "INR",
    paymentMethod,
    paymentStatus,
    orderStatus,
    razorpay: razorpayData,
    shippingAddress,
    notes,
    paidAt: paymentStatus === "paid" ? new Date() : null,
  });

  /* ✅ DECREMENT STOCK */
  try {
    await decrementStock(safeItems);
  } catch (stockError) {
    logger.error("Stock decrement failed", { orderId: order._id, error: stockError.message });
    // In a production app, we might want to handle this more strictly (e.g. failing the order creation if stock is insufficient)
    // but for now, we'll log it to avoid blocking order creation if DB is slow but order is paid.
  }

  return { order, vendorMap };
};

/**
 * Atomic stock decrement helper (Enterprise Level)
 * Decrements both root stock and variant stock if applicable.
 */
async function decrementStock(items) {
  for (const item of items) {
    try {
      const updateQuery = { $inc: { stock: -item.quantity } };
      
      // If it's a variant (size based), decrement that variant's stock too
      if (item.size) {
        updateQuery.$inc["variants.$[elem].stock"] = -item.quantity;
      }

      await Product.updateOne(
        { _id: item.productId },
        updateQuery,
        {
          arrayFilters: item.size ? [{ "elem.size": item.size }] : [],
          runValidators: true
        }
      );
    } catch (err) {
      logger.error(`Failed to decrement stock for product ${item.productId}`, err);
    }
  }
}

/* =====================================================
   CUSTOMER ORDERS
===================================================== */
exports.getCustomerOrders = async (customerId) => {
  const orders = await Order.find({ customerId })
    .sort({ createdAt: -1 })
    .lean();

  return orders.map((order) => ({
    _id: order._id,
    orderNumber: order.orderNumber,
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    createdAt: order.createdAt,

    summary: {
      totalItems: order.items.reduce((s, i) => s + i.quantity, 0),
      subtotal: order.subtotal,
      discount: order.discount,
      tax: order.tax,
      shippingFee: order.shippingFee,
      totalAmount: order.totalAmount,
    },

    items: order.items.map((item) => ({
      _id: item._id,
      productId: item.productId,
      vendorId: item.vendorId,

      name: item.name,
      image: item.image,
      quantity: item.quantity,

      basePrice: item.basePrice,
      discountType: item.discountType,
      discountValue: item.discountValue,
      discountAmount: item.discountAmount,
      discountedPrice: item.discountedPrice,

      gstRate: item.gstRate,
      gstAmount: item.gstAmount,

      price: item.price,
      totalPrice: item.totalPrice,

      status: item.status,
    })),

    shippingAddress: order.shippingAddress,
  }));
};

/* =====================================================
   VENDOR ORDERS
===================================================== */
exports.getVendorOrders = async (vendorId) => {
  const [orders, vendor] = await Promise.all([
    Order.find({ "items.vendorId": vendorId })
      .populate("customerId", "firstName lastName email")
      .sort({ createdAt: -1 })
      .lean(),
    Vendor.findById(vendorId).select("commissionRate")
  ]);

  const currentCommission = vendor?.commissionRate || 10;

  return orders.map((order) => ({
    _id: order._id,
    orderNumber: order.orderNumber,
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    createdAt: order.createdAt,
    customer: order.customerId,

    items: order.items
      .filter((i) => i.vendorId.toString() === vendorId.toString())
      .map((item) => ({
        _id: item._id,
        name: item.name,
        image: item.image,
        quantity: item.quantity,

        basePrice: item.basePrice,
        discountType: item.discountType,
        discountValue: item.discountValue,
        discountAmount: item.discountAmount,
        discountedPrice: item.discountedPrice,

        gstRate: item.gstRate,
        gstAmount: item.gstAmount,

        price: item.price,
        totalPrice: item.totalPrice,
        vendorEarning: item.totalPrice - (item.totalPrice * (item.commissionRate || currentCommission) / 100),
        status: item.status,
      })),

    shippingAddress: order.shippingAddress,
    kwikship: order.kwikship,
  }));
};

/* =====================================================
   ADMIN ORDERS
===================================================== */
exports.getAllOrders = async ({
  page = 1,
  limit = 20,
  status,
  paymentStatus,
  vendorId,
}) => {
  const filter = {};
  if (status) filter.orderStatus = status;
  if (paymentStatus) filter.paymentStatus = paymentStatus;
  if (vendorId) filter["items.vendorId"] = vendorId;

  const orders = await Order.find(filter)
    .populate("customerId", "firstName lastName email")
    .populate("items.vendorId", "storeName email")
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  return orders.map((order) => ({
    ...order,
    items: order.items.map((item) => ({
      ...item,
      basePrice: item.basePrice,
      discountType: item.discountType,
      discountValue: item.discountValue,
      discountAmount: item.discountAmount,
      discountedPrice: item.discountedPrice,
      gstRate: item.gstRate,
      gstAmount: item.gstAmount,
      price: item.price,
      totalPrice: item.totalPrice,
    })),
  }));
};

exports.updateItemStatus = async ({ orderId, itemId, status, vendorId }) => {
  const order = await Order.findOne({
    _id: orderId,
    "items._id": itemId,
    "items.vendorId": vendorId,
  })
    .populate("customerId", "email firstName")
    .populate("items.vendorId", "storeName email");

  if (!order) {
    throw new Error("Order or item not found");
  }

  /* ================= UPDATE ITEM ================= */

  const item = order.items.id(itemId);

  if (!item) {
    throw new Error("Item not found");
  }

  item.status = status;
  item.statusHistory.push({
    status,
    at: new Date(),
  });

  /* ================= UPDATE ORDER STATUS ================= */

  const statuses = order.items.map((i) => i.status);

  if (statuses.every((s) => s === "delivered")) {
    order.orderStatus = "completed";
  } else if (statuses.some((s) => s === "shipped")) {
    order.orderStatus = "shipped";
  } else if (statuses.some((s) => s === "confirmed")) {
    order.orderStatus = "confirmed";
  } else {
    order.orderStatus = "created";
  }

  await order.save();

  /* ================= ACTIVITY LOGS ================= */

  // 1️⃣ Vendor
  await activityService.logActivity({
    type: "ORDER_ITEM_STATUS_UPDATED",
    title: "Order Item Updated",
    description: `You updated "${item.name}" to "${status}"`,
    role: "vendor",
    vendorId,
    metadata: {
      orderId,
      itemId,
      status,
      amount: item.totalPrice,
    },
  });

  // 2️⃣ Admin
  await activityService.logActivity({
    type: "ORDER_ITEM_STATUS_UPDATED",
    title: "Vendor Updated Order",
    description: `Item "${item.name}" updated to "${status}" in order ${order.orderNumber}`,
    role: "admin",
    vendorId,
    metadata: {
      orderId,
      itemId,
      status,
    },
  });

  // 3️⃣ Customer
  await activityService.logActivity({
    type: "ORDER_ITEM_STATUS_UPDATED",
    title: "Order Update",
    description: `Your item "${item.name}" is now ${status}`,
    role: "customer",
    userId: order.customerId._id,
    metadata: {
      orderId,
      itemId,
      status,
    },
  });

  /* ================= EMAIL TO CUSTOMER ================= */

  if (["shipped", "delivered"].includes(status)) {
    await commissionService.creditCommission({
      orderId: order._id,
      orderItem: item,
    });
    /* ================= EMAIL TO CUSTOMER (NON-BLOCKING) ================= */
    try {
      await sendEmail({
        to: order.customerId.email,
        subject:
          status === "shipped"
            ? EMAIL_SUBJECTS.ORDER_SHIPPED
            : EMAIL_SUBJECTS.ORDER_DELIVERED,
        html: orderStatusUpdateTemplate({
          customerName: order.customerId.firstName,
          orderNumber: order.orderNumber,
          productName: item.name,
          status,
          platformName: "YourPlatform",
          supportEmail: "support@yourplatform.com",
          year: new Date().getFullYear(),
        }),
      });
    } catch (emailError) {
      logger.error("Order status email failed to send", {
        orderId: order._id,
        error: emailError.message,
      });
    }
  }

  return order;
};

exports.getSingleOrder = async (orderId, user = null) => {
  try {
    if (!orderId) {
      throw new Error("Order ID is required");
    }

    const query = {
      _id: new mongoose.Types.ObjectId(orderId),
    };

    /* ================= ROLE BASED ACCESS ================= */

    // CUSTOMER → only own order
    if (user?.role === "customer") {
      query.customerId = user._id;
    }

    // VENDOR → order must contain vendor's item
    if (user?.role === "vendor") {
      query["items.vendorId"] = user.vendorId || user._id;
    }

    const order = await Order.findOne(query)
      .populate("coupon.couponId", "code discountType discountValue")
      .lean();

    if (!order) {
      throw new Error("Order not found or access denied");
    }

    return {
      success: true,
      order,
    };
  } catch (error) {
    logger.error("Fetch single order failed", {
      orderId,
      error: error.message,
    });

    throw error;
  }
};

exports.initiatePayment = async ({ customerId, items, couponCode }) => {
  if (!items || !items.length) {
    throw new Error("No items");
  }

  let subtotal = 0;
  let totalGst = 0;
  let totalAmount = 0;

  for (const item of items) {
    const product = await Product.findById(item.productId);
    if (!product) throw new Error("Product not found");

    const p = product.pricing;
    const qty = item.quantity;

    const discountedPrice = p.basePrice - (p.discountAmount || 0);
    const gst = p.gstAmount || 0;
    const final = discountedPrice + gst;

    subtotal += discountedPrice * qty;
    totalGst += gst * qty;
    totalAmount += final * qty;
  }

  const { discount } = await validateAndApplyCoupon({
    couponCode,
    customerId,
    subtotal,
  });

  const payableAmount = Math.max(totalAmount - discount, 0);

  const razorpayOrder = await razorpay.orders.create({
    amount: Math.round(payableAmount * 100),
    currency: "INR",
    receipt: `pay_${Date.now()}`,
  });

  return {
    success: true,
    payableAmount,
    razorpay: {
      orderId: razorpayOrder.id,
      key: process.env.STORE_RAZORPAY_KEY_ID,
      currency: "INR",
    },
  };
};

exports.verifyPaymentAndCreateOrder = async ({
  customerId,
  razorpay_order_id,
  razorpay_payment_id,
  razorpay_signature,
  items,
  shippingAddress,
  couponCode,
  notes,
}) => {
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    throw new Error("Payment verification failed");
  }

  const body = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expectedSignature = crypto
    .createHmac("sha256", process.env.STORE_RAZORPAY_KEY_SECRET)
    .update(body)
    .digest("hex");

  if (expectedSignature !== razorpay_signature) {
    throw new Error("Invalid payment signature");
  }

  /* ✅ CREATE ORDER AFTER PAYMENT */
  const { order, vendorMap } = await exports.createOrder({
    customerId,
    items,
    shippingAddress,
    couponCode,
    notes,
    paymentMethod: "razorpay",
    paymentStatus: "paid",
    orderStatus: "pending",
    razorpayData: {
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
    },
  });

  /* ✅ COUPON USAGE */
  if (order.coupon?.couponId) {
    await CouponUsage.create({
      couponId: order.coupon.couponId,
      userId: customerId,
      orderId: order._id,
    });
  }

  /* ✅ REMOVE ONLY PURCHASED ITEMS FROM CART & UPDATE TOTALS */
  const productIdsToRemove = items.map((i) => i.productId.toString());
  const cart = await Cart.findOne({ userId: customerId });
  if (cart) {
    cart.items = cart.items.filter(
      (item) => !productIdsToRemove.includes(item.productId.toString())
    );
    
    // Recalculate totals
    let subtotal = 0;
    let totalItems = 0;
    cart.items.forEach((item) => {
      subtotal += (item.priceAtAdd || 0) * item.quantity;
      totalItems += item.quantity;
    });
    cart.subtotal = subtotal;
    cart.totalItems = totalItems;
    
    await cart.save();
  }

  /* ✅ SEND VENDOR EMAILS */
  for (const [email, data] of Object.entries(vendorMap)) {
    await sendEmail({
      to: email,
      subject: EMAIL_SUBJECTS.VENDOR_NEW_ORDER,
      html: newOrderReceivedTemplate({
        vendorName: data.vendorName,
        orderNumber: order.orderNumber,
        products: data.items,
        customerName: shippingAddress.fullName,
        shippingAddress: `${shippingAddress.addressLine1}, ${shippingAddress.city}`,
        platformName: "Your Platform",
        supportEmail: "support@yourplatform.com",
        year: new Date().getFullYear(),
      }),
    });
  }

  return order;
};

exports.confirmOrder = async (orderId, vendorId) => {
  const order = await Order.findById(orderId);
  if (!order) {
    throw new Error("Order not found");
  }

  // 2️⃣ Vendor validation (ObjectId-safe)
  const vendorItems = order.items.filter(
    (item) => item.vendorId.toString() === vendorId.toString()
  );

  if (!vendorItems.length) {
    throw new Error("You are not allowed to confirm this order");
  }

  // 3️⃣ Confirm only THIS vendor’s items
  order.items.forEach((item) => {
    if (item.vendorId.toString() === vendorId.toString()) {
      if (item.status !== "confirmed") {
        item.status = "confirmed";
        item.statusHistory.push({
          status: "confirmed",
          at: new Date(),
        });
      }
    }
  });

  // 4️⃣ Check if all items are confirmed
  const allConfirmed = order.items.every(
    (item) => item.status === "confirmed"
  );

  if (allConfirmed) {
    order.orderStatus = "confirmed";
  }

  await order.save();

  // 5️⃣ Payment check
  const canShip =
    order.paymentMethod === "cod" ||
    (order.paymentMethod !== "cod" && order.paymentStatus === "paid");

  if (!canShip) {
    return {
      success: true,
      message: "Order confirmed, waiting for payment",
    };
  }

  // 6️⃣ Prevent duplicate shipment
  if (order.kwikship?.waybill) {
    return {
      success: true,
      message: "Order already sent to Kwikship",
    };
  }

  // 7️⃣ Kwikship call
  await createFullShipment(order._id);

  return {
    success: true,
    message: "Order confirmed & shipment created",
  };
};

