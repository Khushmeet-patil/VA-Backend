const Purpose = require("../models/Purpose");

exports.getProductPurposes = async (req, res) => {
  try {
    const purposes = await Purpose.find({ isActive: true }).sort({ name: 1 });
    return res.status(200).json({
      success: true,
      count: purposes.length,
      data: purposes,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch purposes",
    });
  }
};

exports.getPurposeForPublic = async (req, res) => {
  try {
    const purposes = await productService.getPurposeForPublic();

    return res.status(200).json({
      success: true,
      count: purposes.length,
      purposes,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch purposes",
    });
  }
};
