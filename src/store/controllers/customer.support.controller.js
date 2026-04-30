const Return = require("../models/Return");
const Report = require("../models/Report");
const Order = require("../models/Order");
const Product = require("../models/Product");

const DEFAULT_RETURN_DAYS = 7;

/** Find the timestamp at which an item was marked delivered. */
const getDeliveredAt = (orderItem) => {
  if (orderItem?.shipping?.deliveredAt) return new Date(orderItem.shipping.deliveredAt);
  const hist = (orderItem?.statusHistory || []).filter(
    (h) => h.status === "delivered"
  );
  if (hist.length) return new Date(hist[hist.length - 1].updatedAt);
  return null;
};

exports.submitReturnRequest = async (req, res) => {
  try {
    const { orderId, vendorId, items, type, reason, images } = req.body;

    if (!orderId || !vendorId || !type || !reason) {
      return res.status(400).json({
        success: false,
        message: "orderId, vendorId, type and reason are required",
      });
    }
    if (!["return", "replace"].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "type must be 'return' or 'replace'",
      });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "items array is required",
      });
    }

    // 1. Order must exist and belong to this customer
    const order = await Order.findOne({ _id: orderId, customerId: req.user._id });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // 2. Each item must be in the order, delivered, returnable, and within window
    const productIds = items.map((i) => i.productId);
    const products = await Product.find({ _id: { $in: productIds } })
      .select("returnPolicy returnDays")
      .lean();
    const prodMap = new Map(products.map((p) => [p._id.toString(), p]));

    const now = Date.now();
    for (const item of items) {
      const orderItem = order.items.find(
        (oi) => oi.productId.toString() === String(item.productId)
      );
      if (!orderItem) {
        return res.status(400).json({
          success: false,
          message: `Item ${item.productId} not in order`,
        });
      }
      if (orderItem.status !== "delivered") {
        return res.status(400).json({
          success: false,
          message: `Item ${orderItem.name || item.productId} is not delivered yet — cannot ${type}`,
        });
      }
      const product = prodMap.get(String(item.productId));
      if (!product?.returnPolicy) {
        return res.status(400).json({
          success: false,
          message: `Item ${orderItem.name || item.productId} is not eligible for ${type}`,
        });
      }
      const deliveredAt = getDeliveredAt(orderItem);
      if (!deliveredAt) {
        return res.status(400).json({
          success: false,
          message: `Cannot determine delivery date for ${orderItem.name || item.productId}`,
        });
      }
      const daysSince = Math.floor((now - deliveredAt.getTime()) / (1000 * 60 * 60 * 24));
      const limit = product.returnDays || DEFAULT_RETURN_DAYS;
      if (daysSince > limit) {
        return res.status(400).json({
          success: false,
          message: `Return window expired for ${orderItem.name || item.productId} (delivered ${daysSince} days ago, limit ${limit})`,
        });
      }
      // Reject duplicate active returns for the same item
      const existing = await Return.findOne({
        orderId,
        customerId: req.user._id,
        "items.productId": item.productId,
        status: { $in: ["pending", "approved"] },
      });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: `An active ${existing.type} request already exists for ${orderItem.name || item.productId}`,
        });
      }
    }

    // 3. Vendor consistency — all items must belong to the same vendorId
    const itemVendorIds = new Set(
      items.map((it) => {
        const oi = order.items.find(
          (o) => o.productId.toString() === String(it.productId)
        );
        return oi?.vendorId?.toString();
      })
    );
    if (itemVendorIds.size > 1) {
      return res.status(400).json({
        success: false,
        message: "All items in a single return must be from the same vendor",
      });
    }

    // Snapshot price/name from the order (don't trust client-supplied values)
    const snapshotItems = items.map((it) => {
      const oi = order.items.find(
        (o) => o.productId.toString() === String(it.productId)
      );
      const qty = Math.min(
        Math.max(1, Number(it.quantity) || 1),
        oi?.quantity || 1
      );
      const perUnit = (oi?.totalPrice || 0) / Math.max(1, oi?.quantity || 1);
      return {
        productId: oi.productId,
        name: oi.name,
        quantity: qty,
        price: Number(perUnit.toFixed(2)),
        image: oi.image,
      };
    });

    const newReturn = new Return({
      orderId,
      vendorId,
      customerId: req.user._id,
      productId: snapshotItems[0].productId,
      items: snapshotItems,
      type,
      reason,
      images: images || [],
    });

    await newReturn.save();

    return res.status(201).json({
      success: true,
      message: "Return/Replace request submitted successfully",
      data: newReturn,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.submitReportIssue = async (req, res) => {
  try {
    const { orderId, content } = req.body;
    
    const newReport = new Report({
      orderId,
      customerId: req.user._id,
      content,
    });

    await newReport.save();

    return res.status(201).json({
      success: true,
      message: "Issue reported successfully",
      data: newReport,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getReturnByOrder = async (req, res) => {
  try {
    const returnRequest = await Return.findOne({
      orderId: req.params.orderId,
      customerId: req.user._id,
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: returnRequest,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
