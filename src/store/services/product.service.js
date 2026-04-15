const { default: mongoose } = require("mongoose");
const EMAIL_SUBJECTS = require("../constants/emailSubjects");
const Product = require("../models/Product");
const Vendor = require("../models/Vendor");
const sendEmail = require("../utils/email/sendEmail");
const productRejectedTemplate = require("../utils/email/templates/productRejectedTemplate");
const logger = require("../utils/logger");
const activityService = require("./activity.service");
const ChangeRequest = require("../models/ChangeRequest");

/* ======================================================
   PRICING CALCULATOR (SINGLE SOURCE OF TRUTH)
====================================================== */
const calculatePricing = (pricing) => {
  const mrp = Number(pricing.mrp || 0);
  const gstRate = Number(pricing.gstRate || 0);
  const discountType = pricing.discountType || "none";
  const discountValue = Number(pricing.discountValue || 0);

  let discountAmount = 0;

  if (discountType === "percentage") {
    discountAmount = (mrp * discountValue) / 100;
  } else if (discountType === "flat") {
    discountAmount = discountValue;
  }

  discountAmount = Math.min(discountAmount, mrp);

  const finalPrice = mrp - discountAmount;
  
  // Backward calculation for GST (accounting base)
  // x + x*gst/100 = finalPrice => x = finalPrice / (1 + gst/100)
  const discountedPrice = finalPrice / (1 + gstRate / 100);
  const gstAmount = finalPrice - discountedPrice;

  return {
    mrp,
    discountType,
    discountValue,
    discountAmount,
    discountedPrice, // Before GST price (after discount)
    gstRate,
    gstAmount,
    finalPrice,
  };
};

/* ================= CREATE PRODUCT ================= */
exports.createProduct = async ({ productData, userId, vendorId }) => {
  try {
    // pricing calculation
    productData.pricing = calculatePricing(productData.pricing);
    // vendor & approval
    productData.vendorId = vendorId;
    productData.approval = { status: "pending" };

    // ✅ FIX: Convert empty/undefined SKU to null (sparse index allows multiple nulls)
    if (productData.sku !== undefined) {
      productData.sku = productData.sku?.trim() || null;
    }

    if (productData.variants && productData.variants.length > 0) {
      productData.stock = productData.variants.reduce((total, v) => total + v.stock, 0);
      productData.inStock = productData.stock > 0;
    }

    const product = await Product.create(productData);

    // ✅ ACTIVITY LOG (SERVICE LAYER)
    await activityService.logActivity({
      type: "PRODUCT_CREATE",
      title: "Product Created",
      description: `Product "${product.name}" has been created and is pending approval.`,
      role: "vendor",
      userId,
      vendorId,
      metadata: {
        productId: product._id,
      },
    });

    logger.info("Product created (pending approval)", {
      productId: product._id,
      vendorId,
    });

    return product;
  } catch (error) {
    logger.error("Create product failed", { error: error.message });
    throw error;
  }
};

