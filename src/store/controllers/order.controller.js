const orderService = require("../services/order.service");

/* ================= INITIATE PAYMENT ================= */
exports.initiatePayment = async (req, res) => {
  try {
    const { items, couponCode } = req.body;

    const result = await orderService.initiatePayment({
      customerId: req.user._id,
      items,
      couponCode,
    });

    return res.json({
      success: true,
      payableAmount: result.payableAmount,
      razorpay: result.razorpay,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/* ================= CREATE ORDER (Direct/COD) ================= */
exports.createOrder = async (req, res) => {
  try {
    const { order } = await orderService.createOrder({
      customerId: req.user._id,
      ...req.body,
    });

    return res.status(201).json({
      success: true,
      order,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/* ================= VERIFY PAYMENT & CREATE ORDER ================= */
exports.verifyPaymentAndCreateOrder = async (req, res) => {
  try {
    const order = await orderService.verifyPaymentAndCreateOrder({
      customerId: req.user._id,
      ...req.body,
    });

    return res.status(201).json({
      success: true,
      order,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/* ================= CUSTOMER ORDERS ================= */
exports.myOrders = async (req, res) => {
  try {
    const orders = await orderService.getCustomerOrders(req.user._id);

    return res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch your orders",
    });
  }
};

/* ================= VENDOR ORDERS ================= */
exports.vendorOrders = async (req, res) => {
  try {
    const orders = await orderService.getVendorOrders(req.user.vendorId);

    return res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* ================= ADMIN ORDERS ================= */
exports.getAllOrders = async (req, res) => {
  try {
    const { page, limit, status, vendorId, paymentStatus } = req.query;

    const orders = await orderService.getAllOrders({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      status,
      vendorId,
      paymentStatus,
    });

    return res.json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* ================= UPDATE ITEM STATUS ================= */
exports.updateItemStatus = async (req, res) => {
  try {
    const order = await orderService.updateItemStatus({
      orderId: req.params.id,
      itemId: req.body.itemId,
      status: req.body.status,
      vendorId: req.user.vendorId,
    });

    return res.json({
      success: true,
      order,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/* ================= GET SINGLE ORDER ================= */
exports.getSingleOrderController = async (req, res) => {
  try {
    const result = await orderService.getSingleOrder(
      req.params.id,
      req.user
    );

    return res.status(200).json(result);
  } catch (error) {
    return res.status(404).json({
      success: false,
      message: error.message,
    });
  }
};

exports.vendorConfirmOrder = async (req, res) => {
  try {
    const vendorId = req.user.vendorId;
    const orderId = req.params.id;
    console.log("[VendorConfirm] orderId:", orderId, "vendorId:", vendorId);

    const result = await orderService.confirmOrder(orderId, vendorId);
    console.log("[VendorConfirm] result:", JSON.stringify(result));

    res.json(result);
  } catch (err) {
    console.error("[VendorConfirm] ERROR:", err.message);
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

