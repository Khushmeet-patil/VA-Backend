const gokwikService = require("../services/gokwik.service");
const logger = require("../utils/logger");

/* ================= POST /get-cart ================= */
exports.getCart = async (req, res) => {
  try {
    const { cart_id } = req.body;
    logger.info("GoKwik getCart called", {
      cart_id,
      ip: req.ip,
      headers: req.headers,
    });

    if (!cart_id) {
      return res.status(400).json({ error: "cart_id is required" });
    }

    const cart = await gokwikService.getCartByGokwikId(cart_id);
    const gkCart = gokwikService.buildGokwikCart(cart);

    logger.info("GoKwik getCart success", { cart_id, itemCount: gkCart.items?.length });
    return res.json({ data: { cart: gkCart } });
  } catch (error) {
    logger.error("GoKwik getCart failed", { cart_id: req.body?.cart_id, error: error.message });
    return res.status(500).json({ error: error.message });
  }
};

/* ================= POST /set-shipping-address ================= */
exports.setShippingAddress = async (req, res) => {
  try {
    const { cart_id } = req.body;
    if (!cart_id) {
      return res.status(400).json({ error: "cart_id is required" });
    }

    const gkCart = await gokwikService.setShippingAddress(cart_id);
    return res.json({ data: { cart: gkCart } });
  } catch (error) {
    logger.error("GoKwik setShippingAddress failed", { error: error.message });
    return res.status(500).json({ error: error.message });
  }
};

/* ================= POST /place-order ================= */
exports.placeOrder = async (req, res) => {
  try {
    const { cart_id } = req.body;
    if (!cart_id) {
      return res.status(400).json({ error: "cart_id is required" });
    }

    const order = await gokwikService.placeGokwikOrder(cart_id, req.body);
    const orderId = String(order?.orderNumber || order?._id || "");
    if (!orderId) throw new Error("Order created but ID could not be resolved");
    const thank_you_url = `https://www.vedicastro.co.in/store/thank-you?order_id=${orderId}`;
    return res.json({ 
      status: "success", 
      order_id: orderId, 
      thankyou_redirect_url: thank_you_url 
    });
  } catch (error) {
    logger.error("GoKwik placeOrder failed", { error: error.message });
    return res.status(500).json({ error: error.message });
  }
};

/* ================= POST /check-order-exists ================= */
exports.checkOrderExists = async (req, res) => {
  try {
    const { session_key } = req.body;
    if (!session_key) {
      return res.status(404).json({ message: "No order found." });
    }

    const order = await gokwikService.checkOrderExists(session_key);
    if (order) {
      return res.json({ order_id: order.orderNumber, message: "Order exists." });
    }
    return res.status(404).json({ message: "No order found." });
  } catch (error) {
    logger.error("GoKwik checkOrderExists failed", { error: error.message });
    return res.status(500).json({ message: "No order found." });
  }
};

/* ================= POST /remove-out-of-stock-items ================= */
exports.removeOutOfStockItems = async (req, res) => {
  try {
    const { cart_id } = req.body;
    if (!cart_id) {
      return res.status(400).json({ error: "cart_id is required" });
    }

    const gkCart = await gokwikService.removeOutOfStockItems(cart_id);
    return res.json({ data: { cart: gkCart } });
  } catch (error) {
    logger.error("GoKwik removeOutOfStockItems failed", { error: error.message });
    return res.status(500).json({ error: error.message });
  }
};

/* ================= POST /order-update (GoKwik → us webhook) ================= */
exports.orderUpdate = async (req, res) => {
  try {
    const { merchant_order_id } = req.body;
    if (!merchant_order_id) {
      return res.status(400).json({ status_code: 400, error: "merchant_order_id is required" });
    }

    await gokwikService.updateOrderFromGokwik(req.body);
    return res.json({ status_code: 200, success: true });
  } catch (error) {
    logger.error("GoKwik orderUpdate webhook failed", { error: error.message });
    return res.status(500).json({ status_code: 500, error: error.message });
  }
};

/* ================= POST /sync-all (Admin only) ================= */
const gokwikOutbound = require("../services/gokwik.outbound.service");

exports.syncEverything = async (req, res) => {
  try {
    logger.info("Admin triggered GoKwik full sync");
    const result = await gokwikOutbound.syncEverything();
    return res.json(result);
  } catch (error) {
    logger.error("GoKwik syncEverything controller failed", { error: error.message });
    return res.status(500).json({ success: false, message: error.message });
  }
};
