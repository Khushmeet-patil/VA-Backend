const LiveTemple = require("../models/LiveTemple");

/* ============ PUBLIC ============ */
exports.createLiveTemple = async (payload) => {
  const liveTemple = new LiveTemple(payload);
  return await liveTemple.save();
};

exports.getActiveLiveTemples = async () => {
  return await LiveTemple.find({ isActive: true })
    .sort({ createdAt: -1 });
};

/* ============ ADMIN ============ */
exports.getAllLiveTemples = async () => {
  return await LiveTemple.find()
    .sort({ createdAt: -1 });
};

exports.getLiveTempleById = async (id) => {
  return await LiveTemple.findById(id);
};

exports.updateLiveTemple = async (id, data) => {
  return await LiveTemple.findByIdAndUpdate(
    id,
    data,
    { new: true, runValidators: true }
  );
};

exports.toggleLiveTempleStatus = async (id) => {
  const temple = await LiveTemple.findById(id);

  if (!temple) return null;

  temple.isActive = !temple.isActive;

  await temple.save();

  return temple;
};

exports.deleteLiveTemple = async (id) => {
  return await LiveTemple.findByIdAndDelete(id);
};
