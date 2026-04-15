const dashboard = require("../services/admin.service"); 

exports.getAdminDashboard = async (req, res) => {
  try {
    const data = await dashboard.getAdminDashboardStats();

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load dashboard",
    });
  }
};
