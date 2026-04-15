const revenueService = require("../services/revenue.service");

/* ======================================================
   VENDOR REVENUE
====================================================== */
exports.getVendorRevenue = async (req, res) => {
  try {
    // 🔐 vendor comes from auth token
    const vendorId = req.user?.vendorId || req.user?._id;

    if (!vendorId) {
      return res.status(400).json({
        success: false,
        message: "Vendor not found in token",
      });
    }

    const { range = "monthly", startDate, endDate } = req.query;

    const data = await revenueService.getVendorRevenue(
      vendorId,
      range,
      startDate,
      endDate
    );

    return res.status(200).json({
      success: true,
      role: "vendor",
      range,
      data,
    });
  } catch (error) {
    console.error("Vendor revenue error:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Failed to fetch vendor revenue",
    });
  }
};

/* ======================================================
   ADMIN REVENUE
====================================================== */
exports.getAdminRevenue = async (req, res) => {
  try {
    const { range = "monthly", startDate, endDate } = req.query;

    const data = await revenueService.getAdminRevenue(
      range,
      startDate,
      endDate
    );

    return res.status(200).json({
      success: true,
      role: "admin",
      range,
      data,
    });
  } catch (error) {
    console.error("Admin revenue error:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Failed to fetch admin revenue",
    });
  }
};
