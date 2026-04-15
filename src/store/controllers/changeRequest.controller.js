const changeRequestService = require("../services/changeRequest.service");

exports.getPendingRequests = async (req, res) => {
  try {
    const requests = await changeRequestService.getPendingRequests();

    res.json({
      success: true,
      data: requests,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

exports.getRequestById = async (req, res) => {
  try {
    const request = await changeRequestService.getRequestById(req.params.id);

    res.json({
      success: true,
      data: request,
    });
  } catch (err) {
    res.status(404).json({
      success: false,
      message: err.message,
    });
  }
};

exports.approveRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user._id;

    const result = await changeRequestService.approveRequest(id, adminId);

    res.json({
      success: true,
      message: "Change request approved and applied successfully",
      data: result,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

exports.rejectRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.user._id;

    const result = await changeRequestService.rejectRequest(id, reason, adminId);

    res.json({
      success: true,
      message: "Change request rejected successfully",
      data: result,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};