/* ================= GET ALL PRODUCTS ================= */
exports.getProducts = async (filters = {}) => {
  const matchQuery = {};

  if (filters.category) {
    matchQuery.category = new mongoose.Types.ObjectId(filters.category);
  }

  /* ================= PRICE FILTER ================= */
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    matchQuery["pricing.finalPrice"] = {};
    if (filters.minPrice !== undefined) matchQuery["pricing.finalPrice"].$gte = Number(filters.minPrice);
    if (filters.maxPrice !== undefined) matchQuery["pricing.finalPrice"].$lte = Number(filters.maxPrice);
  }

  if (filters.vendorId) {
    matchQuery.vendorId = new mongoose.Types.ObjectId(filters.vendorId);
  }

  if (filters.featured !== undefined) {
    matchQuery.featured = filters.featured;
  }

  if (filters.status) {
    matchQuery["approval.status"] = filters.status;
  }

  if (filters.isVisible === true) {
    matchQuery.status = true;
    matchQuery["approval.status"] = "approved";
  }

  /* =============================
     🔮 PURPOSE FILTER (SAFE)
     ============================= */
  if (filters.purposes) {
    let purposesArray = [];

    // single purpose string
    if (typeof filters.purposes === "string") {
      purposesArray = filters.purposes.split(",");
    }

    // already array
    if (Array.isArray(filters.purposes)) {
      purposesArray = filters.purposes;
    }

    if (purposesArray.length) {
      matchQuery.purposes = { $in: purposesArray };
    }
  }

  /* =========================================================
     🔍 SEARCH — relevant products first, then all others
     ========================================================= */
  if (filters.search) {
    const searchTerm = filters.search.trim();
    const safeRegex = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const numericSearch = !isNaN(searchTerm) ? Number(searchTerm) : null;

    // --- Build regex match for various fields ---
    const matchConditions = [
      { name: { $regex: safeRegex, $options: "i" } },
      { tags: { $regex: safeRegex, $options: "i" } },
      { purposes: { $regex: safeRegex, $options: "i" } },
      { shortDescription: { $regex: safeRegex, $options: "i" } },
    ];

    if (numericSearch !== null) {
      matchConditions.push({ "pricing.finalPrice": numericSearch });
    }

    const regexMatchQuery = {
      ...matchQuery,
      $or: matchConditions,
    };

    // Common pipeline stages for ratings
    const ratingStages = [
      {
        $lookup: {
          from: "categories",
          localField: "category",
          foreignField: "_id",
          as: "category",
        },
      },
      {
        $unwind: {
          path: "$category",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "vendors",
          localField: "vendorId",
          foreignField: "_id",
          as: "vendorId",
        },
      },
      {
        $unwind: {
          path: "$vendorId",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "ratings",
          localField: "_id",
          foreignField: "productId",
          as: "ratings",
        },
      },
      {
        $addFields: {
          activeRatings: {
            $filter: {
              input: "$ratings",
              as: "r",
              cond: { $eq: ["$$r.isActive", true] },
            },
          },
        },
      },
      {
        $addFields: {
          averageRating: { $avg: "$activeRatings.rating" },
          totalRatings: { $size: "$activeRatings" },
        },
      },
      {
        $project: {
          ratings: 0,
          activeRatings: 0,
        },
      },
      ...(filters.minRating
        ? [
            {
              $match: {
                averageRating: { $gte: Number(filters.minRating) },
              },
            },
          ]
        : []),
    ];

    // Run both queries in parallel
    const [matchedProducts, allProducts] = await Promise.all([
      // 1) Products matching the search (weighted ranking)
      Product.aggregate([
        { $match: regexMatchQuery },
        ...ratingStages,
        {
          $addFields: {
            _searchRank: {
              $switch: {
                branches: [
                  {
                    case: {
                      $regexMatch: {
                        input: "$name",
                        regex: safeRegex,
                        options: "i",
                      },
                    },
                    then: 0, // Name match (Highest)
                  },
                  {
                    case: {
                      $or: [
                        {
                          $gt: [
                            {
                              $size: {
                                $filter: {
                                  input: { $ifNull: ["$tags", []] },
                                  as: "t",
                                  cond: {
                                    $regexMatch: {
                                      input: "$$t",
                                      regex: safeRegex,
                                      options: "i",
                                    },
                                  },
                                },
                              },
                            },
                            0,
                          ],
                        },
                        {
                          $gt: [
                            {
                              $size: {
                                $filter: {
                                  input: { $ifNull: ["$purposes", []] },
                                  as: "p",
                                  cond: {
                                    $regexMatch: {
                                      input: "$$p",
                                      regex: safeRegex,
                                      options: "i",
                                    },
                                  },
                                },
                              },
                            },
                            0,
                          ],
                        },
                      ],
                    },
                    then: 1, // Tag/Purpose match (High)
                  },
                  {
                    case:
                      numericSearch !== null
                        ? { $eq: ["$pricing.finalPrice", numericSearch] }
                        : false,
                    then: 2, // Price match (Medium)
                  },
                ],
                default: 3, // Description match etc. (Low)
              },
            },
          },
        },
        { $sort: { _searchRank: 1, createdAt: -1 } },
        { $project: { _searchRank: 0 } },
      ]),

      // 2) All products (for the "rest" section)
      Product.aggregate([
        { $match: matchQuery },
        ...ratingStages,
        { $sort: { createdAt: -1 } },
      ]),
    ]);

    // Merge: matched first, then remaining (deduplicated)
    const matchedIds = new Set(matchedProducts.map((p) => p._id.toString()));
    const remaining = allProducts.filter(
      (p) => !matchedIds.has(p._id.toString())
    );

    let result = [...matchedProducts, ...remaining];

    /* ================= APPLY SORTING ================= */
    if (filters.sort === "price_asc") {
      result.sort((a, b) => (a.pricing?.finalPrice || 0) - (b.pricing?.finalPrice || 0));
    } else if (filters.sort === "price_desc") {
      result.sort((a, b) => (b.pricing?.finalPrice || 0) - (a.pricing?.finalPrice || 0));
    } else if (filters.sort === "newest") {
      result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    return result;
  }

  /* =========================================================
     DEFAULT — no search, return all products by date
     ========================================================= */
  return await Product.aggregate([
    { $match: matchQuery },

    {
      $lookup: {
        from: "categories",
        localField: "category",
        foreignField: "_id",
        as: "category",
      },
    },
    {
      $unwind: {
        path: "$category",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $lookup: {
        from: "vendors",
        localField: "vendorId",
        foreignField: "_id",
        as: "vendorId",
      },
    },
    {
      $unwind: {
        path: "$vendorId",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $lookup: {
        from: "ratings",
        localField: "_id",
        foreignField: "productId",
        as: "ratings",
      },
    },

    {
      $addFields: {
        activeRatings: {
          $filter: {
            input: "$ratings",
            as: "r",
            cond: { $eq: ["$$r.isActive", true] },
          },
        },
      },
    },

    {
      $addFields: {
        averageRating: { $avg: "$activeRatings.rating" },
        totalRatings: { $size: "$activeRatings" },
      },
    },

    {
      $project: {
        ratings: 0,
        activeRatings: 0,
      },
    },
    ...(filters.minRating
      ? [
          {
            $match: {
              averageRating: { $gte: Number(filters.minRating) },
            },
          },
        ]
      : []),

    {
      $sort: (() => {
        if (filters.sort === "price_asc") return { "pricing.finalPrice": 1 };
        if (filters.sort === "price_desc") return { "pricing.finalPrice": -1 };
        if (filters.sort === "popularity") return { totalRatings: -1, averageRating: -1 };
        return { createdAt: -1 }; // default handles "newest" and others
      })(),
    },
  ]);
};

/* ================= GET PRODUCT BY ID ================= */
exports.getProductById = async (id) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new Error("Invalid product id");
    }

    const product = await Product.aggregate([
      {
        $match: { _id: new mongoose.Types.ObjectId(id) },
      },

      /* ================= CATEGORY ================= */
      {
        $lookup: {
          from: "categories",
          localField: "category",
          foreignField: "_id",
          as: "category",
        },
      },
      {
        $unwind: {
          path: "$category",
          preserveNullAndEmptyArrays: true,
        },
      },

      /* ================= RATINGS ================= */
      {
        $lookup: {
          from: "ratings",
          localField: "_id",
          foreignField: "productId",
          as: "reviews",
        },
      },

      /* ================= USER DETAILS ================= */
      {
        $lookup: {
          from: "users",
          localField: "reviews.userId",
          foreignField: "_id",
          as: "reviewUsers",
        },
      },

      /* ================= MERGE USER INTO REVIEW ================= */
      {
        $addFields: {
          reviews: {
            $map: {
              input: "$reviews",
              as: "r",
              in: {
                _id: "$$r._id",
                rating: "$$r.rating",
                review: "$$r.review",
                images: "$$r.images",
                createdAt: "$$r.createdAt",
                user: {
                  $arrayElemAt: [
                    {
                      $filter: {
                        input: "$reviewUsers",
                        as: "u",
                        cond: {
                          $eq: ["$$u._id", "$$r.userId"],
                        },
                      },
                    },
                    0,
                  ],
                },
              },
            },
          },
        },
      },

      /* ================= CALCULATE AVERAGE ================= */
      {
        $addFields: {
          averageRating: {
            $cond: [
              { $gt: [{ $size: "$reviews" }, 0] },
              { $round: [{ $avg: "$reviews.rating" }, 1] },
              0,
            ],
          },
          ratingCount: { $size: "$reviews" },
        },
      },

      /* ================= CLEAN RESPONSE ================= */
      {
        $project: {
          reviewUsers: 0,

          // hide category meta
          "category.createdAt": 0,
          "category.updatedAt": 0,
          "category.__v": 0,

          // hide sensitive user fields
          "reviews.user.password": 0,
          "reviews.user.resetPasswordToken": 0,
          "reviews.user.resetPasswordExpire": 0,
          "reviews.user.setPasswordToken": 0,
          "reviews.user.setPasswordExpire": 0,
          "reviews.user.__v": 0,
        },
      },
    ]);

    if (!product.length) throw new Error("Product not found");

    return product[0];
  } catch (error) {
    logger.error("Fetch product by id failed", {
      productId: id,
      error: error.message,
    });
    throw error;
  }
};

