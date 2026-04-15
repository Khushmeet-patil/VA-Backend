import Order from "../models/Order.js";
import ShiprocketService from "../services/ShiprocketService.js";

export const confirmOrderPayment = async ({
  orderId,
  razorpayData,
}) => {
  const order = await Order.findById(orderId);
  if (!order) throw new Error("Order not found");

  // ✅ mark paid
  order.paymentStatus = "paid";
  order.orderStatus = "confirmed";
  order.razorpay = razorpayData;
  order.paidAt = new Date();

  await order.save();

  // 🚚 SHIPROCKET INTEGRATION (HERE)
  await ShiprocketService.createFullShipment(order._id);

  return order;
};
