const activityService = require("../services/activity.service");

exports.getRecentActivity = async (req, res) => {
  try {
    const { role, _id: userId } = req.user;

    const activities = await activityService.getAllActivities({
      role,
      userId: role !== "admin" ? userId : null,
      limit: 8,
    });

    return res.status(200).json({
      success: true,
      data: activities,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch recent activity",
    });
  }
};
