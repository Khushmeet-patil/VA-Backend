/**
 * Kwikship (GoKwik) Shipping Service
 * ----------------------------------
 * Implements the GoKwik Kwikship API:
 *   - authToken  (POST /authToken)
 *   - waybill    (POST /waybill)           forward + reverse
 *   - cancel     (POST /cancel)
 *   - wayBillDetails (GET /wayBillDetails?waybills=...)
 *
 * Docs units:
 *   - weight  : grams (max 6 digits, 4 decimals)
 *   - length/height/breadth : mm
 *   - date format : dd-MMM-yyyy HH:mm:ss   e.g. 08-Sep-2024 14:54:00
 *   - paymentMode : COD | PREPAID  (uppercase)
 */

const axios = require("axios");
const KwikshipAccount = require("../models/Kwikship.js");
const Order = require("../models/Order.js");
const Vendor = require("../models/Vendor.js");
const Return = require("../models/Return.js");
const Product = require("../models/Product.js");
const { encrypt, decrypt } = require("../utils/crypto.js");

/* ============================================================
   CONSTANTS
============================================================ */
const SOURCE = "vedicstore";
const DEFAULT_TAT_DAYS = 7;
const DEFAULT_WEIGHT_G = 500;
const DEFAULT_DIMS_MM = { length: 100, height: 100, breadth: 100 };

/* ============================================================
   IN-MEMORY TOKEN CACHE (for env-based credentials)
============================================================ */
let _envTokenCache = { token: null, expiry: null };
// Tracks last auth failure to avoid re-attempting on every call while Kwikship is unreachable
let _authFailedAt = null;
const AUTH_FAILURE_COOLDOWN_MS = 30_000; // 30 seconds

/* ============================================================
   ACCOUNT MANAGEMENT
============================================================ */
const storeAccount = async ({ username, password, isDev = false }) => {
  await KwikshipAccount.updateMany({}, { isActive: false });
  return await KwikshipAccount.create({
    username,
    password: encrypt(password),
    isActive: true,
    isDev,
  });
};

const getActiveAccount = async () => {
  if (process.env.KWIKSHIP_USERNAME && process.env.KWIKSHIP_PASSWORD) {
    return {
      _env: true,
      username: process.env.KWIKSHIP_USERNAME,
      password: encrypt(process.env.KWIKSHIP_PASSWORD),
      isDev: process.env.KWIKSHIP_MODE === "dev",
    };
  }
  const account = await KwikshipAccount.findOne({ isActive: true });
  if (!account) throw new Error("Kwikship account not configured");
  return account;
};

const getBaseUrl = (account) =>
  account.isDev
    ? "https://api-gw-v4.dev.gokwik.io/kwikship"
    : "https://api.gokwik.co/kwikship";

/* ============================================================
   AUTH
============================================================ */
const getToken = async () => {
  const account = await getActiveAccount();

  // env-mode → in-memory cache
  if (account._env) {
    if (_envTokenCache.token && _envTokenCache.expiry > new Date()) {
      return _envTokenCache.token;
    }
    // Fail fast if auth recently failed — avoids a 10s hang on every call
    if (_authFailedAt && Date.now() - _authFailedAt < AUTH_FAILURE_COOLDOWN_MS) {
      const retryIn = Math.ceil((AUTH_FAILURE_COOLDOWN_MS - (Date.now() - _authFailedAt)) / 1000);
      throw new Error(`Kwikship authentication failed (retry in ${retryIn}s)`);
    }
  } else if (account.token && account.tokenExpiry > new Date()) {
    return account.token;
  }

  const realPassword = decrypt(account.password);
  const baseUrl = getBaseUrl(account);

  try {
    const res = await axios.post(`${baseUrl}/authToken`, {
      username: account.username,
      password: realPassword,
    }, { timeout: 15000 });

    if (res.data?.status !== "SUCCESS" || !res.data?.token) {
      throw new Error(res.data?.message || "Failed to fetch Kwikship token");
    }

    const token = res.data.token;
    const expiry = new Date(Date.now() + 23 * 60 * 60 * 1000);

    if (account._env) {
      _envTokenCache = { token, expiry };
      _authFailedAt = null; // clear failure on success
    } else {
      account.token = token;
      account.tokenExpiry = expiry;
      await account.save();
    }
    return token;
  } catch (error) {
    console.error("[Kwikship] Auth Error:", {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
    });
    if (account._env) {
      _authFailedAt = Date.now(); // record failure time for cooldown
    }
    throw new Error("Kwikship authentication failed");
  }
};

