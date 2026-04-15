const searchService = require("../services/search.service");

exports.searchProducts = async (req, res) => {
  try {
    const { q, categoryId, minPrice, maxPrice, page, limit, sort } = req.query;

    const result = await searchService.searchProducts({
      keyword: q,
      categoryId,
      minPrice,
      maxPrice,
      page: Number(page) || 1,
      limit: Number(limit) || 12,
      sort,
    });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("SEARCH ERROR 👉", error); // 🔥 ADD THIS

    return res.status(500).json({
      success: false,
      message: error.message, // 🔥 TEMP
    });
  }
};


exports.searchSuggestions = async (req, res) => {
  try {
    const { q } = req.query;

    const suggestions = await searchService.searchSuggestions(q);

    return res.status(200).json({
      success: true,
      suggestions,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Suggestion fetch failed",
    });
  }
};
