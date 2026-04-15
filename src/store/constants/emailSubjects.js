const EMAIL_SUBJECTS = {
  /* ================= AUTH ================= */
  RESET_PASSWORD: "🔐 Reset Your Password",
  SET_PASSWORD: "🔑 Set Your Password",
  RESEND_SET_PASSWORD: "🔁 Set Your Password (Reminder)",

  /* ================= VENDOR (ONBOARDING) ================= */
  VENDOR_APPROVED: "🎉 Vendor Application Approved",
  VENDOR_REJECTED: "❌ Vendor Application Rejected",
  VENDOR_REGISTER: "📝 Vendor Registration Received",

  /* ================= VENDOR (RE-VERIFICATION) ================= */
  VENDOR_REVERIFY_REQUIRED: "⚠️ Vendor Re-Verification Required",
  VENDOR_REVERIFY_APPROVED: "✅ Vendor Re-Verification Approved",
  VENDOR_REVERIFY_REJECTED: "❌ Vendor Re-Verification Rejected",

  /* ================= PRODUCT ================= */
  PRODUCT_APPROVED: "🎉 Product Approved",
  PRODUCT_REJECTED: "❌ Product Rejected – Action Required",

  /* ================= ORDERS (CUSTOMER) ================= */
  ORDER_CREATED: "🛒 Order Placed Successfully",
  ORDER_CONFIRMED: "✅ Order Confirmed",
  ORDER_CANCELLED: "❌ Order Cancelled",
  ORDER_REFUNDED: "💸 Refund Initiated",

  /* ================= ORDERS (VENDOR) ================= */
  VENDOR_NEW_ORDER: "🛒 New Order Received",
  VENDOR_ORDER_CANCELLED: "❌ Order Cancelled by Customer",
  VENDOR_ORDER_RETURNED: "↩️ Order Returned",

  /* ================= SHIPPING ================= */
  ORDER_SHIPPED: "📦 Order Shipped",
  ORDER_DELIVERED: "✅ Order Delivered",

  /* ================= PAYMENT ================= */
  PAYMENT_SUCCESS: "💳 Payment Successful",
  PAYMENT_FAILED: "⚠️ Payment Failed",

  /* ================= VENDOR (WITHDRAWALS) ================= */
  VENDOR_WITHDRAWAL_APPROVED: "💸 Withdrawal Request Approved",
  VENDOR_WITHDRAWAL_REJECTED: "❌ Withdrawal Request Rejected",
  VENDOR_WITHDRAWAL_PAID: "💰 Withdrawal Payment Completed",

  /* ================= ADMIN ================= */
  ADMIN_NEW_ORDER: "🛒 New Order Placed",
  ADMIN_ORDER_CANCELLED: "❌ Order Cancelled",
};

module.exports = EMAIL_SUBJECTS;