/* ================= UPDATE PRODUCT (VENDOR) ================= */
exports.updateProduct = async (id, data, user = null) => {
  try {
    if (data.pricing) {
      data.pricing = calculatePricing(data.pricing);
    }

    if (data.variants && data.variants.length > 0) {
      data.stock = data.variants.reduce((total, v) => total + v.stock, 0);
      data.inStock = data.stock > 0;
    }

    // If vendor edits rejected product → send back to pending
    if (data.resubmit === true) {
      data.approval = {
        status: "pending",
        rejectionReason: null,
      };
      delete data.resubmit;
    }

    // ✅ FIX: sparse: true only exempts `null` from uniqueness, NOT empty strings "".
    // Always convert any empty/whitespace SKU → null so multiple products can omit it.
    if ("sku" in data) {
      data.sku = (typeof data.sku === "string" ? data.sku.trim() : "") || null;
    }

    const currentProduct = await Product.findById(id);
    if (!currentProduct) throw new Error("Product not found");

    // 🛡️ CHANGE REQUEST LOGIC
    // If an APPROVED product is being edited by a VENDOR, create a ChangeRequest instead of updating.
    if (user && user.role === "vendor" && currentProduct.approval.status === "approved" && data.resubmit !== true) {
      const changeRequest = await ChangeRequest.create({
        type: "product",
        documentId: id,
        typeModel: "Product",
        vendorId: user.vendorId,
        oldData: currentProduct.toObject(),
        newData: { ...currentProduct.toObject(), ...data }, // Merge existing with new changes
        status: "pending",
      });

      // Log activity for change request
      await activityService.logActivity({
        type: "PRODUCT_CHANGE_REQUEST",
        title: "Product Edit Requested",
        description: `Vendor has requested changes for approved product "${currentProduct.name}".`,
        role: "vendor",
        userId: user._id,
        vendorId: user.vendorId,
        metadata: {
          productId: id,
          changeRequestId: changeRequest._id,
        },
      });

      return {
        _id: id,
        message: "Change request submitted for admin approval",
        isChangeRequest: true,
        changeRequestId: changeRequest._id,
      };
    }

    const product = await Product.findByIdAndUpdate(
      id,
      { $set: data },  // explicit $set prevents any accidental full-doc replacement
      {
        new: true,
        runValidators: true,
      }
    );

    if (!product) throw new Error("Product not found");

    await activityService.logActivity({
      type: "product_update",
      title: "Product Updated",
      description: `Product "${product.name}" has been updated.`,
      role: user ? user.role : "vendor",
      userId: user ? user._id : null,
      vendorId: user && user.vendorId ? user.vendorId : (product.vendorId && product.vendorId._id ? product.vendorId._id : product.vendorId),
      metadata: {
        productId: product._id,
      },
    });

    logger.info("Product updated", { productId: id });

    return product;
  } catch (error) {
    logger.error("Update product failed", {
      productId: id,
      error: error.message,
    });
    throw error;
  }
};

