const Address = require("../models/Address");

/* ================= ADD ADDRESS ================= */
exports.createAddress = async (userId, payload) => {
  if (payload.isDefault) {
    await Address.updateMany(
      { userId },
      { $set: { isDefault: false } }
    );
  }

  const address = await Address.create({
    ...payload,
    userId,
  });

  return address;
};

exports.getUserAddresses = async (userId, options = {}) => {
  const query = {
    userId,
    isActive: true,
  };

  if (options.type) {
    query.type = options.type;
  }

  const addresses = await Address.find(query)
    .sort({ isDefault: -1, createdAt: -1 });

  return addresses;
};

/* ================= GET SINGLE ADDRESS ================= */
exports.getAddressById = async (userId, addressId) => {
  const address = await Address.findOne({
    _id: addressId,
    userId,
    isActive: true,
  });

  if (!address) {
    throw new Error("Address not found");
  }

  return address;
};

/* ================= UPDATE ADDRESS ================= */
exports.updateAddress = async (userId, addressId, payload) => {
  // If making default → unset previous default
  if (payload.isDefault) {
    await Address.updateMany(
      { userId },
      { $set: { isDefault: false } }
    );
  }

  const address = await Address.findOneAndUpdate(
    { _id: addressId, userId, isActive: true },
    payload,
    { new: true }
  );

  if (!address) {
    throw new Error("Address not found or inactive");
  }

  return address;
};

/* ================= SET DEFAULT ADDRESS ================= */
exports.setDefaultAddress = async (userId, addressId) => {
  await Address.updateMany(
    { userId },
    { $set: { isDefault: false } }
  );

  const address = await Address.findOneAndUpdate(
    { _id: addressId, userId, isActive: true },
    { isDefault: true },
    { new: true }
  );

  if (!address) {
    throw new Error("Address not found");
  }

  return address;
};

/* ================= SOFT DELETE ADDRESS ================= */
exports.deleteAddress = async (userId, addressId) => {
  const address = await Address.findOneAndUpdate(
    { _id: addressId, userId },
    { isActive: false, isDefault: false },
    { new: true }
  );

  if (!address) {
    throw new Error("Address not found");
  }

  return address;
};
