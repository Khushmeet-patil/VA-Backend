/**
 * Shipping address resolver for orders.
 * --------------------------------------------------
 * Produces a complete, Kwikship-compatible shippingAddress snapshot from
 * either:
 *   - an `addressId` referencing the customer's saved Address (preferred), or
 *   - a free-form `shippingAddress` object posted by the client.
 *
 * The resolver enforces every field that Kwikship requires (fullName, phone,
 * addressLine1, city, state, postalCode) so we fail at order-create time
 * rather than at vendor-confirm/shipment time.
 */

const Address = require("../models/Address");

const REQUIRED = [
  ["fullName", "name"],
  ["phone", "contact phone"],
  ["addressLine1", "address line 1"],
  ["city", "city"],
  ["state", "state"],
  ["postalCode", "pincode"],
];

const cleanStr = (v) => (v == null ? "" : String(v).replace(/\s+/g, " ").trim());

const fromAddressDoc = (doc) => ({
  fullName: cleanStr(doc.name),
  phone: cleanStr(doc.phone),
  addressLine1: cleanStr(doc.addressLine1),
  addressLine2: cleanStr(doc.addressLine2 || doc.landmark || ""),
  city: cleanStr(doc.city),
  state: cleanStr(doc.state),
  postalCode: cleanStr(doc.pincode),
  country: cleanStr(doc.country) || "India",
});

const fromInline = (sa) => ({
  fullName: cleanStr(sa.fullName || sa.name),
  phone: cleanStr(sa.phone),
  addressLine1: cleanStr(sa.addressLine1 || sa.address1),
  addressLine2: cleanStr(sa.addressLine2 || sa.address2 || sa.landmark || ""),
  city: cleanStr(sa.city),
  state: cleanStr(sa.state),
  postalCode: cleanStr(sa.postalCode || sa.pincode || sa.zip),
  country: cleanStr(sa.country) || "India",
});

const validateSnapshot = (snap) => {
  const missing = [];
  for (const [key, label] of REQUIRED) {
    if (!snap[key]) missing.push(label);
  }
  // pincode must be 6 digits
  if (snap.postalCode && !/^\d{6}$/.test(snap.postalCode)) {
    missing.push("pincode (must be 6 digits)");
  }
  // phone — keep raw, but make sure we have at least 10 digits somewhere
  if (snap.phone && (snap.phone.replace(/\D/g, "").length < 10)) {
    missing.push("phone (must contain at least 10 digits)");
  }
  if (missing.length) {
    throw new Error(`Shipping address incomplete: ${missing.join(", ")}`);
  }
};

/**
 * Resolve a shippingAddress snapshot for an order.
 * @param {Object} args
 * @param {string} args.customerId - User _id (used to scope addressId lookup)
 * @param {string} [args.addressId] - Saved Address _id, preferred when present
 * @param {Object} [args.shippingAddress] - Inline address object as fallback
 * @returns {Promise<Object>} Validated snapshot ready for Order.shippingAddress
 */
exports.resolveShippingAddress = async ({ customerId, addressId, shippingAddress }) => {
  let snapshot;

  if (addressId) {
    const doc = await Address.findOne({ _id: addressId, userId: customerId, isActive: true });
    if (!doc) {
      throw new Error("Selected address not found or no longer active");
    }
    snapshot = fromAddressDoc(doc);
  } else if (shippingAddress && typeof shippingAddress === "object") {
    snapshot = fromInline(shippingAddress);
  } else {
    throw new Error("Shipping address is required (provide addressId or shippingAddress)");
  }

  validateSnapshot(snapshot);
  return snapshot;
};
