const Product = require("../models/Product");

exports.getPurposeForPublic = async () => {
  const data = await Product.aggregate([
    {
      $match: {
        status: true,
        "approval.status": "approved",
        purposes: { $exists: true, $ne: [] },
      },
    },
    {
      $unwind: "$purposes",
    },
    {
      $group: {
        _id: "$purposes",
      },
    },
    {
      $sort: {
        _id: 1,
      },
    },
  ]);

  return data.map((item) => item._id);
};
