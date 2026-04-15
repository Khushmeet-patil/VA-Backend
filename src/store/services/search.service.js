const { default: mongoose } = require("mongoose");
const Product = require("../models/Product");
const Category = require("../models/Category");

exports.searchProducts = async ({
  keyword,
  categoryId,
  minPrice,
  maxPrice,
  page = 1,
  limit = 12,
  sort,
}) => {
  const matchQuery = {
    status: true,
    "approval.status": "approved",
  };

  if (keyword && keyword.trim()) {
    matchQuery.$text = { $search: keyword.trim() };
  }

  if (categoryId) {
    matchQuery.category = new mongoose.Types.ObjectId(categoryId);
  }

  if (minPrice || maxPrice) {
    matchQuery["pricing.finalPrice"] = {};
    if (minPrice) matchQuery["pricing.finalPrice"].$gte = Number(minPrice);
    if (maxPrice) matchQuery["pricing.finalPrice"].$lte = Number(maxPrice);
  }

  const skip = (page - 1) * limit;

  const products = await Product.aggregate([
    { $match: matchQuery },

    ...(keyword
      ? [{ $addFields: { score: { $meta: "textScore" } } }]
      : []),

    {
      $sort: (() => {
        if (sort === "price_asc") return { "pricing.finalPrice": 1 };
        if (sort === "price_desc") return { "pricing.finalPrice": -1 };
        if (keyword) return { score: -1 };
        return { createdAt: -1 };
      })(),
    },

    { $skip: skip },
    { $limit: limit },

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
        averageRating: { $avg: "$ratings.rating" },
        ratingCount: { $size: "$ratings" },
      },
    },

    { $project: { ratings: 0 } },
  ]);

  const countAgg = await Product.aggregate([
    { $match: matchQuery },
    { $count: "total" },
  ]);

  const total = countAgg[0]?.total || 0;

  return {
    products,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};


exports.searchSuggestions = async (keyword) => {
  if (!keyword || keyword.length < 2) return [];

  const safeRegex = keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(safeRegex, "i");

  try {
    // 1. Search matching Category names
    const categories = await Category.find({ name: regex })
      .select("name")
      .limit(5);

    // 2. Search matching Tags from Products (distinct)
    // Using aggregation to find tags that match the regex
    const tags = await Product.aggregate([
      { $match: { 
          status: true, 
          "approval.status": "approved",
          tags: regex 
      } },
      { $unwind: "$tags" },
      { $match: { tags: regex } },
      { $group: { _id: "$tags" } },
      { $limit: 5 }
    ]);

    // 3. Search matching Purposes from Products (distinct)
    const purposes = await Product.aggregate([
      { $match: { 
          status: true, 
          "approval.status": "approved",
          purposes: regex 
      } },
      { $unwind: "$purposes" },
      { $match: { purposes: regex } },
      { $group: { _id: "$purposes" } },
      { $limit: 5 }
    ]);

    // 4. Search matching Products
    const products = await Product.find({
      status: true,
      "approval.status": "approved",
      name: regex,
    })
      .select("name slug images pricing.finalPrice")
      .limit(10);

    // Combine suggestions
    const suggestions = [];

    // Add categories as keyword suggestions
    categories.forEach(cat => {
      suggestions.push({
        _id: `cat_${cat._id}`,
        name: cat.name,
        type: 'keyword',
        subType: 'category'
      });
    });

    // Add tags as keyword suggestions
    tags.forEach(tag => {
      suggestions.push({
        _id: `tag_${tag._id}`,
        name: tag._id,
        type: 'keyword',
        subType: 'tag'
      });
    });

    // Add purposes as keyword suggestions
    purposes.forEach(purp => {
      suggestions.push({
        _id: `purp_${purp._id}`,
        name: purp._id,
        type: 'keyword',
        subType: 'purpose'
      });
    });

    // Add products
    products.forEach(prod => {
      suggestions.push({
        ...prod.toObject(),
        type: 'product'
      });
    });

    // Sort to prioritize exact/better matches if needed, but for now just return
    // Maybe unique names to avoid duplicates (e.g. tag "Rudraksha" and product "Rudraksha")
    const seen = new Set();
    const uniqueSuggestions = suggestions.filter(s => {
      const key = `${s.type}_${s.name.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return uniqueSuggestions.slice(0, 15);
  } catch (error) {
    console.error("Suggestion generation error:", error);
    return [];
  }
};
