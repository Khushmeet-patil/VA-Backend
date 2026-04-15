const vendorService = require("../services/vendor.service");
const logger = require("../utils/logger"); // adjust path if needed

/* ================= APPLY ================= */
exports.createVendor = async (req, res) => {
  try {
    logger.info("Public vendor apply request", {
      body: req.body,
    });

    const vendor = await vendorService.createVendor(req.body);

    return res.status(201).json({
      success: true,
      message: "Vendor application submitted successfully",
      vendorId: vendor._id,
    });
  } catch (error) {
    logger.error("Vendor application failed", {
      message: error.message,
    });

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/* ================= LIST (ADMIN) ================= */
exports.getVendors = async (req, res) => {
  try {
    logger.info("Fetching vendors list", {
      status: req.query.status,
    });

    const { status, search } = req.query;

    const vendors = await vendorService.getVendors(status, search);

    return res.status(200).json({
      message: "Vendors fetched successfully",
      count: vendors.length,
      vendors,
    });
  } catch (error) {
    logger.error("Failed to fetch vendors", {
      message: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      message: "Failed to fetch vendors",
    });
  }
};

/* ================= VIEW ================= */
exports.getVendor = async (req, res) => {
  try {
    logger.info("Fetching vendor by id", {
      vendorId: req.params.id,
    });

    const vendor = await vendorService.getVendorById(req.params.id);

    return res.status(200).json({
      message: "Vendor fetched successfully",
      vendor,
    });
  } catch (error) {
    logger.error("Vendor not found", {
      vendorId: req.params.id,
      message: error.message,
    });

    return res.status(404).json({
      message: "Vendor not found",
      error: error.message,
    });
  }
};

/* ================= APPROVE ================= */
exports.approveVendor = async (req, res) => {
  try {
    logger.info("Approving vendor", {
      vendorId: req.params.id,
      notes: req.body.notes,
      commission: req.body.commissionRate,
    });

    const vendor = await vendorService.approveVendor(
      req.params.id,
      req.body.notes,
      req.body.commissionRate,
    );

    logger.info("Vendor approved successfully", {
      vendorId: vendor._id,
    });

    return res.status(200).json({
      message: "Vendor approved successfully",
      vendor,
    });
  } catch (error) {
    logger.error("Failed to approve vendor", {
      vendorId: req.params.id,
      message: error.message,
      stack: error.stack,
    });

    // If there's a more detailed error from the service, use it
    const errorMessage = error.errors
      ? Object.keys(error.errors)
          .map((key) => `${key}: ${error.errors[key].message}`)
          .join(", ")
      : error.message;

    return res.status(400).json({
      message: `Vendor approval failed: ${errorMessage}`,
      error: errorMessage,
    });
  }
};

/* ================= REJECT ================= */
exports.rejectVendor = async (req, res) => {
  try {
    logger.info("Rejecting vendor", {
      vendorId: req.params.id,
      reason: req.body.reason,
    });

    const vendor = await vendorService.rejectVendor(
      req.params.id,
      req.body.reason,
    );

    logger.info("Vendor rejected successfully", {
      vendorId: vendor._id,
    });

    return res.status(200).json({
      message: "Vendor rejected successfully",
      vendor,
    });
  } catch (error) {
    logger.error("Failed to reject vendor", {
      vendorId: req.params.id,
      message: error.message,
      stack: error.stack,
    });

    return res.status(400).json({
      message: "Vendor rejection failed",
      error: error.message,
    });
  }
};

exports.getVendorDashboard = async (req, res) => {
  try {
    const vendorId = req.user.id;

    const data = await vendorService.getVendorDashboardStats(vendorId);

    res.status(200).json({
      success: true,
      data,
    });
  } catch {
    res.status(500).json({
      success: false,
      message: "Failed to load dashboard",
    });
  }
};

exports.getVendorProfile = async (req, res) => {
  try {
    const vendor = await vendorService.getVendorProfile(req.user.vendorId);

    return res.status(200).json({
      success: true,
      vendor,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/* ================= UPDATE PROFILE ================= */
exports.updateVendorProfile = async (req, res) => {
  try {
    const result = await vendorService.updateVendorProfile(
      req.user.vendorId,
      req.body,
    );

    return res.status(200).json({
      success: true,
      message: result.requiresReapproval
        ? "Profile updated successfully. Admin verification is required before changes take effect."
        : "Profile updated successfully.",
      vendor: result.vendor,
      requiresReapproval: result.requiresReapproval,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

exports.approveVendorReverify = async (req, res) => {
  try {
    const vendorId = req.params.id;

    const vendor = await vendorService.approveVendorReverify(
      vendorId,
      req.user._id,
    );

    return res.status(200).json({
      success: true,
      message: "Vendor profile re-verified and approved",
      vendor,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/* ================= REJECT REVERIFY ================= */
exports.rejectVendorReverify = async (req, res) => {
  try {
    const vendorId = req.params.id;
    const { reason } = req.body;

    const vendor = await vendorService.rejectVendorReverify(
      vendorId,
      reason,
      req.user.id,
    );

    return res.status(200).json({
      success: true,
      message: "Vendor profile re-verification rejected",
      vendor,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const vendorId = req.params.id;
    const adminId = req.user._id;

    const { status, reason } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required",
      });
    }

    const vendor = await vendorService.updateVendorStatus({
      vendorId,
      status,
      adminId,
      reason,
    });

    return res.status(200).json({
      success: true,
      message:
        status === "approved"
          ? "Vendor activated successfully"
          : "Vendor suspended successfully",
      vendor,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

exports.resendVendorSetPasswordByAdmin = async (req, res) => {
  try {
    const vendorId = req.params.id;

    const result = await authService.adminResendVendorSetPassword(vendorId);

    return res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};
