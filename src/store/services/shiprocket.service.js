const axios = require("axios");
const ShiprocketAccount = require("../models/Shiprocket.js");
const Order = require("../models/Order.js");
const bcrypt = require("bcryptjs");
const { encrypt, decrypt } = require("../utils/crypto.js");

/* ==============================
   ACCOUNT (ADMIN)
============================== */

const storeAccount = async ({
  email,
  password,
  channelId,
  pickupLocation = "Primary",
}) => {
  await ShiprocketAccount.updateMany({}, { isActive: false });

  return await ShiprocketAccount.create({
    email,
    password: encrypt(password), // 🔐 encrypted
    channelId,
    pickupLocation,
    isActive: true,
  });
};

const updateAccount = async (id, data) => {
  return await ShiprocketAccount.findByIdAndUpdate(id, data, { new: true });
};

const getActiveAccount = async () => {
  const account = await ShiprocketAccount.findOne({ isActive: true });
  if (!account) throw new Error("Shiprocket account not configured");
  return account;
};

const getToken = async () => {
  const account = await getActiveAccount();

  // ✅ reuse token if valid
  if (account.token && account.tokenExpiry > new Date()) {
    return account.token;
  }

  // 🔓 decrypt password before login
  const realPassword = decrypt(account.password);

  const res = await axios.post(
    "https://apiv2.shiprocket.in/v1/external/auth/login",
    {
      email: account.email,
      password: realPassword, // ✅ REAL password
    },
  );

  account.token = res.data.token;
  account.tokenExpiry = new Date(Date.now() + 9 * 24 * 60 * 60 * 1000);

  await account.save();
  return account.token;
};

/* ==============================
   CREATE ORDER
============================== */

const createOrder = async (orderId) => {
  const order = await Order.findById(orderId).populate(
    "customerId",
    "email firstName lastName",
  );

  if (!order) throw new Error("Order not found");

  const token = await getToken();
  const account = await getActiveAccount();


  /* ==============================
     PREPARE ITEMS (NO GST)
  ============================== */

  const orderItems = order.items.map((i) => ({
    name: i.name,
    sku: `SKU-${i._id.toString().slice(-6)}`,
    // ✅ safe SKU
    units: Number(i.quantity),
    selling_price: Number(i.discountedPrice || i.basePrice), // ✅ no GST
  }));

  /* ==============================
     CALCULATE SUB TOTAL (MANDATORY)
  ============================== */

  const subTotal = orderItems.reduce(
    (sum, i) => sum + i.selling_price * i.units,
    0,
  );

  /* ==============================
     SHIPROCKET PAYLOAD
  ============================== */

  const fullName = order.shippingAddress.fullName || "";
  const [firstName, ...rest] = fullName.split(" ");
  const lastName = rest.join(" ") || firstName;

  const payload = {
    order_id: order._id.toString(),
    order_date: new Date(),
    pickup_location: "Primary",

    billing_customer_name: firstName,
    billing_last_name: lastName, // 🔥 REQUIRED
    billing_address: `${order.shippingAddress.addressLine1} ${order.shippingAddress.addressLine2 || ""}`,
    billing_city: order.shippingAddress.city,
    billing_pincode: String(order.shippingAddress.postalCode),
    billing_state: order.shippingAddress.state,
    billing_country: "India",
    billing_email: order.customerId.email,
    billing_phone: String(order.shippingAddress.phone),

    shipping_is_billing: true,

    shipping_customer_name: firstName,
    shipping_last_name: lastName, // 🔥 REQUIRED
    shipping_address: `${order.shippingAddress.addressLine1} ${order.shippingAddress.addressLine2 || ""}`,
    shipping_city: order.shippingAddress.city,
    shipping_pincode: String(order.shippingAddress.postalCode),
    shipping_state: order.shippingAddress.state,
    shipping_country: "India",
    shipping_email: order.customerId.email,
    shipping_phone: String(order.shippingAddress.phone),

    order_items: orderItems.map((i) => ({
      ...i,
      gst_percentage: 0,
    })),

    payment_method: "Prepaid",
    sub_total: subTotal,

    length: 10,
    breadth: 10,
    height: 5,
    weight: 1,
  };

  /* ==============================
     API CALL WITH DEBUG
  ============================== */

  try {
    const res = await axios.post(
      "https://apiv2.shiprocket.in/v1/external/orders/create/adhoc",
      payload,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    order.shiprocket = {
      orderId: res.data.order_id,
      shipmentId: res.data.shipment_id,
      status: res.data.status,
    };

    await order.save();
    return res.data;
  } catch (err) {
    throw err;
  }
};

/* ==============================
   ASSIGN COURIER + AWB
============================== */

const assignCourier = async (orderId) => {
  const order = await Order.findById(orderId);
  if (!order?.shiprocket?.shipmentId) {
    throw new Error("Shipment not created");
  }

  const token = await getToken();

  const res = await axios.post(
    "https://apiv2.shiprocket.in/v1/external/courier/assign/awb",
    { shipment_id: order.shiprocket.shipmentId },
    { headers: { Authorization: `Bearer ${token}` } },
  );

  order.shiprocket.awb = res.data.awb_code;
  order.shiprocket.courier = res.data.courier_name;
  order.shiprocket.status = res.data.status;

  await order.save();
  return res.data;
};

/* ==============================
   GENERATE LABEL
============================== */

const generateLabel = async (orderId) => {
  const order = await Order.findById(orderId);
  const token = await getToken();

  const res = await axios.post(
    "https://apiv2.shiprocket.in/v1/external/courier/generate/label",
    { shipment_id: order.shiprocket.shipmentId },
    { headers: { Authorization: `Bearer ${token}` } },
  );

  order.shiprocket.labelUrl = res.data.label_url;
  await order.save();

  return res.data.label_url;
};

/* ==============================
   FULL SHIPMENT FLOW
============================== */

const createFullShipment = async (orderId) => {
  await createOrder(orderId);
  await assignCourier(orderId);
  await generateLabel(orderId);
  return { success: true };
};

/* ==============================
   WEBHOOK STATUS PATCH
============================== */

const updateStatusFromWebhook = async (data) => {
  const { order_id, current_status } = data;

  await Order.findByIdAndUpdate(order_id, {
    "shiprocket.status": current_status,
  });

  return true;
};

/* ==============================
   EXPORTS
============================== */

module.exports = {
  storeAccount,
  updateAccount,
  getActiveAccount,
  getToken,
  createOrder,
  assignCourier,
  generateLabel,
  createFullShipment,
  updateStatusFromWebhook,
};
