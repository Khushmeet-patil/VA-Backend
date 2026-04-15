const Commission = require("../models/Commission");
const VendorWallet = require("../models/VendorWallet");
const Vendor = require("../models/Vendor");

exports.creditCommission = async ({ orderId, orderItem }) => {
  // 1️⃣ Fetch vendor
  const vendor = await Vendor.findById(orderItem.vendorId);

  if (!vendor) {
    throw new Error("Vendor not found for commission");
  }

  const commissionRate = Number(orderItem.commissionRate || vendor.commissionRate || 10);

  // 2️⃣ Prevent duplicate commission (VERY IMPORTANT)
  const existing = await Commission.findOne({
    orderItemId: orderItem._id,
  });

  if (existing) return existing;

  // 3️⃣ Calculate commission
  const commissionAmount =
    (orderItem.totalPrice * commissionRate) / 100;

  const vendorEarning =
    orderItem.totalPrice - commissionAmount;

  // 4️⃣ Save commission snapshot
  const commission = await Commission.create({
    orderId,
    orderItemId: orderItem._id,
    vendorId: orderItem.vendorId,

    amount: orderItem.totalPrice,
    commissionRate,              // 🔒 SNAPSHOT
    commissionAmount,
    vendorEarning,

    status: "credited",
    creditedAt: new Date(),
  });

  // 5️⃣ Update vendor wallet (separate from Vendor model wallet)
  let wallet = await VendorWallet.findOne({
    vendorId: orderItem.vendorId,
  });

  if (!wallet) {
    wallet = await VendorWallet.create({
      vendorId: orderItem.vendorId,
    });
  }

  wallet.balance += vendorEarning;
  wallet.totalEarned += vendorEarning;
  await wallet.save();

  return commission;
};
