const Cart = require("../models/Cart");
const Order = require("../models/Order");
const orderService = require("./order.service");
const logger = require("../utils/logger");

/* ================= HELPERS ================= */

const buildGokwikCart = (cart, extra = {}) => {
  const items = (cart.items || [])
    .filter((item) => item.productId)
    .map((item) => {
      const product = item.productId;
      const mrp =
        product?.pricing?.mrp ||
        product?.pricing?.basePrice ||
        item.priceAtAdd;
      const price = product?.pricing?.finalPrice || item.priceAtAdd;
      const stockQty = item.size
        ? product?.variants?.find((v) => v.size === item.size)?.stock ?? 99
        : product?.stock ?? 99;

      return {
        product_id: (product?._id || item.productId).toString(),
        ...(item.size && { variant_id: item.size }),
        ...(product?.sku && { sku: product.sku }),
        title: product?.name || "Product",
        image_url: product?.images?.[0] || "",
        quantity: item.quantity,
        salable_qty: stockQty,
        mrp,
        price,
        total: price * item.quantity,
        stock_status: "in_stock",
      };
    });

  // subtotal = sum of (price × qty) — GoKwik validates this strictly
  // discount_total = coupon/promo discounts only (MRP vs price is per-item display only)
  // total = subtotal + shipping_total - discount_total + order_summary_extra_fields
  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const discountTotal = 0; // no coupon applied; coupons handled by GoKwik's Kwik Discount
  const shippingTotal = subtotal > 500 || subtotal === 0 ? 0 : 50;
  const platformFee = subtotal > 0 ? 3 : 0;
  const total = subtotal + shippingTotal - discountTotal + platformFee;

  const shippingMethods =
    subtotal > 500 || subtotal === 0
      ? [{ id: "free_shipping", price: 0, title: "Free Shipping", currency: "INR" }]
      : [
          { id: "free_shipping", price: 0, title: "Free Shipping (Orders above ₹500)", currency: "INR" },
          { id: "standard", price: 50, title: "Standard Delivery", currency: "INR" },
        ];

  return {
    subtotal,
    discount_total: discountTotal,
    shipping_total: shippingTotal,
    total,
    currency: "INR",
    total_tax: 0,
    wallet_credit_used: 0,
    membership_discount: 0,
    cashback_amount: 0,
    discounts: [],
    available_payment_methods: [
      { description: "Prepaid", id: "prepaid", price: 0 },
      { description: "Cash on delivery", id: "cod", price: 0 },
      { description: "Partial COD", id: "pp-cod", price: 0 },
    ],
    available_coupons: [],
    available_shipping_methods: shippingMethods,
    ...(platformFee > 0
      ? { order_summary_extra_fields: [{ name: "Platform Fee", value: platformFee }] }
      : {}),
    items,
    ...extra,
  };
};

const populateOpts = {
  path: "items.productId",
  select: "name images pricing sku stock variants isVisible",
};

/* ================= GET CART ================= */

exports.getCartByGokwikId = async (cartId) => {
  if (!cartId || !/^[a-f\d]{24}$/i.test(cartId)) {
    throw new Error(`Invalid cart_id format: "${cartId}"`);
  }
  const cart = await Cart.findById(cartId).populate(populateOpts);
  if (!cart) throw new Error("Cart not found");
  return cart;
};

exports.buildGokwikCart = buildGokwikCart;

/* ================= SET SHIPPING ADDRESS ================= */

exports.setShippingAddress = async (cartId) => {
  const cart = await exports.getCartByGokwikId(cartId);
  return buildGokwikCart(cart);
};

/* ================= PLACE ORDER ================= */

exports.placeGokwikOrder = async (cartId, payload) => {
  const cart = await exports.getCartByGokwikId(cartId);
  const { payment_details, shipping_address, customer_phone, meta_data } =
    payload;

  const isCoD = payment_details?.payment_method === "pp-cod";

  const shippingAddr = {
    fullName: `${shipping_address.first_name || ""} ${shipping_address.last_name || ""}`.trim(),
    phone: shipping_address.phone || customer_phone || "",
    addressLine1: shipping_address.address || "",
    addressLine2: "",
    city: shipping_address.city || "",
    state: shipping_address.state || "",
    postalCode: String(shipping_address.pincode || shipping_address.postal_code || ""),
    country: "India",
  };

  const items = cart.items
    .filter((item) => item.productId)
    .map((item) => ({
      productId: (item.productId._id || item.productId).toString(),
      quantity: item.quantity,
      size: item.size || null,
    }));

  const { order } = await orderService.createOrder({
    customerId: cart.userId,
    items,
    shippingAddress: shippingAddr,
    paymentMethod: isCoD ? "cod" : "prepaid",
    paymentStatus: isCoD ? "pending" : "paid",
    orderStatus: isCoD ? "pending" : "confirmed",
    couponCode: null, // GoKwik manages their own discounts; no merchant coupon to apply
    notes: [
      meta_data?.gokwik_order_id ? `GoKwik Order: ${meta_data.gokwik_order_id}` : null,
      payment_details?.payment_id ? `GK Pymt: ${payment_details.payment_id}` : null,
      payment_details?.pg_payment_trnx_id ? `PG Txn: ${payment_details.pg_payment_trnx_id}` : null,
    ].filter(Boolean).join(" | "),
  });

  await Order.findByIdAndUpdate(order._id, { gokwikCartId: cartId });

  return order;
};

