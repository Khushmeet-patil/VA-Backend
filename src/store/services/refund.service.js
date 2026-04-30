/**
 * Refund service
 * --------------------------------------------------
 * Issues refunds when a return reaches completed state.
 *
 * - Razorpay-paid orders: calls Razorpay refund API.
 * - COD orders: marks the refund as "manual" — no online refund possible,
 *   admin must arrange the payout. Status is recorded so it shows up in admin.
 *
 * Idempotent: if a refund has already been issued for this Return, returns the
 * existing record without calling Razorpay again.
 */

const razorpay = require("../utils/razorpay");
const Order = require("../models/Order");
const Return = require("../models/Return");
const logger = require("../utils/logger");

/** Sum the refundable amount for a Return — uses item totalPrice from the order. */
const computeRefundAmount = (order, ret) => {
  const itemRefunds = (ret.items || []).map((retItem) => {
    const orderItem = order.items.find(
      (oi) => oi.productId.toString() === retItem.productId.toString()
    );
    if (!orderItem) return 0;
    // Refund proportional to qty being returned
    const qty = Math.max(1, Number(retItem.quantity) || 1);
    const perUnit = (orderItem.totalPrice || 0) / Math.max(1, orderItem.quantity || 1);
    return perUnit * qty;
  });
  return Math.round(itemRefunds.reduce((s, n) => s + n, 0) * 100) / 100;
};

/**
 * Issue a refund for a completed return.
 * Skips replacements (those don't refund — customer gets a new product).
 */
exports.issueRefundForReturn = async (returnId) => {
  const ret = await Return.findById(returnId).populate("orderId");
  if (!ret) throw new Error("Return not found");

  if (ret.type !== "return") {
    return { skipped: true, reason: "not a refund-eligible return type" };
  }
  if (ret.refund?.status === "completed" || ret.refund?.status === "processed") {
    return { skipped: true, reason: "already refunded", refund: ret.refund };
  }

  const order = ret.orderId;
  if (!order) throw new Error("Order for return not found");

  const amount = computeRefundAmount(order, ret);
  if (amount <= 0) {
    throw new Error("Refund amount is zero — nothing to refund");
  }

  const isRazorpay =
    String(order.paymentMethod || "").toLowerCase() === "razorpay" &&
    order.razorpay?.paymentId &&
    order.paymentStatus === "paid";

  let refundRecord;

  if (isRazorpay) {
    try {
      const rpRefund = await razorpay.payments.refund(order.razorpay.paymentId, {
        amount: Math.round(amount * 100), // paise
        speed: "normal",
        notes: {
          returnId: ret._id.toString(),
          orderId: order._id.toString(),
        },
      });
      refundRecord = {
        status: "completed",
        amount,
        method: "razorpay",
        razorpayRefundId: rpRefund.id,
        processedAt: new Date(),
      };
      logger.info("Razorpay refund issued", {
        returnId: ret._id.toString(),
        orderId: order._id.toString(),
        amount,
        rpRefundId: rpRefund.id,
      });
    } catch (err) {
      logger.error("Razorpay refund failed", {
        returnId: ret._id.toString(),
        orderId: order._id.toString(),
        amount,
        message: err.message,
      });
      throw new Error(`Razorpay refund failed: ${err.message}`);
    }
  } else {
    // COD or unpaid order — refund must be handled manually
    refundRecord = {
      status: "manual_pending",
      amount,
      method: "manual",
      processedAt: null,
      note: "COD or unpaid order — admin to settle manually",
    };
    logger.info("Refund queued for manual settlement (COD)", {
      returnId: ret._id.toString(),
      orderId: order._id.toString(),
      amount,
    });
  }

  // Persist on Return + Order
  ret.refund = refundRecord;
  await ret.save();

  // Mark refund on order — only flip paymentStatus if fully refunded
  const orderRefundUpdate = {
    "refund.status": refundRecord.status === "completed" ? "completed" : "pending",
    "refund.amount": (order.refund?.amount || 0) + amount,
    "refund.refundedAt": refundRecord.status === "completed" ? new Date() : null,
  };
  if (refundRecord.status === "completed" && amount >= (order.totalAmount || 0)) {
    orderRefundUpdate.paymentStatus = "refunded";
  }
  await Order.updateOne({ _id: order._id }, { $set: orderRefundUpdate });

  // Mark each refunded item
  const refundedProductIds = new Set((ret.items || []).map((i) => i.productId.toString()));
  await Order.updateOne(
    { _id: order._id },
    {
      $set: { "items.$[elem].status": "refunded" },
      $push: {
        "items.$[elem].statusHistory": {
          status: "refunded",
          updatedAt: new Date(),
          updatedBy: "system",
          note: `Refund: ${refundRecord.method} (${refundRecord.status})`,
        },
      },
    },
    {
      arrayFilters: [{ "elem.productId": { $in: [...refundedProductIds] } }],
    }
  );

  return { skipped: false, refund: refundRecord };
};
