const axios = require("axios");
const KwikshipAccount = require("../models/Kwikship.js");
const Order = require("../models/Order.js");
const { encrypt, decrypt } = require("../utils/crypto.js");

/* ==============================
   ACCOUNT MANAGEMENT
============================== */

const storeAccount = async ({
  username,
  password,
  isDev = false,
}) => {
  // Deactivate others
  await KwikshipAccount.updateMany({}, { isActive: false });

  return await KwikshipAccount.create({
    username,
    password: encrypt(password),
    isActive: true,
    isDev,
  });
};

const getActiveAccount = async () => {
  // Try environment variables first
  if (process.env.KWIKSHIP_USERNAME && process.env.KWIKSHIP_PASSWORD) {
    return {
      username: process.env.KWIKSHIP_USERNAME,
      password: encrypt(process.env.KWIKSHIP_PASSWORD), // Encrypt for consistency with token fetch logic
      isDev: process.env.KWIKSHIP_MODE === "dev",
      save: async () => {} // Mock save for token caching if needed (though token won't persist across restarts if only using .env)
    };
  }

  const account = await KwikshipAccount.findOne({ isActive: true });
  if (!account) throw new Error("Kwikship account not configured");
  return account;
};

const getBaseUrl = (account) => {
  return account.isDev
    ? "https://dev-gk-kwik-ship.dev.gokwik.io"
    : "https://api.gokwik.co/kwikship";
};

const getToken = async () => {
  const account = await getActiveAccount();

  // Cache token for 23 hours
  if (account.token && account.tokenExpiry > new Date()) {
    return account.token;
  }

  const realPassword = decrypt(account.password);
  const baseUrl = getBaseUrl(account);

  try {
    const res = await axios.post(`${baseUrl}/authToken`, {
      username: account.username,
      password: realPassword,
    });

    if (res.data.status !== "SUCCESS") {
      throw new Error(res.data.message || "Failed to fetch Kwikship token");
    }

    account.token = res.data.token;
    account.tokenExpiry = new Date(Date.now() + 23 * 60 * 60 * 1000);

    await account.save();
    return account.token;
  } catch (error) {
    console.error("Kwikship Auth Error:", error.response?.data || error.message);
    throw new Error("Kwikship authentication failed");
  }
};

/* ==============================
   WAYBILL GENERATION
============================== */

const createWaybill = async (orderId) => {
  const order = await Order.findById(orderId).populate(
    "customerId",
    "email firstName lastName"
  );

  if (!order) throw new Error("Order not found");

  const token = await getToken();
  const account = await getActiveAccount();
  const baseUrl = getBaseUrl(account);

  const shipping = order.shippingAddress;
  
  // Calculate fullFillmentTat (Expected Delivery)
  // Default to 7 days from now if not specified
  const tatDays = order.fastDelivery || 7; 
  const eddDate = new Date();
  eddDate.setDate(eddDate.getDate() + tatDays);
  const fullFillmentTat = eddDate.toISOString().split('T')[0] + " " + eddDate.toTimeString().split(' ')[0];

  const payload = {
    orderId: order.orderNumber || order._id.toString(),
    fullFillmentTat: fullFillmentTat,
    orderDate: new Date().toISOString().split('T')[0] + " " + new Date().toTimeString().split(' ')[0],
    orderType: order.paymentMethod?.toLowerCase() === "cod" ? "COD" : "Prepaid",
    orderAmount: order.totalAmount,
    pincode: shipping.postalCode,
    customerName: shipping.fullName,
    customerAddress: `${shipping.addressLine1} ${shipping.addressLine2 || ""}`.trim(),
    customerCity: shipping.city,
    customerState: shipping.state,
    customerPhone: shipping.phone,
    customerEmail: order.customerId.email,
    invoiceCode: order.orderNumber || order._id.toString(),
    product: order.items.map(item => ({
      name: item.name,
      quantity: item.quantity,
      price: item.price
    })),
    // Standard dimensions if not provided
    length: 10,
    width: 10,
    height: 10,
    weight: 0.5
  };

  try {
    const res = await axios.post(`${baseUrl}/waybill`, payload, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (res.data.status !== "SUCCESS") {
      throw new Error(res.data.message || "Waybill generation failed");
    }

    // Update order with Kwikship details
    order.kwikship = {
      waybill: res.data.waybill,
      courierName: res.data.courierName,
      shippingLabel: res.data.shippingLabel,
      routingCode: res.data.routingCode,
      status: "CREATED",
      lastUpdated: new Date()
    };

    // Keep compatibility with existing shipping object if used elsewhere
    order.shipping = order.shipping || {};
    order.shipping.awb = res.data.waybill;
    order.shipping.courier = res.data.courierName;
    order.shipping.labelUrl = res.data.shippingLabel;

    await order.save();
    return res.data;
  } catch (error) {
    console.error("Kwikship Waybill Error:", error.response?.data || error.message);
    throw new Error(error.response?.data?.message || error.message || "Failed to generate Kwikship waybill");
  }
};

/* ==============================
   TRACKING & STATUS
============================== */

const fetchStatus = async (waybill) => {
  const account = await getActiveAccount();
  const token = await getToken();
  const baseUrl = getBaseUrl(account);

  try {
    const res = await axios.get(`${baseUrl}/wayBillDetails`, {
      params: { waybill },
      headers: { Authorization: `Bearer ${token}` }
    });

    if (res.data.Status !== "SUCCESS") {
      throw new Error(res.data.message || "Failed to fetch tracking details");
    }

    const details = res.data.waybillDetails?.[0];
    if (details) {
      await Order.findOneAndUpdate(
        { "kwikship.waybill": waybill },
        { 
          "kwikship.status": details.currentStatus,
          "kwikship.lastUpdated": new Date()
        }
      );
    }

    return res.data;
  } catch (error) {
    console.error("Kwikship Status Error:", error.response?.data || error.message);
    throw error;
  }
};

/* ==============================
   CANCELLATION
============================== */

const cancelWaybill = async (waybill) => {
  const account = await getActiveAccount();
  const token = await getToken();
  const baseUrl = getBaseUrl(account);

  try {
    const res = await axios.post(`${baseUrl}/cancel`, { waybill }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (res.data.status === "SUCCESS") {
        await Order.findOneAndUpdate(
            { "kwikship.waybill": waybill },
            { "kwikship.status": "CANCELLED" }
        );
    }

    return res.data;
  } catch (error) {
    console.error("Kwikship Cancel Error:", error.response?.data || error.message);
    throw error;
  }
};

/* ==============================
   HIGH LEVEL WRAPPER
============================== */

const createFullShipment = async (orderId) => {
  return await createWaybill(orderId);
};

module.exports = {
  storeAccount,
  getActiveAccount,
  getToken,
  createWaybill,
  fetchStatus,
  cancelWaybill,
  createFullShipment
};
