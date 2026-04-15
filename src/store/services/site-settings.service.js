const SiteSettings = require("../models/SiteSettings");

exports.getSiteSettings = async () => {
  const settings = await SiteSettings.findOne().lean();
  return settings || {};
};

exports.createOrUpdateSiteSettings = async (data, adminId) => {
  try {
    let settings = await SiteSettings.findOne();

    if (settings) {
      Object.assign(settings, data);
      settings.updatedBy = adminId;

      await settings.save();
      return settings;
    }

    settings = await SiteSettings.create({
      ...data,
      updatedBy: adminId,
    });

    return settings;
  } catch (error) {
    throw new Error(`Failed to save site settings: ${error.message}`);
  }
};