const userService = require("../services/customer.service");

exports.fetchMyProfile = async (req, res) => {
  try {
    const userId = req.user._id;

    const result = await userService.fetchMyProfile(userId);

    if (!result.success) {
      return res.status(404).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("Fetch profile error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch profile",
    });
  }
};

exports.updateMyProfile = async (req, res) => {
  try {
    const userId = req.user._id;

    const result = await userService.updateMyProfile(
      userId,
      req.body
    );

    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Profile update failed",
    });
  }
};
