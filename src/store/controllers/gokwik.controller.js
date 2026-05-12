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
const axios = require("axios");

exports.syncEverything = async (req, res) => {
  try {
    logger.info("Admin triggered GoKwik full sync");
    const result = await gokwikOutbound.syncEverything();

    if (!result.success) {
      return res.status(400).json(result);
    }

    // After sync, verify by fetching products from GoKwik sandbox
    let verification = null;
    try {
      const GK_ENV = (process.env.GK_ENV || "sandbox").trim().toLowerCase();
      const GK_MID = GK_ENV === "production" ? (process.env.GK_PROD_MID || "").trim() : (process.env.GK_SANDBOX_MID || "").trim();
      const GK_APP_ID = GK_ENV === "production" ? (process.env.GK_PROD_APP_ID || "").trim() : (process.env.GK_SANDBOX_APP_ID || "").trim();
      const GK_APP_SECRET = GK_ENV === "production" ? (process.env.GK_PROD_APP_SECRET || "").trim() : (process.env.GK_SANDBOX_APP_SECRET || "").trim();
      const IS_SANDBOX = GK_ENV === "sandbox" || GK_MID === "19vhta8dq0co";

      const verifyUrl = IS_SANDBOX
          ? "https://api-gw-v4.dev.gokwik.io/sandbox"
          : (process.env.GK_API_BASE_URL || "https://api.gokwik.co");

      const verifyRes = await axios.get(
        `${verifyUrl}/v3/product/all?page=1&limit=5`,
        {
          headers: {
            "gk-app-id": GK_APP_ID || "",
            "gk-app-secret": GK_APP_SECRET || "",
            "gk-merchant-id": GK_MID,
            "app_name": "checkout",
          },
          timeout: 10000,
        }
      );
      verification = {
        status: "verified",
        productsOnGokwik: verifyRes.data?.data?.length || 0,
        sampleProducts: (verifyRes.data?.data || []).slice(0, 3).map(p => ({
          id: p.id,
          title: p.title,
          status: p.status,
        })),
      };
    } catch (verifyErr) {
      const errorData = verifyErr?.response?.data;
      const errorMessage = (typeof errorData === 'object' && errorData !== null) 
        ? (errorData.message || JSON.stringify(errorData)) 
        : (errorData || verifyErr.message);

      verification = {
        status: "verification_failed",
        error: errorMessage,
      };
    }

    return res.json({
      ...result,
      verification,
    });
  } catch (error) {
    logger.error("GoKwik syncEverything controller failed", { error: error.message });
    return res.status(500).json({ success: false, message: error.message });
  }
};

/* ================= POST /abandoned-cart ================= */
exports.handleAbandonedCart = async (req, res) => {
  try {
    const { carts } = req.body;
    logger.info("GoKwik abandoned carts received", { count: carts?.length || 0 });

    if (carts && carts.length > 0) {
      carts.forEach((cart) => {
        logger.info("Abandoned cart details", {
          phone: cart.customer?.phone || cart.phone,
          total: cart.total_price,
          itemsCount: cart.items?.length,
        });
      });
    }

    return res.json({ status: "success", message: "Abandoned carts processed" });
  } catch (error) {
    logger.error("GoKwik abandoned cart webhook failed", { error: error.message });
    return res.status(500).json({ error: error.message });
  }
};

/* ================= POST /webhooks/transaction ================= */
exports.handleTransactionWebhook = async (req, res) => {
  try {
    const { event, data } = req.body;
    logger.info("GoKwik transaction webhook received", { event, paymentId: data?.paymentId });

    if (!data?.merchantReferenceId) {
      return res.status(400).json({ status_code: 400, error: "merchantReferenceId is required" });
    }

    await gokwikService.processTransactionWebhook(req.body);
    return res.json({ status_code: 200, success: true });
  } catch (error) {
    logger.error("GoKwik transaction webhook failed", { error: error.message });
    return res.status(500).json({ status_code: 500, error: error.message });
  }
};

/* ================= POST /webhooks/refund ================= */
exports.handleRefundWebhook = async (req, res) => {
  try {
    const { event, data } = req.body;
    logger.info("GoKwik refund webhook received", { event, refundId: data?.refundId });

    if (!data?.merchantReferenceId) {
      return res.status(400).json({ status_code: 400, error: "merchantReferenceId is required" });
    }

    await gokwikService.processRefundWebhook(req.body);
    return res.json({ status_code: 200, success: true });
  } catch (error) {
    logger.error("GoKwik refund webhook failed", { error: error.message });
    return res.status(500).json({ status_code: 500, error: error.message });
  }
};
