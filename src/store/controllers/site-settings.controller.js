const {
  getSiteSettings,
  createOrUpdateSiteSettings,
} = require("../services/site-settings.service");

// Admin
exports.createOrUpdateWebsiteDetails = async (req, res) => {
  try {
    const adminId = req.user._id;

    const settings = await createOrUpdateSiteSettings(req.body, adminId);

    res.status(200).json({
      success: true,
      message: "Website details updated successfully",
      settings,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Public
exports.getWebsiteDetails = async (req, res) => {
  const settings = await getSiteSettings();
  res.status(200).json({ success: true, settings });
};
