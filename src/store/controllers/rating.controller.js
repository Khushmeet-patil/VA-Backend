const ratingService = require("../services/rating.service");

/* ======================================================
   ADD / UPDATE RATING (USER)
====================================================== */
exports.addRating = async (req, res) => {
  try {
    const { productId, rating, review, images } = req.body;

    if (!productId || !rating) {
      return res.status(400).json({
        success: false,
        message: "Product ID and rating are required",
      });
    }

    const result = await ratingService.createOrUpdateRating({
      productId,
      userId: req.user._id,
      rating,
      review,
      images
    });

    return res.status(201).json({
      success: true,
      message: "Rating submitted successfully",
      rating: result,
    });
  } catch (error) {
    console.error("Add rating error:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Failed to submit rating",
    });
  }
};

/* ======================================================
   GET PRODUCT RATINGS (PUBLIC)
====================================================== */
exports.getProductRatings = async (req, res) => {
  try {
    const { productId } = req.params;

    const data = await ratingService.getProductRatings(productId);

    return res.status(200).json({
      success: true,
      ...data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch ratings",
    });
  }
};

/* ======================================================
   GET RATING BREAKDOWN (PUBLIC)
====================================================== */
exports.getRatingBreakdown = async (req, res) => {
  try {
    const { productId } = req.params;

    const breakdown = await ratingService.getRatingBreakdown(productId);

    return res.status(200).json({
      success: true,
      breakdown,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch rating breakdown",
    });
  }
};

/* ======================================================
   GET ALL RATINGS (ADMIN)
====================================================== */
exports.getAllRatingsForAdmin = async (req, res) => {
  try {
    const { page = 1, limit = 10, isActive } = req.query;

    const data = await ratingService.getAllRatingsForAdmin({
      page: Number(page),
      limit: Number(limit),
      isActive: isActive === undefined ? undefined : isActive === "true",
    });

    return res.status(200).json({
      success: true,
      ...data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch ratings",
    });
  }
};

/* ======================================================
   GET RATINGS BY PRODUCT (ADMIN)
====================================================== */
exports.getRatingsByProductAdmin = async (req, res) => {
  try {
    const { productId } = req.params;

    const ratings = await ratingService.getRatingsByProductAdmin(productId);

    return res.status(200).json({
      success: true,
      ratings,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch product ratings",
    });
  }
};

/* ======================================================
   GET RATINGS BY USER (ADMIN)
====================================================== */
exports.getRatingsByUserAdmin = async (req, res) => {
  try {
    // const { userId } = req.params;

    const ratings = await ratingService.getAllRatingsForAdmin();

    return res.status(200).json({
      success: true,
      ratings,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch user ratings",
    });
  }
};

/* ======================================================
   REMOVE RATING (VENDOR → SOFT DELETE)
====================================================== */
exports.removeRatingByVendor = async (req, res) => {
  try {
    const { ratingId } = req.params;

    const result = await ratingService.removeRatingByVendor(
      ratingId,
      req.user.id // vendorId from auth
    );

    return res.status(200).json({
      success: true,
      message: "Rating removed successfully",
      rating: result,
    });
  } catch (error) {
    return res.status(403).json({
      success: false,
      message: error.message,
    });
  }
};

/* ======================================================
   DELETE RATING (ADMIN → HARD DELETE)
====================================================== */
exports.deleteRatingByAdmin = async (req, res) => {
  try {
    const { ratingId } = req.params;

    await ratingService.deleteRatingByAdmin(ratingId);

    return res.status(200).json({
      success: true,
      message: "Rating deleted permanently",
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      message: error.message,
    });
  }
};

/* ======================================================
   GET VENDOR RATINGS (VENDOR DASHBOARD)
====================================================== */
exports.getVendorRatings = async (req, res) => {
  try {
    const vendorId = req.user.id;

    const ratings = await ratingService.getVendorRatings(vendorId);

    return res.status(200).json({
      success: true,
      ratings,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch vendor ratings",
    });
  }
};

/* ======================================================
   CHECK IF USER CAN REVIEW (DELIVERED ORDER)
====================================================== */
exports.checkReviewEligibility = async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.user._id;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required",
      });
    }

    const canReview = await ratingService.canUserReviewProduct(productId, userId);

    return res.status(200).json({
      success: true,
      canReview,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to check eligibility",
    });
  }
};
/* ======================================================
   ADD MANUAL RATING (ADMIN)
====================================================== */
exports.addManualRating = async (req, res) => {
  try {
    const { productId, rating, review, manualUserName } = req.body;

    if (!productId || !rating || !manualUserName) {
      return res.status(400).json({
        success: false,
        message: "Product ID, rating, and user name are required",
      });
    }

    const result = await ratingService.createManualRating({
      productId,
      rating,
      review,
      manualUserName
    });

    return res.status(201).json({
      success: true,
      message: "Manual rating added successfully",
      rating: result,
    });
  } catch (error) {
    console.error("Add manual rating error:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Failed to add manual rating",
    });
  }
};
