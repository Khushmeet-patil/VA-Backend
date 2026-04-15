const cartService = require("../services/cart.service");
const logger = require("../utils/logger");

/* ================= GET CART ================= */
exports.getCart = async (req, res) => {
  try {
    const cart = await cartService.getCart(req.user._id);

    return res.json({
      success: true,
      cart,
    });
  } catch (error) {
    logger.error("Get cart failed", { error: error.message });
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* ================= ADD TO CART ================= */
exports.addToCart = async (req, res) => {
  try {
    const { productId, quantity, size } = req.body;

    const cart = await cartService.addToCart(
      req.user._id,
      productId,
      quantity,
      size
    );

    return res.json({
      success: true,
      message: "Added to cart",
      cart,
    });
  } catch (error) {
    logger.error("Add to cart failed", { error: error.message });
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/* ================= UPDATE QUANTITY ================= */
exports.updateQuantity = async (req, res) => {
  try {
    const { productId, quantity, size } = req.body;

    const cart = await cartService.updateQuantity(
      req.user._id,
      productId,
      quantity,
      size
    );

    return res.json({
      success: true,
      cart,
    });
  } catch (error) {
    logger.error("Update quantity failed", { error: error.message });
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/* ================= REMOVE ITEM ================= */
exports.removeItem = async (req, res) => {
  try {
    const { productId } = req.params;
    const { size } = req.query;

    const cart = await cartService.removeItem(
      req.user._id,
      productId,
      size
    );

    return res.json({
      success: true,
      cart,
    });
  } catch (error) {
    logger.error("Remove item failed", { error: error.message });
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/* ================= CLEAR CART ================= */
exports.clearCart = async (req, res) => {
  try {
    const cart = await cartService.clearCart(req.user.id);

    return res.json({
      success: true,
      message: "Cart cleared",
      cart,
    });
  } catch (error) {
    logger.error("Clear cart failed", { error: error.message });
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
