const Return = require("../models/Return");
const KwikshipService = require("../services/kwikship.service");

exports.getVendorReturns = async (req, res) => {
  try {
    const returns = await Return.find({ vendorId: req.user.vendorId })
      .populate("orderId", "orderNumber")
      .populate("customerId", "firstName lastName email")
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

exports.updateReturnStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const returnRequest = await Return.findOneAndUpdate(
      { _id: req.params.id, vendorId: req.user.vendorId },
      { status },
      { new: true }
    );

    if (!returnRequest) {
      return res.status(404).json({
        success: false,
        message: "Return request not found",
      });
    }

    /* ======================================================
       When vendor approves return/replacement, auto-create
       a reverse Kwikship pickup (customer → vendor).
    ====================================================== */
    let kwikship = null;
    let kwikshipError = null;

    if (status === "approved" && !returnRequest.kwikship?.waybill) {
      try {
        const updated = await KwikshipService.createReverseShipment(
          returnRequest._id
        );
        kwikship = updated.kwikship;
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
