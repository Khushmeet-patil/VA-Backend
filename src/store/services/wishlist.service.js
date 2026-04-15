const mongoose = require("mongoose");
const User = require("../models/User");
const Product = require("../models/Product");

/* ================= ADD TO WISHLIST ================= */
exports.addToWishlist = async (userId, productId, quantity = 1, size = null) => {
  // check product visibility
  const product = await Product.findOne({
    _id: productId,
    status: true,
    "approval.status": "approved",
  });

  if (!product) {
    throw new Error("Product not available");
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  // Safety: ensure wishlist array exists
  if (!Array.isArray(user.wishlist)) {
    user.wishlist = [];
  }

  const existingIndex = user.wishlist.findIndex(
    (item) => item.product.toString() === productId.toString() && item.size === size
  );

  if (existingIndex > -1) {
    user.wishlist[existingIndex].quantity = quantity;
  } else {
    user.wishlist.push({ product: productId, quantity, size });
  }

  await user.save();
  return user.wishlist;
};

/* ================= REMOVE FROM WISHLIST ================= */
exports.removeFromWishlist = async (userId, productId) => {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  // Safety: ensure wishlist array exists
  if (!Array.isArray(user.wishlist)) {
    user.wishlist = [];
    await user.save();
    return user.wishlist;
  }

  user.wishlist = user.wishlist.filter(
    (item) => item.product.toString() !== productId.toString() && (!item._id || item._id.toString() !== productId.toString())
  );

  await user.save();
  return user.wishlist;
};

/* ================= TOGGLE WISHLIST ================= */
exports.toggleWishlist = async (userId, productId) => {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  // Safety: ensure wishlist array exists
  if (!Array.isArray(user.wishlist)) {
    user.wishlist = [];
  }

  const existingIndex = user.wishlist.findIndex(
    (item) => item.product.toString() === productId.toString()
  );

  if (existingIndex > -1) {
    user.wishlist.splice(existingIndex, 1);
    await user.save();
    return { isWishlisted: false, message: "Removed from wishlist" };
  } else {
    // Validate product exists and is approved before adding
    const product = await Product.findOne({
      _id: productId,
      status: true,
      "approval.status": "approved",
    });
    if (!product) {
      throw new Error("Product not available");
    }

    user.wishlist.push({ product: productId, quantity: 1, size: null });
    await user.save();
    return { isWishlisted: true, message: "Added to wishlist" };
  }
};

/* ================= GET USER WISHLIST ================= */
exports.getWishlist = async (userId) => {
  const result = await User.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(userId),
      },
    },
    // Unwind the wishlist array to act like the previous Wishlist collection format
    { $unwind: "$wishlist" },
    
    /* 🔗 Join products */
    {
      $lookup: {
        from: "products",
        localField: "wishlist.product",
        foreignField: "_id",
        as: "productDetails",
      },
    },
    { $unwind: "$productDetails" },

    /* 🔐 Only visible products */
    {
      $match: {
        "productDetails.status": true,
        "productDetails.approval.status": "approved",
      },
    },

    /* ⭐ Ratings */
    {
      $lookup: {
        from: "ratings",
        localField: "productDetails._id",
        foreignField: "productId",
        as: "ratings",
      },
    },

    {
      $addFields: {
        "productDetails.averageRating": { $avg: "$ratings.rating" },
        "productDetails.ratingCount": { $size: "$ratings" },
      },
    },

    {
      $project: {
        _id: "$wishlist._id",
        userId: "$_id",
        product: "$productDetails",
        productId: "$productDetails._id",
        quantity: "$wishlist.quantity",
        size: "$wishlist.size",
        createdAt: "$updatedAt"
      },
    },
  ]);

  return result;
};
