const wishlistService = require("../services/wishlist.service");

/* ================= ADD ================= */
exports.addToWishlist = async (req, res) => {
  try {
    const userId = req.user._id;
    const { productId, quantity, size } = req.body;

    await wishlistService.addToWishlist(userId, productId, quantity, size);

    return res.status(200).json({
      success: true,
      message: "Added to wishlist",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/* ================= REMOVE ================= */
exports.removeFromWishlist = async (req, res) => {
  try {
    const userId = req.user._id;
    const { productId } = req.params;

    await wishlistService.removeFromWishlist(userId, productId);

    return res.status(200).json({
      success: true,
      message: "Removed from wishlist",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/* ================= TOGGLE ================= */
exports.toggleWishlist = async (req, res) => {
  try {
    const userId = req.user._id;
    const { productId } = req.body;

    const result = await wishlistService.toggleWishlist(userId, productId);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/* ================= GET ================= */
exports.getWishlist = async (req, res) => {
  try {
    const userId = req.user._id;

    const wishlist = await wishlistService.getWishlist(userId);

    return res.status(200).json({
      success: true,
      count: wishlist.length,
      wishlist,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch wishlist",
    });
  }
};