/* ================= DELETE PRODUCT ================= */
exports.deleteProduct = async (id, user = null) => {
  try {
    const query = { _id: id };

    // If user is a vendor, ensure they only delete their own products
    if (user && user.role === "vendor") {
      const vendorId = user.vendorId;
      if (!vendorId) throw new Error("Vendor ID not found for user");
      query.vendorId = vendorId;
    }

    const product = await Product.findOneAndDelete(query);

    if (!product) {
      if (user && user.role === "vendor") {
        throw new Error("Product not found or you don't have permission to delete it");
      }
      throw new Error("Product not found");
    }

    logger.info("Product deleted", { productId: id, userId: user ? user._id : "system" });

    await activityService.logActivity({
      type: "product_delete",
      title: "Product Deleted",
      description: `Product "${product.name}" has been deleted.`,
      role: user ? user.role : "vendor",
      userId: user ? user._id : null,
      vendorId: user && user.vendorId ? user.vendorId : (product.vendorId && product.vendorId._id ? product.vendorId._id : product.vendorId),
      metadata: {
        productId: product._id,
      },
    });

    return product;
  } catch (error) {
    logger.error("Delete product failed", {
      productId: id,
      error: error.message,
    });
    throw error;
  }
};

/* ================= ADMIN APPROVE PRODUCT ================= */
exports.approveProduct = async (id, adminId, role) => {
  try {
    const product = await Product.findByIdAndUpdate(
      id,
      {
        "approval.status": "approved",
        "approval.reviewedBy": adminId,
        "approval.reviewedAt": new Date(),
        "approval.rejectionReason": null,
      },
      { new: true }
    );

    if (!product) throw new Error("Product not found");

    await activityService.logActivity({
      type: "product_approve",
      title: "Product Approved",
      description: `Product "${product.name}" has been approved.`,
      role,
      metadata: {
        productId: product._id,
        reviewedBy: adminId,
      },
    });

    logger.info("Product approved", {
      productId: id,
      reviewedBy: adminId,
    });

    return product;
  } catch (error) {
    logger.error("Approve product failed", {
      productId: id,
      error: error.message,
    });
    throw error;
  }
};

