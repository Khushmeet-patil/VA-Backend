const mongoose = require("mongoose");
const Rating = require("../models/Rating");
const Product = require("../models/Product");
const Order = require("../models/Order");

/* ======================================================
   CREATE / UPDATE RATING (USER)
====================================================== */
exports.createOrUpdateRating = async ({
  productId,
  userId,
  rating,
  review,
  images = [],
}) => {
  // 🔹 Check if user has purchased the product (delivered)
  const canReview = await exports.canUserReviewProduct(productId, userId);
  if (!canReview) {
    throw new Error("You can only review products you have purchased and received.");
  }

  if (!productId || !userId || !rating) {
    throw new Error("Missing required fields");
  }

  if (rating < 1 || rating > 5) {
    throw new Error("Rating must be between 1 and 5");
  }

  // 🔹 Fetch product to get vendorId (MOVED HERE)
  const product = await Product.findById(productId).select("vendorId");

  if (!product) {
    throw new Error("Product not found");
  }

  const result = await Rating.findOneAndUpdate(
    { productId, userId },
    {
      productId,
      userId,
      vendorId: product.vendorId,
      rating,
      review,
      images,
      isActive: true,
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );

  return result;
};

/* ======================================================
   GET ALL RATINGS OF A PRODUCT (PUBLIC)
====================================================== */
exports.getProductRatings = async (productId) => {
  const ratings = await Rating.find({
    productId,
    isActive: true,
  })
    .populate("userId", "name")
    .sort({ createdAt: -1 });

  const stats = await Rating.aggregate([
    {
      $match: {
        productId: new mongoose.Types.ObjectId(productId),
        isActive: true,
      },
    },
    {
      $group: {
        _id: "$productId",
        averageRating: { $avg: "$rating" },
        totalRatings: { $sum: 1 },
      },
    },
  ]);

  return {
    ratings,
    averageRating: Number(stats[0]?.averageRating?.toFixed(1)) || 0,
    totalRatings: stats[0]?.totalRatings || 0,
  };
};

/* ======================================================
   GET RATING BREAKDOWN (5⭐ → 1⭐)
====================================================== */
exports.getRatingBreakdown = async (productId) => {
  const breakdown = await Rating.aggregate([
    {
      $match: {
        productId: new mongoose.Types.ObjectId(productId),
        isActive: true,
      },
    },
    {
      $group: {
        _id: "$rating",
        count: { $sum: 1 },
      },
    },
  ]);

  const result = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  breakdown.forEach((item) => {
    result[item._id] = item.count;
  });

  return result;
};

/* ======================================================
   REMOVE RATING (VENDOR → SOFT DELETE)
====================================================== */
exports.removeRatingByVendor = async (ratingId, vendorId) => {
  const rating = await Rating.findOne({
    _id: ratingId,
    vendorId,
    isActive: true,
  });

  if (!rating) {
    throw new Error("Rating not found or unauthorized");
  }

  rating.isActive = false;
  await rating.save();

  return rating;
};

/* ======================================================
   REMOVE RATING (ADMIN → HARD DELETE)
====================================================== */
exports.deleteRatingByAdmin = async (ratingId) => {
  const rating = await Rating.findById(ratingId);

  if (!rating) {
    throw new Error("Rating not found");
  }

  await Rating.findByIdAndDelete(ratingId);
  return true;
};

/* ======================================================
   GET ALL RATINGS FOR VENDOR DASHBOARD
====================================================== */
exports.getVendorRatings = async (vendorId) => {
  return Rating.find({
    vendorId,
    isActive: true,
  })
    .populate("productId", "name")
    .populate("userId", "name")
    .sort({ createdAt: -1 });
};

/* ======================================================
   GET ALL RATINGS (ADMIN)
====================================================== */
exports.getAllRatingsForAdmin = async ({
  page = 1,
  limit = 1000,
  isActive,
} = {}) => {   // 👈 THIS FIX
  const query = {};

  if (typeof isActive === "boolean") {
    query.isActive = isActive;
  }

  const ratings = await Rating.find(query)
    .populate("productId", "name")
    .populate("userId", "name email")
    .populate("vendorId", "storeName")
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  const total = await Rating.countDocuments(query);

  return {
    ratings,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalItems: total,
    },
  };
};

/* ======================================================
   CHECK IF USER CAN REVIEW (DELIVERED ORDER)
====================================================== */
exports.canUserReviewProduct = async (productId, userId) => {
  if (!productId || !userId) return false;

  const order = await Order.findOne({
    customerId: userId,
    "items.productId": productId,
    "items.status": "delivered",
  });

  return !!order;
};

/* ======================================================
   CREATE MANUAL RATING (ADMIN)
====================================================== */
exports.createManualRating = async ({
  productId,
  rating,
  review,
  manualUserName,
}) => {
  if (!productId || !rating || !manualUserName) {
    throw new Error("Missing required fields");
  }

  if (rating < 1 || rating > 5) {
    throw new Error("Rating must be between 1 and 5");
  }

  const product = await Product.findById(productId).select("vendorId");

  if (!product) {
    throw new Error("Product not found");
  }

  const result = await Rating.create({
    productId,
    vendorId: product.vendorId,
    rating,
    review,
    isManual: true,
    manualUserName,
    isActive: true,
  });

  return result;
};
