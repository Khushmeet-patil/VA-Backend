const dashboardService = require("../services/vendor.dashboard.service");

exports.getSummary = async (req, res) => {
  try {
    const data = await dashboardService.getVendorDashboardSummary(
      req.user.vendorId
    );
    res.json({ success: true, data });
  } catch (error) {
    console.error("Get Summary Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getRevenue = async (req, res) => {
  try {
    const year = req.query.year || new Date().getFullYear();
    const data = await dashboardService.getVendorRevenueByMonth(
      req.user.vendorId,
      year
    );
    res.json({ success: true, data });
  } catch (error) {
    console.error("Get Revenue Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getRecentActivity = async (req, res) => {
  try {
    const vendorId = req.user.vendorId;

    const activity = await dashboardService.getVendorRecentActivity(vendorId);

    res.status(200).json({
      success: true,
      data: activity,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch recent activity",
    });
  }
};

exports.getDailyStats = async (req, res) => {
  try {
    const days = req.query.days || 7;
    const vendorId = req.user.vendorId;

    const stats = await dashboardService.getVendorDailyStats(vendorId, days);

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Get Daily Stats Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch daily stats",
    });
  }
};

exports.getTopProducts = async (req, res) => {
  try {
    const limit = req.query.limit || 5;
    const vendorId = req.user.vendorId;

    const products = await dashboardService.getVendorTopProducts(vendorId, limit);

    res.status(200).json({
      success: true,
      data: products,
    });
  } catch (error) {
    console.error("Get Top Products Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch top products",
    });
  }
};
