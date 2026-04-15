const Cart = require("../models/Cart");
const Product = require("../models/Product");

/* ================= UTIL ================= */
const recalculateCart = (cart) => {
  let subtotal = 0;
  let totalItems = 0;

  cart.items.forEach((item) => {
    subtotal += item.priceAtAdd * item.quantity;
    totalItems += item.quantity;
  });

  cart.subtotal = subtotal;
  cart.totalItems = totalItems;
};

/* ================= GET CART ================= */
exports.getCart = async (userId) => {
  let cart = await Cart.findOne({ userId }).populate({
    path: "items.productId",
    populate: { path: "category", select: "name" }
  });

  if (!cart) {
    cart = await Cart.create({ userId, items: [] });
  }

  return cart;
};

/* ================= ADD TO CART ================= */
exports.addToCart = async (userId, productId, quantity = 1, size = null) => {
  const product = await Product.findById(productId);

  if (!product || !product.isVisible) {
    throw new Error("Product not available");
  }

  // If product has variants, check size-specific stock
  if (product.variants && product.variants.length > 0) {
    if (!size) {
      throw new Error("Please select a size");
    }
    const variant = product.variants.find((v) => v.size === size);
    if (!variant) {
      throw new Error("Invalid size selected");
    }
    if (variant.stock < quantity) {
      throw new Error(`Only ${variant.stock} units available for size ${size}`);
    }
  } else if (product.stock < quantity) {
    throw new Error("Insufficient stock");
  }

  let cart = await Cart.findOne({ userId });
  if (!cart) {
    cart = await Cart.create({ userId, items: [] });
  }

  // Find existing item with SAME product AND SAME size
  const existingItem = cart.items.find(
    (item) => item.productId.toString() === productId && item.size === size
  );

  if (existingItem) {
    // Check total quantity against stock
    if (product.variants && product.variants.length > 0) {
      const variant = product.variants.find((v) => v.size === size);
      if (variant.stock < existingItem.quantity + quantity) {
        throw new Error(`Only ${variant.stock} units available for size ${size}`);
      }
    } else if (product.stock < existingItem.quantity + quantity) {
      throw new Error("Insufficient stock");
    }
    existingItem.quantity += quantity;
  } else {
    cart.items.push({
      productId,
      quantity,
      priceAtAdd: product.pricing.finalPrice,
      size,
    });
  }

  recalculateCart(cart);
  await cart.save();

  return cart;
};

/* ================= UPDATE QUANTITY ================= */
exports.updateQuantity = async (userId, productId, quantity, size = null) => {
  if (quantity < 1) {
    throw new Error("Quantity must be at least 1");
  }

  const cart = await Cart.findOne({ userId });
  if (!cart) throw new Error("Cart not found");

  const item = cart.items.find(
    (i) => i.productId.toString() === productId && i.size === size
  );

  if (!item) throw new Error("Item not found in cart");

  // Validate stock for update
  const product = await Product.findById(productId);
  if (product.variants && product.variants.length > 0) {
    const variant = product.variants.find((v) => v.size === size);
    if (variant && variant.stock < quantity) {
      throw new Error(`Only ${variant.stock} units available for size ${size}`);
    }
  } else if (product.stock < quantity) {
    throw new Error("Insufficient stock");
  }

  item.quantity = quantity;
  recalculateCart(cart);
  await cart.save();

  return cart;
};

/* ================= REMOVE ITEM ================= */
exports.removeItem = async (userId, productId, size = null) => {
  const cart = await Cart.findOne({ userId });
  if (!cart) throw new Error("Cart not found");

  cart.items = cart.items.filter(
    (item) => !(item.productId.toString() === productId && item.size === size)
  );

  recalculateCart(cart);
  await cart.save();

  return cart;
};

/* ================= CLEAR CART ================= */
exports.clearCart = async (userId) => {
  return Cart.findOneAndUpdate(
    { userId },
    { items: [], subtotal: 0, totalItems: 0 },
    { new: true }
  );
};
