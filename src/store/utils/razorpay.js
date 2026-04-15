const Razorpay = require("razorpay");

const razorpay = new Razorpay({
  key_id: process.env.STORE_RAZORPAY_KEY_ID,
  key_secret: process.env.STORE_RAZORPAY_KEY_SECRET,
});

module.exports = razorpay;
