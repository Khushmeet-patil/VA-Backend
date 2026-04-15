const productPurposes = require("../constants/purposes");
const productService = require("../services/meta.service");

exports.getProductPurposes = async (req, res) => {
  return res.status(200).json({
    success: true,
    count: productPurposes.length,
    data: productPurposes,
  });
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
