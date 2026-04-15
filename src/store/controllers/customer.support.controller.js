const Return = require("../models/Return");
const Report = require("../models/Report");

exports.submitReturnRequest = async (req, res) => {
  try {
    const { orderId, vendorId, items, type, reason, images } = req.body;
    
    // Extract top-level productId for the vendor panel's convenience
    const mainProductId = items && items.length > 0 ? items[0].productId : null;

    const newReturn = new Return({
      orderId,
      vendorId,
      customerId: req.user._id,
      productId: mainProductId,
      items,
      type,
      reason,
      images,
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
