const Banner = require("../models/Banner");

/* ================= CREATE ================= */
const createBanner = async (data) => {
  return Banner.create(data);
};

/* ================= GET ALL (Admin) ================= */
const getAllBanners = async (filters = {}) => {
  return Banner.find(filters).sort({ createdAt: -1 });
};

/* ================= GET ACTIVE (Public) ================= */
const getActiveBanners = async (filters = {}) => {
  return Banner.find({ ...filters, isActive: true }).sort({ createdAt: -1 });
};

/* ================= UPDATE STATUS ================= */
const updateBanner = async (id, data) => {
  return Banner.findByIdAndUpdate(id, data, { new: true });
};

/* ================= DELETE ================= */
const deleteBanner = async (id) => {
  return Banner.findByIdAndDelete(id);
};

module.exports = {
  createBanner,
  getAllBanners,
  getActiveBanners,
  updateBanner,
  deleteBanner,
};
