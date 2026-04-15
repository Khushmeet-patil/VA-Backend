const mongoose = require("mongoose");
const Commission = require("../models/Commission");
const { getMonthRanges } = require("../utils/dateRanges");
const { getGroupConfig } = require("../utils/revenueRangeConfig");
const { generateSeries } = require("../utils/dateSeries");

/* ======================================================
   HELPER
====================================================== */
const toISODate = (date) => date.toISOString().split("T")[0];

/* ======================================================
   VENDOR REVENUE (SUMMARY + GRAPH)
   🔹 Date field: creditedAt
====================================================== */
exports.getVendorRevenue = async (
  vendorId,
  range,
  startDate = null,
  endDate = null
) => {
  const { start, end } = getMonthRanges(range, startDate, endDate);
  const { groupId } = getGroupConfig(range, "creditedAt");

  const data = await Commission.aggregate([
    {
      $match: {
        vendorId: new mongoose.Types.ObjectId(vendorId),
        creditedAt: { $gte: start, $lte: end },
      },
    },
    {
      $group: {
        _id: groupId,          // 🔥 bucketed
        value: { $sum: "$vendorEarning" },
      },
    },
    {
      $sort: { "_id.date": 1 },
    },
  ]);

  return {
    graph: data.map((d) => ({
      label: d._id.date,
      value: d.value,
    })),
  };
};


/* ======================================================
   ADMIN REVENUE (SUMMARY + GRAPH)
   🔹 Date field: createdAt
====================================================== */
exports.getAdminRevenue = async (
  range = "monthly",
  startDate = null,
  endDate = null
) => {
  const { start, end } = getMonthRanges(range, startDate, endDate);
  const { groupId } = getGroupConfig(range, "createdAt");

  const data = await Commission.aggregate([
    {
      $match: {
        createdAt: { $gte: start, $lte: end },
      },
    },
    {
      $group: {
        _id: groupId,              // 🔥 bucketed
        value: { $sum: "$commissionAmount" },
      },
    },
    {
      $sort: { "_id.date": 1 },
    },
  ]);

  return {
    graph: data.map((d) => ({
      label: d._id.date,
      value: d.value,
    })),
  };
};


