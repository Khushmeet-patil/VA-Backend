const KwikshipService = require("../services/kwikship.service.js");
const Order = require("../models/Order.js");
const refundService = require("../services/refund.service.js");

/* =========================
   ADMIN: ADD / UPDATE ACCOUNT
========================= */

exports.addKwikshipAccount = async (req, res) => {
  try {
    const account = await KwikshipService.storeAccount(req.body);

    res.status(201).json({
      success: true,
      message: "Kwikship account added",
      data: account,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getActiveKwikshipAccount = async (req, res) => {
  try {
    const account = await KwikshipService.getActiveAccount();
    res.json({ success: true, data: account });
  } catch (err) {
    res.status(404).json({ success: false, message: err.message });
  }
};

/* =========================
   INTERNAL: CREATE SHIPMENT (whole order — all vendors)
========================= */

exports.createShipment = async (req, res) => {
  try {
    const { orderId } = req.params;

    const result = await KwikshipService.createShipmentsForOrder(orderId);

    res.json({
      success: true,
      message: "Shipment created successfully",
      data: result,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

/* =========================
   INTERNAL: CREATE SHIPMENT FOR ONE VENDOR
========================= */

exports.createShipmentForVendor = async (req, res) => {
  try {
    const { orderId, vendorId } = req.params;
    const result = await KwikshipService.createForwardShipmentForVendor(
      orderId,
      vendorId
    );
    res.json({
      success: true,
      message: "Vendor shipment created",
      waybill: result.waybill,
      courierName: result.courierName,
      expectedDelivery: result.edd,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

/* =========================
   TRACKING: FETCH STATUS
======================== */

exports.getTrackingStatus = async (req, res) => {
    try {
        const { waybill } = req.params;
        const result = await KwikshipService.fetchStatus(waybill);
        res.json({
            success: true,
            data: result
        });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

/* =========================
   CUSTOMER: ORDER TRACKING (all vendor waybills)
   GET /store/api/customer/order/:orderId/tracking
========================= */
exports.getCustomerOrderTracking = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findOne({
      _id: orderId,
      customerId: req.user._id,
    }).lean();

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const waybills = [
      ...new Set(
        order.items
          .map((i) => i.kwikship?.waybill)
          .filter(Boolean)
      ),
    ];

    // Refresh statuses best-effort (up to 20 at a time)
    let liveDetails = [];
    if (waybills.length) {
      try {
        const chunks = [];
        for (let i = 0; i < waybills.length; i += 20) {
          chunks.push(waybills.slice(i, i + 20));
        }
        for (const c of chunks) {
          const r = await KwikshipService.fetchStatus(c);
          if (r?.waybillDetails) liveDetails.push(...r.waybillDetails);
        }
      } catch (e) {
        // Fall back to cached statuses on our order items
        console.warn("[Kwikship] Live fetch failed:", e.message);
      }
    }

    const shipments = order.items
      .filter((i) => i.kwikship?.waybill)
      .map((i) => {
        const live = liveDetails.find((d) => d.waybill === i.kwikship.waybill);
        return {
          itemId: i._id,
          productName: i.name,
          image: i.image,
          quantity: i.quantity,
          waybill: i.kwikship.waybill,
          courierName: i.kwikship.courierName,
          expectedDelivery: i.kwikship.edd,
          status: live?.currentStatus || i.kwikship.status,
          statusDate: live?.statusDate || i.kwikship.lastUpdated,
          labelUrl: i.kwikship.shippingLabel,
        };
      });

    return res.json({
      success: true,
      orderNumber: order.orderNumber,
      orderStatus: order.orderStatus,
      shipments,
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

/* =========================
   ADMIN: CANCEL WAYBILL
========================= */
exports.cancelWaybill = async (req, res) => {
  try {
    const { waybill } = req.params;
    const result = await KwikshipService.cancelWaybill(waybill);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

/* =========================
   ADMIN: RETRY REFUND for a Return
   POST /store/api/admin/kwikship/return/:returnId/refund
========================= */
exports.retryRefund = async (req, res) => {
  try {
    const { returnId } = req.params;
    const result = await refundService.issueRefundForReturn(returnId);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

/* =========================
   ADMIN: RETRY REPLACEMENT FORWARD-SHIPMENT
   POST /store/api/admin/kwikship/return/:returnId/replacement
========================= */
exports.retryReplacementForward = async (req, res) => {
  try {
    const { returnId } = req.params;
    const result = await KwikshipService.createReplacementForward(returnId);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
