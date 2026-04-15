const ChangeRequest = require("../models/ChangeRequest");
const Product = require("../models/Product");
const Coupon = require("../models/Coupon");
const activityService = require("./activity.service");
const logger = require("../utils/logger");

exports.getPendingRequests = async (query = {}) => {
  return await ChangeRequest.find({ status: "pending", ...query })
    .populate("vendorId", "storeName storeEmail")
    .sort({ createdAt: -1 });
};

exports.getRequestById = async (id) => {
  const request = await ChangeRequest.findById(id).populate("vendorId", "storeName storeEmail");
  if (!request) throw new Error("Change request not found");
  return request;
};

exports.approveRequest = async (id, adminId) => {
  const request = await ChangeRequest.findById(id);
  if (!request) throw new Error("Change request not found");
  if (request.status !== "pending") throw new Error(`Request is already ${request.status}`);

  const Model = request.type === "product" ? Product : Coupon;
  
  // Apply changes to the original document
  // We use the full newData stored in request
  const updatedDoc = await Model.findByIdAndUpdate(
    request.documentId,
    { $set: request.newData },
    { new: true, runValidators: true }
  );

  if (!updatedDoc) throw new Error(`${request.type} not found`);

  // Update request status
  request.status = "approved";
  request.reviewedBy = adminId;
  request.reviewedAt = new Date();
  await request.save();

  // Log activity and Notify Vendor
  await activityService.logActivity({
    type: `${request.type.toUpperCase()}_CHANGE_APPROVED`,
    title: `${request.type.charAt(0).toUpperCase() + request.type.slice(1)} Changes Approved`,
    description: `Your changes for "${updatedDoc.name || updatedDoc.code}" have been approved and are now live.`,
    role: "vendor",
    vendorId: request.vendorId,
    metadata: {
        type: request.type,
        documentId: request.documentId,
        changeRequestId: id
    }
  });

  logger.info(`Change request approved: ${id}`, { adminId, type: request.type });

  return updatedDoc;
};

exports.rejectRequest = async (id, reason, adminId) => {
  if (!reason) throw new Error("Rejection reason is required");

  const request = await ChangeRequest.findById(id);
  if (!request) throw new Error("Change request not found");
  if (request.status !== "pending") throw new Error(`Request is already ${request.status}`);

  request.status = "rejected";
  request.rejectionReason = reason;
  request.reviewedBy = adminId;
  request.reviewedAt = new Date();
  await request.save();

  // Log activity and Notify Vendor
  await activityService.logActivity({
    type: `${request.type.toUpperCase()}_CHANGE_REJECTED`,
    title: `${request.type.charAt(0).toUpperCase() + request.type.slice(1)} Changes Rejected`,
    description: `Your changes for a ${request.type} were rejected. Reason: ${reason}`,
    role: "vendor",
    vendorId: request.vendorId,
    metadata: {
        type: request.type,
        documentId: request.documentId,
        changeRequestId: id,
        reason
    }
  });

  logger.info(`Change request rejected: ${id}`, { adminId, reason });

  return request;
};
