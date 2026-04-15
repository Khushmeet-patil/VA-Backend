const crypto = require("crypto");
const Order = require("../models/Order");

exports.razorpayWebhook = async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(req.body.toString())
    .digest("hex");

  if (expected !== req.headers["x-razorpay-signature"]) {
    return res.status(400).send("Invalid signature");
  }

  const event = JSON.parse(req.body.toString());

  if (event.event === "payment.captured") {
    const payment = event.payload.payment.entity;

    const order = await Order.findOne({
      "razorpay.orderId": payment.order_id,
    });

    if (order && order.paymentStatus !== "paid") {
      order.paymentStatus = "paid";
      order.orderStatus = "confirmed";
      order.razorpay.paymentId = payment.id;
      await order.save();
    }
  }

  res.json({ received: true });
};