/* ================= ADMIN REJECT PRODUCT ================= */
exports.rejectProduct = async (id, reason, adminId, role) => {
  if (!reason) throw new Error("Rejection reason required");

  const product = await Product.findByIdAndUpdate(
    id,
    {
      "approval.status": "rejected",
      "approval.rejectionReason": reason,
      "approval.reviewedBy": adminId,
      "approval.reviewedAt": new Date(),
    },
    { new: true }
  ).populate({
    path: "vendorId",
    select: "storeName storeEmail",
  });

  if (!product) throw new Error("Product not found");
  if (!product.vendorId) throw new Error("Vendor not found for product");

  const vendor = product.vendorId;

  await activityService.logActivity({
    type: "product_reject",
    title: "Product Rejected",
    description: `Product "${product.name}" has been rejected.`,
    role,
    metadata: { productId: product._id, reviewedBy: adminId, reason },
  });

  try {
    await sendEmail({
      to: vendor.storeEmail,
      subject: EMAIL_SUBJECTS.PRODUCT_REJECTED,
      html: productRejectedTemplate({
        vendorName: vendor.storeName,
        productName: product.name,
        rejectionReason: product.approval.rejectionReason,
        platformName: "VedicStore | VedicAstro",
        supportEmail: "support@vedicastro.co.in",
        year: new Date().getFullYear(),
      }),
    });
  } catch (emailError) {
    logger.error("Product rejection email failed to send", {
      productId: product._id,
      vendorEmail: vendor.storeEmail,
      error: emailError.message,
    });
  }

  return product;
};

