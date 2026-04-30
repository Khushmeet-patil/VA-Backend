const Cart = require("../models/Cart");
const Product = require("../models/Product");
const Coupon = require("../models/Coupon");
const { createOrder } = require("./order.service");
const { resolveShippingAddress } = require("./shippingAddress.service");

exports.cartCheckout = async ({ userId, couponCode, shippingAddress, addressId, selectedItems }) => {
  const cart = await Cart.findOne({ userId });

  if (!cart || cart.items.length === 0) {
    throw new Error("Cart is empty");
  }

  const filteredCartItems = selectedItems && selectedItems.length > 0
    ? cart.items.filter(item => selectedItems.includes(item.productId.toString()))
    : cart.items;

  if (filteredCartItems.length === 0) {
    throw new Error("No selected items to checkout");
  }

  const items = filteredCartItems.map(item => ({
    productId: item.productId,
    quantity: item.quantity,
    size: item.size,
  }));

  const { order } = await createOrder({
    customerId: userId,
    items,
    shippingAddress,
    addressId,
    couponCode,
    paymentMethod: "razorpay",
  });

  // Clear only the checked-out items from cart
  const checkedOutIds = new Set(filteredCartItems.map(i => i.productId.toString()));
  await Cart.findOneAndUpdate(
    { userId },
    { $pull: { items: { productId: { $in: [...checkedOutIds] } } } }
  );

  return order;
};

exports.buyNowCheckout = async ({
  userId,
  productId,
  quantity,
  shippingAddress,
  addressId,
  paymentMethod = "razorpay",
}) => {
  if (!productId || !quantity) {
    throw new Error("ProductId & quantity required");
  }

  return await createOrder({
    customerId: userId,
    items: [
      {
        productId,
        quantity,
      },
    ],
    shippingAddress,
    addressId,
    paymentMethod,
    notes: "Buy Now Order",
  });
};

exports.buyNowSummary = async ({
  productId,
  quantity,
  couponCode,
}) => {
  const product = await Product.findById(productId);
  if (!product) throw new Error("Product not found");

  const mrp = product.pricing.mrp || product.pricing.basePrice || product.pricing.finalPrice;
  const totalMRP = mrp * quantity;

  const finalPriceTotal = product.pricing.finalPrice * quantity;

  let couponDiscount = 0;
  if (couponCode) {
    const coupon = await Coupon.findOne({ code: couponCode, isActive: true });
    if (!coupon) throw new Error("Invalid coupon");

    couponDiscount =
      coupon.discountType === "percentage"
        ? (finalPriceTotal * coupon.discountValue) / 100
        : coupon.discountValue;
  }

  const tax = 0; // Tax is now bundled in MRP and finalPrice
  const shippingFee = 0;
  const platformFee = 20;
  
  const totalAmount = finalPriceTotal - couponDiscount + platformFee;
  const discount = totalMRP - finalPriceTotal + couponDiscount;

  return {
    totalMRP,
    discount,
    tax,
    shippingFee,
    platformFee,
    totalAmount,
    subtotal: finalPriceTotal
  };
};

exports.cartSummary = async ({ userId, couponCode, selectedItems }) => {
  const cart = await Cart.findOne({ userId }).populate("items.productId");
  if (!cart || cart.items.length === 0) {
    throw new Error("Cart is empty");
  }

  // 🔥 FILTER SELECTED ITEMS
  const filteredCartItems = selectedItems && selectedItems.length > 0
    ? cart.items.filter(item => {
        const id = item.productId?._id || item.productId;
        return id && selectedItems.includes(id.toString());
      })
    : cart.items;

  if (filteredCartItems.length === 0) {
    return {
      totalMRP: 0,
      discount: 0,
      tax: 0,
      shippingFee: 0,
      platformFee: 20,
      totalAmount: 0,
    };
  }

  let totalMRP = 0;
  let finalPriceSum = 0;

  for (const item of filteredCartItems) {
    if (!item.productId) continue;
    const mrp = item.productId.pricing.mrp || item.productId.pricing.basePrice || item.productId.pricing.finalPrice;
    
    totalMRP += mrp * item.quantity;
    finalPriceSum += item.productId.pricing.finalPrice * item.quantity;
  }

  let couponDiscount = 0;

  if (couponCode) {
    const coupon = await Coupon.findOne({ code: couponCode, isActive: true });
    if (!coupon) throw new Error("Invalid coupon");

    couponDiscount =
      coupon.discountType === "percentage"
        ? (finalPriceSum * coupon.discountValue) / 100
        : coupon.discountValue;
  }

  const tax = 0;
  const shippingFee = 0;
  const platformFee = 20;
  const totalAmount = finalPriceSum - couponDiscount + platformFee;
  const discount = totalMRP - finalPriceSum + couponDiscount;

  return {
    totalMRP,
    discount,
    tax,
    shippingFee,
    platformFee,
    totalAmount,
    subtotal: finalPriceSum
  };
};
