const Advertisement = require("../models/Advertisement");

/**
 * Get all advertisements
 */
exports.getAllAdvertisements = async (req, res) => {
  try {
    const ads = await Advertisement.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: ads });
  } catch (error) {
    console.error("Get advertisements error:", error);
    res.status(500).json({ success: false, message: "Server Error", error: error.message });
  }
};

/**
 * Get active advertisements
 */
exports.getActiveAdvertisements = async (req, res) => {
  try {
    const ads = await Advertisement.find({ isActive: true }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: ads });
  } catch (error) {
    console.error("Get active advertisements error:", error);
    res.status(500).json({ success: false, message: "Server Error", error: error.message });
  }
};

/**
 * Create a new advertisement
 */
exports.createAdvertisement = async (req, res) => {
  try {
    const { text, isActive } = req.body;

    if (!text) {
      return res.status(400).json({ success: false, message: "Text is required" });
    }

    const newAd = new Advertisement({
      text,
      isActive: isActive !== undefined ? isActive : true,
    });

    await newAd.save();
    res.status(201).json({ success: true, data: newAd });
  } catch (error) {
    console.error("Create advertisement error:", error);
    res.status(500).json({ success: false, message: "Server Error", error: error.message });
  }
};

/**
 * Update an existing advertisement
 */
exports.updateAdvertisement = async (req, res) => {
  try {
    const { id } = req.params;
    const { text, isActive } = req.body;

    const ad = await Advertisement.findById(id);
    if (!ad) {
      return res.status(404).json({ success: false, message: "Advertisement not found" });
    }

    if (text !== undefined) ad.text = text;
    if (isActive !== undefined) ad.isActive = isActive;

    await ad.save();
    res.status(200).json({ success: true, data: ad });
  } catch (error) {
    console.error("Update advertisement error:", error);
    res.status(500).json({ success: false, message: "Server Error", error: error.message });
  }
};

/**
 * Delete an advertisement
 */
exports.deleteAdvertisement = async (req, res) => {
  try {
    const { id } = req.params;

    const ad = await Advertisement.findByIdAndDelete(id);
    if (!ad) {
      return res.status(404).json({ success: false, message: "Advertisement not found" });
    }

    res.status(200).json({ success: true, message: "Advertisement deleted successfully" });
  } catch (error) {
    console.error("Delete advertisement error:", error);
    res.status(500).json({ success: false, message: "Server Error", error: error.message });
  }
};