exports.myProduct = async (vendorId, options = {}) => {
  try {
    if (!vendorId) {
      throw new Error("Vendor ID is required");
    }

    const { page = 1, limit = 10, status, search } = options;

    const matchQuery = {
      vendorId: new mongoose.Types.ObjectId(vendorId),
    };

    if (status) {
      matchQuery["approval.status"] = status;
    }

    if (search) {
      matchQuery.$or = [
        { name: { $regex: search, $options: "i" } },
        { tags: { $regex: search, $options: "i" } },
        { sku: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      Product.aggregate([
        { $match: matchQuery },

        /* ================= REVIEWS ================= */
        {
          $lookup: {
            from: "ratings",
            localField: "_id",
            foreignField: "productId",
            as: "reviews",
          },
        },

        /* ================= USER DETAILS IN REVIEWS ================= */
        {
          $lookup: {
            from: "users",
            localField: "reviews.userId",
            foreignField: "_id",
            as: "reviewUsers",
          },
        },

        /* ================= MERGE USER INTO REVIEW ================= */
        {
          $addFields: {
            reviews: {
              $map: {
                input: "$reviews",
                as: "r",
                in: {
                  _id: "$$r._id",
                  rating: "$$r.rating",
                  review: "$$r.review",
                  images: { $ifNull: ["$$r.images", []] },
                  createdAt: "$$r.createdAt",
                  user: {
                    $arrayElemAt: [
                      {
                        $filter: {
                          input: "$reviewUsers",
                          as: "u",
                          cond: {
                            $eq: ["$$u._id", "$$r.userId"],
                          },
                        },
                      },
                      0,
                    ],
                  },
                },
              },
            },
          },
        },

        /* ================= CALCULATE RATING ================= */
        {
          $addFields: {
            averageRating: {
              $cond: [
                { $gt: [{ $size: "$reviews" }, 0] },
                { $round: [{ $avg: "$reviews.rating" }, 1] },
                0,
              ],
            },
            ratingCount: { $size: "$reviews" },
          },
        },

        /* ================= CATEGORY ================= */
        {
          $lookup: {
            from: "categories",
            localField: "category",
            foreignField: "_id",
            as: "category",
          },
        },
        {
          $unwind: {
            path: "$category",
            preserveNullAndEmptyArrays: true,
          },
        },

        /* ================= CLEAN RESPONSE ================= */
        {
          $project: {
            reviewUsers: 0,

            "category.createdAt": 0,
            "category.updatedAt": 0,
            "category.__v": 0,

            // 🔐 user sensitive fields hide
            "reviews.user.password": 0,
            "reviews.user.resetPasswordToken": 0,
            "reviews.user.resetPasswordExpire": 0,
            "reviews.user.setPasswordToken": 0,
            "reviews.user.setPasswordExpire": 0,
            "reviews.user.__v": 0,
          },
        },

        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: Number(limit) },
      ]),

      Product.countDocuments(matchQuery),
    ]);

    return {
      success: true,
      data: products,
      pagination: {
        totalItems: total,
        currentPage: Number(page),
        totalPages: Math.ceil(total / limit),
        pageSize: Number(limit),
      },
    };
  } catch (error) {
    logger.error("Fetch vendor products failed", {
      vendorId,
      error: error.message,
    });
    throw error;
  }
};