/* ============================================================
   FORMATTERS / BUILDERS
============================================================ */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n) => String(n).padStart(2, "0");

/** Kwikship date format: dd-MMM-yyyy HH:mm:ss */
const formatKwikshipDate = (date) => {
  const d = new Date(date);
  return `${pad(d.getDate())}-${MONTHS[d.getMonth()]}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

/** Build a valid pickupAddressDetails object from a Vendor doc. */
const buildVendorPickupAddress = (vendor) => {
  const pa = vendor.pickupAddress || {};
  const ba = vendor.businessAddress || {};
  return {
    name: pa.name || vendor.storeName || vendor.businessName || "Vendor",
    email: pa.email || vendor.storeEmail || "",
    phone: pa.phone || vendor.storePhone || "",
    alternatePhone: pa.alternatePhone || vendor.storePhone || "",
    address1: pa.address1 || ba.street || "",
    address2: pa.address2 || "",
    pincode: pa.pincode || ba.postalCode || "",
    city: pa.city || ba.city || "",
    state: pa.state || ba.state || "",
    stateCode: pa.stateCode || "",
    country: pa.country || ba.country || "India",
    countryCode: pa.countryCode || "IN",
    gstin: pa.gstin || vendor.gstNumber || "",
  };
};

/** Build a valid customer address object from Order.shippingAddress. */
const buildCustomerAddress = (sa) => ({
  name: sa.fullName || "",
  email: sa.email || "",
  phone: sa.phone || "",
  alternatePhone: sa.phone || "",
  address1: [sa.addressLine1, sa.addressLine2].filter(Boolean).join(", ") || sa.addressLine1 || "",
  address2: "",
  pincode: sa.postalCode || "",
  city: sa.city || "",
  state: sa.state || "",
  stateCode: "",
  country: sa.country || "India",
  countryCode: "IN",
  gstin: "",
});

const validateAddress = (addr, label) => {
  const missing = [];
  ["name", "phone", "address1", "pincode", "city", "state"].forEach((k) => {
    if (!addr[k]) missing.push(k);
  });
  if (missing.length) {
    throw new Error(`${label} missing: ${missing.join(", ")}`);
  }
};

/* ============================================================
   CORE: CREATE FORWARD WAYBILL (PER VENDOR SUBGROUP)
============================================================ */
/**
 * Create a forward shipment for one vendor's items within an order.
 * @returns updated Order
 */
const createForwardShipmentForVendor = async (orderId, vendorId) => {
  const order = await Order.findById(orderId).populate(
    "customerId",
    "email firstName lastName phone"
  );
  if (!order) throw new Error("Order not found");

  const vendor = await Vendor.findById(vendorId);
  if (!vendor) throw new Error("Vendor not found");

  const vendorItems = order.items.filter(
    (i) => i.vendorId.toString() === vendorId.toString()
  );
  if (!vendorItems.length) {
    throw new Error("No items for this vendor in order");
  }

  // Skip if all items already have a waybill
  if (vendorItems.every((i) => i.kwikship?.waybill)) {
    return order;
  }

  const token = await getToken();
  const account = await getActiveAccount();
  const baseUrl = getBaseUrl(account);

  const pickup = buildVendorPickupAddress(vendor);
  const delivery = buildCustomerAddress(order.shippingAddress || {});
  delivery.email = delivery.email || order.customerId?.email || "";

  validateAddress(pickup, "Vendor pickup address");
  validateAddress(delivery, "Customer delivery address");

  // Aggregate dimensions/weight from product catalog if available
  const productIds = vendorItems.map((i) => i.productId);
  const products = await Product.find({ _id: { $in: productIds } })
    .select("weight dimensions hsnCode sku")
    .lean();
  const prodMap = new Map(products.map((p) => [p.productId || p._id.toString(), p]));
  products.forEach((p) => prodMap.set(p._id.toString(), p));

  let totalWeightG = 0;
  let qtySum = 0;
  const items = vendorItems.map((it) => {
    const p = prodMap.get(it.productId.toString()) || {};
    const perUnitG = Number(p.weight) > 0 ? Number(p.weight) : DEFAULT_WEIGHT_G;
    totalWeightG += perUnitG * it.quantity;
    qtySum += it.quantity;
    return {
      name: it.name,
      description: it.name,
      quantity: it.quantity,
      skuCode: p.sku || it.productId.toString(),
      itemPrice: Number((it.price || 0).toFixed(2)),
      imageURL: it.image || "",
      hsnCode: p.hsnCode || "",
      size: it.size || "",
      category: "DEFAULT",
    };
  });

  const orderDate = formatKwikshipDate(order.createdAt || new Date());
  const tatDays = order.fastDelivery || DEFAULT_TAT_DAYS;
  const eddDate = new Date();
  eddDate.setDate(eddDate.getDate() + tatDays);
  const fullFillmentTat = formatKwikshipDate(eddDate);

  // Vendor-scoped totals
  const vendorTotal = vendorItems.reduce((s, i) => s + (i.totalPrice || 0), 0);
  const isCOD = String(order.paymentMethod || "").toLowerCase() === "cod";
  const paymentMode = isCOD ? "COD" : "PREPAID";
  const collectableAmount = isCOD ? vendorTotal : 0;

  // Unique shipment code per vendor-group. Deterministic so retries idempotent on our side.
  const shipmentCode = `${order.orderNumber || order._id}-${vendor._id.toString().slice(-6)}`;

  const payload = {
    returnShipmentFlag: "false",
    Shipment: {
      code: shipmentCode,
      SaleOrderCode: shipmentCode,
      orderCode: order.orderNumber || order._id.toString(),
      channelCode: "CUSTOM",
      channelName: "VedicStore",
      invoiceCode: order.orderNumber || order._id.toString(),
      orderDate,
      fullFillmentTat,
      weight: Number(totalWeightG.toFixed(4)).toString(),
      length: String(DEFAULT_DIMS_MM.length),
      height: String(DEFAULT_DIMS_MM.height),
      breadth: String(DEFAULT_DIMS_MM.breadth),
      source: SOURCE,
      numberOfBoxes: "1",
      items,
    },
    deliveryAddressId: "",
    deliveryAddressDetails: delivery,
    pickupAddressId: "",
    pickupAddressDetails: pickup,
    returnAddressDetails: pickup, // forward: return goes back to vendor
    currencyCode: "INR",
    paymentMode,
    totalAmount: Number(vendorTotal).toFixed(2),
    collectableAmount: Number(collectableAmount).toFixed(2),
  };

  let data;
  try {
    const res = await axios.post(`${baseUrl}/waybill`, payload, {
      headers: { Authorization: token },
      timeout: 10000,
    });
    data = res.data;
  } catch (error) {
    console.error("[Kwikship] Waybill Error:", error.response?.data || error.message);
    throw new Error(
      error.response?.data?.message ||
      error.message ||
      "Failed to generate Kwikship waybill"
    );
  }

  if (data?.status !== "SUCCESS") {
    throw new Error(data?.message || "Waybill generation failed");
  }

  // Persist waybill to each item in this vendor-group
  const now = new Date();
  order.items.forEach((it) => {
    if (it.vendorId.toString() !== vendorId.toString()) return;
    it.kwikship = {
      waybill: data.waybill,
      courierName: data.courierName || "",
      shippingLabel: data.shippingLabel || "",
      routingCode: data.routingCode || "",
      status: "CREATED",
      edd: eddDate,
      type: "forward",
      shipmentCode,
      createdAt: now,
      lastUpdated: now,
    };
    it.shipping = it.shipping || {};
    it.shipping.awb = data.waybill;
    it.shipping.courier = data.courierName;
    it.shipping.labelUrl = data.shippingLabel;
    it.shipping.status = "shipment_created";
  });

  // Keep order-level kwikship for back-compat (first waybill)
  if (!order.kwikship?.waybill) {
    order.kwikship = {
      waybill: data.waybill,
      courierName: data.courierName,
      shippingLabel: data.shippingLabel,
      routingCode: data.routingCode,
      status: "CREATED",
      lastUpdated: now,
    };
  }

  await order.save();
  return { order, waybill: data.waybill, courierName: data.courierName, edd: eddDate };
};

/**
 * Create forward shipments for every vendor-group in an order.
 * Returns array of { vendorId, waybill, courierName, edd } or { vendorId, error }.
 */
const createShipmentsForOrder = async (orderId) => {
  const order = await Order.findById(orderId);
  if (!order) throw new Error("Order not found");

  const vendorIds = [...new Set(order.items.map((i) => i.vendorId.toString()))];
  const results = [];
  for (const vId of vendorIds) {
    try {
      const r = await createForwardShipmentForVendor(orderId, vId);
      results.push({
        vendorId: vId,
        waybill: r.waybill,
        courierName: r.courierName,
        edd: r.edd,
      });
    } catch (err) {
      results.push({ vendorId: vId, error: err.message });
    }
  }
  return results;
};

/* ============================================================
   CORE: CREATE REVERSE WAYBILL (RETURN / REPLACEMENT PICKUP)
============================================================ */
const createReverseShipment = async (returnId) => {
  const ret = await Return.findById(returnId)
    .populate("orderId")
    .populate("customerId", "email firstName lastName phone");
  if (!ret) throw new Error("Return request not found");
  if (ret.kwikship?.waybill) return ret; // idempotent

  const order = ret.orderId;
  if (!order) throw new Error("Order for return not found");

  const vendor = await Vendor.findById(ret.vendorId);
  if (!vendor) throw new Error("Vendor not found");

  const token = await getToken();
  const account = await getActiveAccount();
  const baseUrl = getBaseUrl(account);

  const vendorAddr = buildVendorPickupAddress(vendor);
  const customerAddr = buildCustomerAddress(order.shippingAddress || {});
  customerAddr.email = customerAddr.email || ret.customerId?.email || "";

  validateAddress(vendorAddr, "Vendor (reverse delivery) address");
  validateAddress(customerAddr, "Customer (reverse pickup) address");

  // Reverse items
  let totalWeightG = 0;
  const items = (ret.items || []).map((it) => {
    totalWeightG += DEFAULT_WEIGHT_G * (it.quantity || 1);
    return {
      name: it.name || "Item",
      description: it.name || "Item",
      quantity: it.quantity || 1,
      skuCode: it.productId?.toString() || ret.productId?.toString() || "",
      itemPrice: Number((it.price || 0).toFixed(2)),
      imageURL: it.image || "",
      return_reason: ret.reason || "",
      category: "DEFAULT",
    };
  });
  if (!items.length) {
    items.push({
      name: "Return item",
      description: "Return item",
      quantity: 1,
      skuCode: ret.productId?.toString() || "",
      itemPrice: 0,
      return_reason: ret.reason || "",
      category: "DEFAULT",
    });
    totalWeightG = DEFAULT_WEIGHT_G;
  }

  const orderDate = formatKwikshipDate(new Date());
  const eddDate = new Date();
  eddDate.setDate(eddDate.getDate() + DEFAULT_TAT_DAYS);
  const fullFillmentTat = formatKwikshipDate(eddDate);

  const shipmentCode = `RET-${ret._id.toString().slice(-10)}`;
  const totalAmount = items.reduce((s, i) => s + i.itemPrice * i.quantity, 0);

  const payload = {
    returnShipmentFlag: "true",
    Shipment: {
      code: shipmentCode,
      SaleOrderCode: shipmentCode,
      orderCode: order.orderNumber || order._id.toString(),
      channelCode: "CUSTOM",
      channelName: "VedicStore",
      orderDate,
      fullFillmentTat,
      weight: Number(totalWeightG.toFixed(4)).toString(),
      length: String(DEFAULT_DIMS_MM.length),
      height: String(DEFAULT_DIMS_MM.height),
      breadth: String(DEFAULT_DIMS_MM.breadth),
      source: SOURCE,
      items,
    },
    // Reverse: delivery = seller, pickup = customer
    deliveryAddressDetails: vendorAddr,
    pickupAddressId: "",
    pickupAddressDetails: customerAddr,
    currencyCode: "INR",
    paymentMode: "PREPAID",
    totalAmount: totalAmount.toFixed(2),
    collectableAmount: "0.00",
  };

  let data;
  try {
    const res = await axios.post(`${baseUrl}/waybill`, payload, {
      headers: { Authorization: token },
      timeout: 10000,
    });
    data = res.data;
  } catch (error) {
    console.error("[Kwikship] Reverse Waybill Error:", error.response?.data || error.message);
    throw new Error(
      error.response?.data?.message ||
      error.message ||
      "Failed to generate reverse waybill"
    );
  }

  if (data?.status !== "SUCCESS") {
    throw new Error(data?.message || "Reverse waybill generation failed");
  }

  const now = new Date();
  ret.kwikship = {
    waybill: data.waybill,
    courierName: data.courierName || "",
    shippingLabel: data.shippingLabel || "",
    routingCode: data.routingCode || "",
    status: "CREATED",
    shipmentCode,
    createdAt: now,
    lastUpdated: now,
  };
  await ret.save();
  return ret;
};

/* ============================================================
   TRACKING
============================================================ */
/** Fetch status for one or more waybills (up to 20, comma-separated). */
const fetchStatus = async (waybillOrList) => {
  const account = await getActiveAccount();
  const token = await getToken();
  const baseUrl = getBaseUrl(account);

  const waybills = Array.isArray(waybillOrList)
    ? waybillOrList.join(",")
    : waybillOrList;

  try {
    const res = await axios.get(`${baseUrl}/wayBillDetails`, {
      params: { waybills },
      headers: { Authorization: token },
      timeout: 10000,
    });

    if (res.data?.Status !== "SUCCESS") {
      throw new Error(res.data?.message || "Failed to fetch tracking details");
    }

    const details = res.data.waybillDetails || [];
    for (const d of details) {
      await applyStatusUpdate(d.waybill, d.currentStatus, d.statusDate);
    }
    return res.data;
  } catch (error) {
    console.error("[Kwikship] Status Error:", error.response?.data || error.message);
    throw error;
  }
};

/** Apply a status update to whichever document owns the waybill (Order item or Return). */
const applyStatusUpdate = async (waybill, status, statusDate) => {
  if (!waybill || !status) return;
  const now = statusDate ? new Date(statusDate) : new Date();

  // Order item
  const orderUpdate = await Order.findOneAndUpdate(
    { "items.kwikship.waybill": waybill },
    {
      $set: {
        "items.$[elem].kwikship.status": status,
        "items.$[elem].kwikship.lastUpdated": now,
      },
    },
    {
      arrayFilters: [{ "elem.kwikship.waybill": waybill }],
      new: true,
    }
  );

  if (orderUpdate) {
    // Back-compat order-level status
    await Order.updateOne(
      { _id: orderUpdate._id, "kwikship.waybill": waybill },
      { $set: { "kwikship.status": status, "kwikship.lastUpdated": now } }
    );

    // Map to item-level lifecycle status
    const mapped = mapKwikshipStatusToItem(status);
    if (mapped) {
      await Order.updateOne(
        { _id: orderUpdate._id },
        {
          $set: { "items.$[elem].status": mapped },
          $push: {
            "items.$[elem].statusHistory": {
              status: mapped,
              updatedAt: now,
              updatedBy: "system",
              note: `Kwikship: ${status}`,
            },
          },
        },
        { arrayFilters: [{ "elem.kwikship.waybill": waybill }] }
      );
    }
    return { type: "order", id: orderUpdate._id };
  }

  // Return (reverse shipment)
  const retDoc = await Return.findOneAndUpdate(
    { "kwikship.waybill": waybill },
    { $set: { "kwikship.status": status, "kwikship.lastUpdated": now } },
    { new: true }
  );
  if (retDoc) {
    if (/delivered|completed/i.test(status)) {
      await Return.updateOne({ _id: retDoc._id }, { $set: { status: "completed" } });
    }
    return { type: "return", id: retDoc._id };
  }
  return null;
};

const mapKwikshipStatusToItem = (kwStatus) => {
  const s = String(kwStatus || "").toLowerCase();
  if (s.includes("delivered")) return "delivered";
  if (s.includes("out for delivery")) return "out_for_delivery";
  if (s.includes("in transit") || s.includes("picked")) return "shipped";
  if (s.includes("cancel")) return "cancelled";
  if (s.includes("rto")) return "returned";
  return null;
};

/* ============================================================
   CANCEL
============================================================ */
const cancelWaybill = async (waybill) => {
  const account = await getActiveAccount();
  const token = await getToken();
  const baseUrl = getBaseUrl(account);

  try {
    const res = await axios.post(
      `${baseUrl}/cancel`,
      { waybill },
      { headers: { Authorization: token } }
    );

    if (res.data?.status === "SUCCESS") {
      await applyStatusUpdate(waybill, "CANCELLED", new Date());
    }
    return res.data;
  } catch (error) {
    console.error("[Kwikship] Cancel Error:", error.response?.data || error.message);
    throw error;
  }
};

/* ============================================================
   WEBHOOK HANDLER
============================================================ */
/**
 * Process an incoming Kwikship status webhook.
 * Accepts several payload shapes since the spec above does not pin one.
 * Expected keys (best-effort): waybill, currentStatus/status, statusDate/eventDate.
 */
const handleWebhook = async (body) => {
  if (!body) return { ok: false, reason: "empty body" };
  const events = Array.isArray(body)
    ? body
    : Array.isArray(body.waybillDetails)
      ? body.waybillDetails
      : [body];

  const results = [];
  for (const ev of events) {
    const waybill = ev.waybill || ev.awb || ev.wayBill;
    const status = ev.currentStatus || ev.status || ev.shipmentStatus;
    const date = ev.statusDate || ev.eventDate || ev.updatedAt;
    if (!waybill || !status) {
      results.push({ ok: false, reason: "missing waybill/status", ev });
      continue;
    }
    const applied = await applyStatusUpdate(waybill, status, date);
    results.push({ ok: true, waybill, status, applied });
  }
  return { ok: true, results };
};

/* ============================================================
   BACK-COMPAT WRAPPERS (existing callers)
============================================================ */
const createWaybill = async (orderId) => {
  // Legacy: create shipments for all vendors in the order
  return await createShipmentsForOrder(orderId);
};

const createFullShipment = async (orderId) => {
  return await createShipmentsForOrder(orderId);
};

module.exports = {
  storeAccount,
  getActiveAccount,
  getToken,
  // forward
  createForwardShipmentForVendor,
  createShipmentsForOrder,
  // reverse
  createReverseShipment,
  // tracking
  fetchStatus,
  applyStatusUpdate,
  // cancel
  cancelWaybill,
  // webhook
  handleWebhook,
  // back-compat
  createWaybill,
  createFullShipment,
};
