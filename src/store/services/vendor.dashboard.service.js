const Order = require("../models/Order");
const Product = require("../models/Product");
const Activity = require("../models/Activity");
const mongoose = require("mongoose");

exports.getVendorDashboardSummary = async (vendorId) => {
  const vendorObjectId = new mongoose.Types.ObjectId(vendorId);

  const [totalOrders, pendingOrders, totalProducts, revenue] =
    await Promise.all([
      Order.countDocuments({ "items.vendorId": vendorObjectId }),
      Order.countDocuments({ 
        "items.vendorId": vendorObjectId, 
        orderStatus: "pending" 
      }),
      Product.countDocuments({ vendorId: vendorObjectId }),
      Order.aggregate([
        { $unwind: "$items" },
        { 
          $match: { 
            "items.vendorId": vendorObjectId, 
            paymentStatus: { $in: ["paid", "PAID", "RAZORPAY"] }
          } 
        },
        { $group: { _id: null, total: { $sum: "$items.totalPrice" } } },
      ]),
    ]);

  const avgOrderValue = totalOrders > 0 ? (revenue[0]?.total || 0) / totalOrders : 0;

  return {
    revenue: {
      total: revenue[0]?.total || 0,
      change: 0, // Placeholder
    },
    orders: {
      total: totalOrders,
      change: 0, // Placeholder
    },
    products: {
      total: totalProducts,
    },
    avgOrderValue,
    pendingOrders,
    rating: 4.5, // Placeholder
    wallet: await require("./withdrawal.service").getVendorWallet(vendorId),
  };
};

exports.getVendorTopProducts = async (vendorId, limit = 5) => {
  const vendorObjectId = new mongoose.Types.ObjectId(vendorId);

  return Order.aggregate([
    { $unwind: "$items" },
    {
      $match: {
        "items.vendorId": vendorObjectId,
        orderStatus: "completed",
      },
    },
    {
      $group: {
        _id: "$items.productId",
        name: { $first: "$items.name" },
        sales: { $sum: "$items.quantity" },
        revenue: { $sum: "$items.totalPrice" },
      },
    },
    { $sort: { sales: -1 } },
    { $limit: Number(limit) },
  ]);
};

exports.getVendorDailyStats = async (vendorId, days = 7) => {
  const vendorObjectId = new mongoose.Types.ObjectId(vendorId);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - Number(days));

  return Order.aggregate([
    { $unwind: "$items" },
    {
      $match: {
        "items.vendorId": vendorObjectId,
        orderStatus: "completed",
        createdAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$createdAt",
            timezone: "Asia/Kolkata",
          },
        },
        revenue: { $sum: "$items.totalPrice" },
        orders: { $addToSet: "$_id" }, // Count unique orders
      },
    },
    {
      $project: {
        _id: 1,
        revenue: 1,
        orders: { $size: "$orders" },
      },
    },
    { $sort: { _id: 1 } },
  ]);
};

exports.getVendorRevenueByMonth = async (vendorId, year) => {
  const vendorObjectId = new mongoose.Types.ObjectId(vendorId);

  return Order.aggregate([
    { $unwind: "$items" },
    {
      $match: {
        "items.vendorId": vendorObjectId,
        orderStatus: "completed",
        createdAt: {
          $gte: new Date(`${year}-01-01`),
          $lte: new Date(`${year}-12-31`),
        },
      },
    },
    {
      $group: {
        _id: { $month: "$createdAt" },
        revenue: { $sum: "$items.totalPrice" },
      },
    },
    { $sort: { "_id": 1 } },
  ]);
};

exports.getVendorRecentActivity = async (vendorId, limit = 10) => {
  if (!vendorId) throw new Error("Vendor ID required");

  return Activity.find({
    role: "vendor",
    vendorId,
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};

