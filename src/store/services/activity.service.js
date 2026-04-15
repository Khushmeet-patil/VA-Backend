const Activity = require("../models/Activity");

/* ================= LOG ACTIVITY ================= */
exports.logActivity = async ({
  type,
  title,
  description,
  role,
  userId,
  vendorId,
  amount,
  metadata,
}) => {
  try {
    await Activity.create({
      type,
      title,
      description,
      role,
      userId,
      vendorId,
      amount,
      metadata,
    });
  } catch (error) {
    console.error("❌ Activity log failed:", error.message);
  }
};

/* ================= GET RECENT ACTIVITIES ================= */
exports.getAllActivities = async (limit = 50) => {
  return Activity.find({})
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};

