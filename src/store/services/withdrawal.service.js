const mongoose = require("mongoose");
const Withdrawal = require("../models/Withdrawal");
const VendorWallet = require("../models/VendorWallet");
const Vendor = require("../models/Vendor");
const Order = require("../models/Order");
const Product = require("../models/Product");
const {
  withdrawalRejectedTemplate,
} = require("../utils/email/templates/withdrawalRejectionTemplate");
const {
  withdrawalApprovedTemplate,
} = require("../utils/email/templates/withdrawalApprovalTemplate");
const EMAIL_SUBJECTS = require("../constants/emailSubjects");
const sendEmail = require("../utils/email/sendEmail");
const {
  withdrawalPaidTemplate,
} = require("../utils/email/templates/withdrawalPaidTemplate");

/* ======================================================
   ADMIN FETCH WITHDRAWAL REQUEST
====================================================== */
exports.getAllWithdrawals = async ({
  page = 1,
  limit = 20,
  status = null,
  search = "",
}) => {
  const skip = (page - 1) * limit;

  const match = {};

  // 🔍 Filter by status
  if (status) {
    match.status = status;
  }

  // 🔍 Search vendor (name/email)
  let vendorIds = [];
  if (search) {
    const vendors = await Vendor.find({
      $or: [
        { businessName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ],
    }).select("_id");

    vendorIds = vendors.map((v) => v._id);
    match.vendorId = { $in: vendorIds };
  }

  const [data, total] = await Promise.all([
    Withdrawal.find(match)
      .populate("vendorId", "businessName email phone")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Withdrawal.countDocuments(match),
  ]);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

/* ======================================================
   VENDOR FETCH WITHDRAWALS
====================================================== */
exports.getVendorWithdrawals = async ({
  vendorId,
  page = 1,
  limit = 20,
  status = null,
}) => {
  if (!vendorId) throw new Error("Vendor ID is required");
  
  const skip = (page - 1) * limit;
  const match = { vendorId: vendorId }; // Mongoose handles string to ObjectId conversion for find()

  if (status) {
    match.status = status;
  }

  const [data, total] = await Promise.all([
    Withdrawal.find(match)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Withdrawal.countDocuments(match),
  ]);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

/* ======================================================
   VENDOR FETCH WALLET BREAKDOWN
====================================================== */
exports.getVendorWalletBreakdown = async (vendorId) => {
  if (!vendorId) throw new Error("Vendor ID is required");
  
  const vendor = await Vendor.findById(vendorId).select("commissionRate");
  const commissionRate = vendor?.commissionRate || 10;
  
  // 1️⃣ Fetch all orders containing this vendor's items that are paid or COD
  const orders = await Order.find({ 
    "items.vendorId": vendorId,
    $or: [
      { paymentStatus: { $in: ["paid", "PAID", "RAZORPAY"] } },
      { paymentMethod: { $in: ["cod", "COD"] } }
    ],
    orderStatus: { $ne: "cancelled" }
  }).sort({ createdAt: -1 });

  let totalBalance = 0;
  let withdrawableBalance = 0;
  let pendingBalance = 0;
  
  const breakdown = [];
  const now = new Date();

  for (const order of orders) {
    const vendorItems = order.items.filter(i => i.vendorId.toString() === vendorId.toString());
    
    for (const item of vendorItems) {
      if (item.status === "cancelled" || item.status === "returned") continue;

      const earnings = item.totalPrice - (item.totalPrice * commissionRate / 100);
      console.log(`[WalletBreakdown] Order: ${order.orderNumber}, Item: ${item.name}, Price: ${item.totalPrice}, Earn: ${earnings}`);
      totalBalance += earnings;

      // Calculate if return period is over
      let isWithdrawable = false;
      let returnEndDate = null;
      let daysRemaining = 0;

      if (item.status === "delivered" && item.shipping?.deliveredAt) {
        // Get return days from product if possible, else default to 7
        const product = await Product.findById(item.productId).select("returnDays");
        const returnDays = product?.returnDays || 7;
        
        returnEndDate = new Date(item.shipping.deliveredAt);
        returnEndDate.setDate(returnEndDate.getDate() + returnDays);
        
        if (now > returnEndDate) {
          isWithdrawable = true;
          withdrawableBalance += earnings;
        } else {
          pendingBalance += earnings;
          daysRemaining = Math.ceil((returnEndDate - now) / (1000 * 60 * 60 * 24));
        }
      } else {
        pendingBalance += earnings;
        // If not yet delivered, it's pending indefinitely
      }

      breakdown.push({
        orderId: order._id,
        orderNumber: order.orderNumber,
        itemName: item.name,
        amount: earnings,
        status: item.status,
        deliveredAt: item.shipping?.deliveredAt,
        returnEndDate,
        isWithdrawable,
        daysRemaining: isWithdrawable ? 0 : daysRemaining
      });
    }
  }

  // Also subtract what was already withdrawn or requested
  const wallet = await VendorWallet.findOne({ vendorId });
  const requestedAmount = await Withdrawal.aggregate([
    { $match: { vendorId: new mongoose.Types.ObjectId(vendorId), status: "pending" } },
    { $group: { _id: null, total: { $sum: "$amount" } } }
  ]);

  const pendingWithdrawal = requestedAmount[0]?.total || 0;

  return {
    totalBalance,
    withdrawableBalance: Math.max(0, withdrawableBalance - (wallet?.totalWithdrawn || 0)),
    pendingBalance,
    pendingWithdrawal,
    breakdown
  };
};

/* ======================================================
   VENDOR FETCH WALLET
====================================================== */
exports.getVendorWallet = async (vendorId) => {
  if (!vendorId) throw new Error("Vendor ID is required");
  
  // 🔄 Always sync before returning wallet to ensure data integrity
  await exports.syncVendorWallet(vendorId);
  
  const breakdown = await exports.getVendorWalletBreakdown(vendorId);
  const wallet = await VendorWallet.findOne({ vendorId });
  
  return {
    balance: wallet?.balance || 0,
    totalEarned: breakdown.totalBalance,
    totalWithdrawn: wallet?.totalWithdrawn || 0,
    withdrawableBalance: breakdown.withdrawableBalance,
    pendingBalance: breakdown.pendingBalance,
    pendingWithdrawal: breakdown.pendingWithdrawal
  };
};

/* ======================================================
   🔄 SYNC VENDOR WALLET (RECALCULATE FROM SCRATCH)
====================================================== */
exports.syncVendorWallet = async (vendorId) => {
  if (!vendorId) throw new Error("Vendor ID is required");

  // 1️⃣ Get real-time earnings from breakdown logic
  const breakdown = await exports.getVendorWalletBreakdown(vendorId);
  
  // 2️⃣ Get total paid withdrawals
  const paidWithdrawals = await Withdrawal.aggregate([
    { $match: { vendorId: new mongoose.Types.ObjectId(vendorId), status: "paid" } },
    { $group: { _id: null, total: { $sum: "$amount" } } }
  ]);
  const totalWithdrawn = paidWithdrawals[0]?.total || 0;

  // 3️⃣ Recalculate balance
  // Balance should be the sum of all "withdrawable" items minus what was already withdrawn (paid)
  // Wait, let's be careful: breakdown.totalBalance is EVERYTHING (delivered + pending)
  // We need to match what's in the VendorWallet model: 
  // - balance: amount available for withdrawal (including pending returns)
  // - totalEarned: lifetime amount earned
  
  const recalculatedTotalEarned = breakdown.totalBalance;
  const recalculatedBalance = Math.max(0, recalculatedTotalEarned - totalWithdrawn);

  // 4️⃣ Update VendorWallet model
  let wallet = await VendorWallet.findOne({ vendorId });
  if (!wallet) {
    wallet = new VendorWallet({ vendorId });
  }

  wallet.totalEarned = recalculatedTotalEarned;
  wallet.totalWithdrawn = totalWithdrawn;
  wallet.balance = recalculatedBalance;
  
  await wallet.save();
  return wallet;
};

/* ======================================================
   VENDOR REQUEST WITHDRAWAL
====================================================== */
exports.requestWithdrawal = async ({ vendorId, amount }) => {
  if (amount <= 0) throw new Error("Invalid withdrawal amount");

  const wallet = await VendorWallet.findOne({ vendorId });
  if (!wallet) throw new Error("Wallet not found");

  if (wallet.balance < amount) {
    throw new Error("Insufficient wallet balance");
  }

  // 🚫 Check if pending withdrawal already exists
  const existingPending = await Withdrawal.findOne({
    vendorId,
    status: "pending",
  });

  if (existingPending) {
    throw new Error(
      "You already have a pending withdrawal request. Please wait for admin action."
    );
  }

  const vendor = await Vendor.findById(vendorId);
  if (!vendor) throw new Error("Vendor not found");

  const withdrawal = await Withdrawal.create({
    vendorId,
    amount,
    bankDetails: {
      accountHolderName: vendor.bankAccountName,
      accountNumber: vendor.bankAccountNumber,
      ifsc: vendor.bankIFSCCode,
      bankName: vendor.bankName,
    },
    status: "pending",
  });

  return withdrawal;
};

/* ======================================================
   ADMIN APPROVE / REJECT
====================================================== */
exports.updateWithdrawalStatus = async ({
  withdrawalId,
  status,
  adminRemark,
  approvedAmount,
}) => {
  const withdrawal = await Withdrawal.findById(withdrawalId);
  if (!withdrawal) throw new Error("Withdrawal request not found");

  if (!["approved", "rejected"].includes(status)) {
    throw new Error("Invalid status");
  }

  if (status === "rejected" && !adminRemark) {
    throw new Error("Rejection reason is required");
  }

  if (status === "approved") {
    if (approvedAmount === undefined || approvedAmount === null) {
      approvedAmount = withdrawal.amount;
    }
    if (approvedAmount > withdrawal.amount) {
      throw new Error("Approved amount cannot exceed requested amount");
    }
  }

  const vendor = await Vendor.findById(withdrawal.vendorId);
  if (!vendor) throw new Error("Vendor not found");

  // ================= UPDATE STATUS =================
  withdrawal.status = status;
  withdrawal.adminRemark = adminRemark || null;
  withdrawal.approvedAmount = status === "approved" ? approvedAmount : null;
  withdrawal.approvedAt = status === "approved" ? new Date() : null;

  await withdrawal.save();

  // ================= SEND EMAIL =================
  if (status === "approved") {
    try {
      await sendEmail({
        to: vendor.storeEmail,
        subject: EMAIL_SUBJECTS.VENDOR_WITHDRAWAL_APPROVED,
        html: withdrawalApprovedTemplate({
          vendorName: vendor.storeName,
          amount: withdrawal.approvedAmount,
          requestedAmount: withdrawal.amount,
          withdrawalId: withdrawal._id,
          approvedDate: new Date(withdrawal.approvedAt).toDateString(),
          adminRemark: withdrawal.adminRemark,
          platformName: "VedicStore | VedicAstro",
          supportEmail: "support@vedicastro.co.in",
          year: new Date().getFullYear(),
        }),
      });
    } catch (emailError) {
      logger.error("Withdrawal approval email failed to send", {
        withdrawalId: withdrawal._id,
        vendorEmail: vendor.storeEmail,
        error: emailError.message,
      });
    }
  }

  if (status === "rejected") {
    try {
      await sendEmail({
        to: vendor.storeEmail,
        subject: EMAIL_SUBJECTS.VENDOR_WITHDRAWAL_REJECTED,
        html: withdrawalRejectedTemplate({
          vendorName: vendor.storeName,
          amount: withdrawal.amount,
          withdrawalId: withdrawal._id,
          adminRemark,
          platformName: "VedicStore | VedicAstro",
          supportEmail: "support@vedicastro.co.in",
          year: new Date().getFullYear(),
        }),
      });
    } catch (emailError) {
      logger.error("Withdrawal rejection email failed to send", {
        withdrawalId: withdrawal._id,
        vendorEmail: vendor.storeEmail,
        error: emailError.message,
      });
    }
  }

  return withdrawal;
};

/* ======================================================
   ADMIN MARK AS PAID
====================================================== */
exports.markAsPaid = async ({ withdrawalId, paymentProof }) => {
  if (!paymentProof) throw new Error("Payment proof required");

  const withdrawal = await Withdrawal.findById(withdrawalId);
  if (!withdrawal) throw new Error("Withdrawal not found");

  if (withdrawal.status !== "approved") {
    throw new Error("Only approved withdrawals can be paid");
  }

  // ⏱ 24 hours rule
  const hoursDiff =
    (Date.now() - new Date(withdrawal.approvedAt).getTime()) / 36e5;

  if (hoursDiff > 24) {
    throw new Error("Payment window expired (24 hours)");
  }

  const wallet = await VendorWallet.findOne({
    vendorId: withdrawal.vendorId,
  });
  if (!wallet) throw new Error("Vendor wallet not found");

  if (wallet.balance < withdrawal.amount) {
    throw new Error("Insufficient wallet balance");
  }

  const vendor = await Vendor.findById(withdrawal.vendorId);
  if (!vendor) throw new Error("Vendor not found");

  // ================= WALLET UPDATE =================
  const amountToDeduct = withdrawal.approvedAmount || withdrawal.amount;
  wallet.balance -= amountToDeduct;
  wallet.totalWithdrawn += amountToDeduct;
  await wallet.save();

  // ================= WITHDRAWAL UPDATE =================
  withdrawal.status = "paid";
  withdrawal.paymentProof = paymentProof;
  withdrawal.paidAt = new Date();
  await withdrawal.save();

  // ================= SEND EMAIL =================
  try {
    await sendEmail({
      to: vendor.storeEmail,
      subject: EMAIL_SUBJECTS.VENDOR_WITHDRAWAL_PAID,
      html: withdrawalPaidTemplate({
        vendorName: vendor.storeName,
        amount: withdrawal.amount,
        withdrawalId: withdrawal._id,
        paidDate: new Date(withdrawal.paidAt).toDateString(),
        platformName: "VedicStore | VedicAstro",
        supportEmail: "support@vedicastro.co.in",
        year: new Date().getFullYear(),
      }),
    });
  } catch (emailError) {
    logger.error("Withdrawal paid email failed to send", {
      withdrawalId: withdrawal._id,
      vendorEmail: vendor.storeEmail,
      error: emailError.message,
    });
  }

  return withdrawal;
};

/* ======================================================
   ADMIN GET WITHDRAWAL BREAKDOWN
====================================================== */
exports.getWithdrawalBreakdown = async (withdrawalId) => {
  const withdrawal = await Withdrawal.findById(withdrawalId);
  if (!withdrawal) throw new Error("Withdrawal not found");

  // We reuse the vendor wallet breakdown logic to show what's currently withdrawable vs pending
  const breakdown = await exports.getVendorWalletBreakdown(withdrawal.vendorId);
  
  return {
    requestedAmount: withdrawal.amount,
    vendorId: withdrawal.vendorId,
    ...breakdown
  };
};
