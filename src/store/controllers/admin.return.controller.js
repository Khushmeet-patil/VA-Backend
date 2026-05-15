const Return = require("../models/Return");
const KwikshipService = require("../services/kwikship.service");
const gokwikOutbound = require("../services/gokwik.outbound.service");
const Order = require("../models/Order");

/**
 * Fetch all return/replacement requests for Admin panel.
 */
exports.getAdminReturns = async (req, res) => {
  try {
    const returns = await Return.find({})
      .populate("orderId", "orderNumber")
      .populate("vendorId", "storeName storeEmail")
      .populate("customerId", "firstName lastName email mobile")
      .populate("productId", "name images")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: returns.length,
      data: returns,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Admin can also approve/reject return requests.
 */
exports.updateReturnStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const returnRequest = await Return.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!returnRequest) {
      return res.status(404).json({
        success: false,
        message: "Return request not found",
      });
    }

    let kwikship = null;
    let kwikshipError = null;

    // Auto-create reverse shipment if approved and not already created
    if (status === "approved" && !returnRequest.kwikship?.waybill) {
      try {
        const updated = await KwikshipService.createReverseShipment(
          returnRequest._id
        );
        kwikship = updated.kwikship;

        // Sync to GoKwik if it's a return (which implies refund)
        const order = await Order.findById(returnRequest.orderId);
        if (order) {
           const refundAmount = returnRequest.type === "return" ? returnRequest.refund?.amount : null;
           await gokwikOutbound.updateOrder(order, refundAmount);
        }
      } catch (err) {
        kwikshipError = err.message;
      }
    }

    return res.status(200).json({
      success: true,
      data: returnRequest,
      kwikship,
      kwikshipError,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