/* ================= CHECK ORDER EXISTS ================= */

exports.checkOrderExists = async (cartId) => {
  return Order.findOne({ gokwikCartId: cartId }).select("orderNumber _id").lean();
};

/* ================= REMOVE OUT OF STOCK ITEMS ================= */

exports.removeOutOfStockItems = async (cartId) => {
  const cart = await exports.getCartByGokwikId(cartId);

  const validItems = cart.items.filter((item) => {
    const product = item.productId;
    if (!product) return false; // product deleted entirely — remove

    if (item.size) {
      const variant = product.variants?.find((v) => v.size === item.size);
      if (!variant) return false; // size no longer exists — remove
      // keep if stock is unknown (null/undefined) or sufficient
      return variant.stock == null || variant.stock >= item.quantity;
    }

    // keep if stock is unknown (null/undefined) or sufficient
    return product.stock == null || product.stock >= item.quantity;
  });

  if (validItems.length !== cart.items.length) {
    cart.items = validItems;
    let subtotal = 0;
    let totalItems = 0;
    validItems.forEach((item) => {
      subtotal += item.priceAtAdd * item.quantity;
      totalItems += item.quantity;
    });
    cart.subtotal = subtotal;
    cart.totalItems = totalItems;
    await cart.save();
    await cart.populate(populateOpts);
  }

  return buildGokwikCart(cart);
};

/* ================= UPDATE ORDER FROM GOKWIK WEBHOOK ================= */

exports.updateOrderFromGokwik = async ({
  merchant_order_id,
  order_status,
  awb_number,
  awb_status,
  shipping_provider,
  order_note,
  refund_amount,
}) => {
  const order = await Order.findOne({ orderNumber: merchant_order_id });
  if (!order) throw new Error(`Order not found: ${merchant_order_id}`);

  // Handles both GoKwik capitalized values and Kwikship tracking values
  const statusMap = {
    Confirmed: "confirmed",
    confirmed: "confirmed",
    Pending: "pending",
    pending: "pending",
    Failed: "cancelled",
    failed: "cancelled",
    Cancelled: "cancelled",
    cancelled: "cancelled",
    shipped: "shipped",
    Shipped: "shipped",
    delivered: "completed",
    Delivered: "completed",
    returned: "cancelled",
    Returned: "cancelled",
  };

  if (order_status && statusMap[order_status]) {
    order.orderStatus = statusMap[order_status];
  }

  if (awb_number || awb_status) {
    order.kwikship = {
      ...order.kwikship,
      waybill: awb_number || order.kwikship?.waybill,
      status: awb_status || order.kwikship?.status,
      courierName: shipping_provider || order.kwikship?.courierName,
      lastUpdated: new Date(),
    };
  }

  if (refund_amount && Number(refund_amount) > 0) {
    order.refund = {
      status: "pending",
      amount: Number(refund_amount),
      refundRequestDescription: order_note || "",
    };
    order.paymentStatus = "refunded";
  }

  await order.save();
  return order;
};

/* ================= PROCESS TRANSACTION WEBHOOK ================= */
exports.processTransactionWebhook = async ({ event, data }) => {
  const { merchantReferenceId, paymentId, amount, method, status } = data;
  
  const order = await Order.findOne({ orderNumber: merchantReferenceId });
  if (!order) {
    throw new Error(`Order not found for transaction: ${merchantReferenceId}`);
  }

  logger.info("Processing transaction webhook", { event, orderNumber: order.orderNumber });

  if (event === "transaction.successful") {
    order.paymentStatus = "paid";
    order.orderStatus = "confirmed";
    order.notes = `${order.notes || ""} | Paid via GK: ${paymentId}`.trim();
  } else if (event === "transaction.failure") {
    order.paymentStatus = "failed";
    order.orderStatus = "cancelled";
    order.notes = `${order.notes || ""} | Payment Failed GK: ${paymentId}`.trim();
  } else if (event === "transaction.auto_refund") {
    order.paymentStatus = "refunded";
    order.orderStatus = "cancelled";
    order.notes = `${order.notes || ""} | Auto-Refund Initiated GK`.trim();
  }

  await order.save();
  return order;
};

/* ================= PROCESS REFUND WEBHOOK ================= */
exports.processRefundWebhook = async ({ event, data }) => {
  const { merchantReferenceId, refundId, amount, status } = data;

  const order = await Order.findOne({ orderNumber: merchantReferenceId });
  if (!order) {
    throw new Error(`Order not found for refund: ${merchantReferenceId}`);
  }

  logger.info("Processing refund webhook", { event, orderNumber: order.orderNumber });

  if (event === "refund.successful") {
    order.paymentStatus = "refunded";
    order.refund = {
      status: "completed",
      amount: amount,
      refundId: refundId,
      processedAt: new Date()
    };
  } else if (event === "refund.failure") {
    order.refund = {
      ...order.refund,
      status: "failed",
      error: data.description || "Refund failed"
    };
  } else if (event === "refund.pending") {
    order.refund = {
      ...order.refund,
      status: "pending"
    };
  }

  await order.save();
  return order;
};
