/**
 * Backfill missing fields on Order.shippingAddress.
 * --------------------------------------------------
 * Looks at every order whose shippingAddress is missing required fields
 * (state, city, postalCode, phone, fullName) and tries to fill them from:
 *   1) The customer's default Address, otherwise
 *   2) The customer's most recent active Address, otherwise
 *   3) The User document's mobile (for phone only)
 *
 * Read-only by default. Pass --apply to write changes.
 *
 * Usage:
 *   node scripts/backfill-order-shipping-address.js               # dry run
 *   node scripts/backfill-order-shipping-address.js --apply       # write
 *   node scripts/backfill-order-shipping-address.js --order <id>  # single order
 */

require("dotenv").config();

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const orderArgIdx = args.indexOf("--order");
const singleOrderId = orderArgIdx >= 0 ? args[orderArgIdx + 1] : null;

const REQUIRED = ["fullName", "phone", "addressLine1", "city", "state", "postalCode"];

const cleanStr = (v) => (v == null ? "" : String(v).replace(/\s+/g, " ").trim());

(async () => {
  const { getStoreDB } = require("../src/store/config/db");
  const Order = require("../src/store/models/Order");
  const Address = require("../src/store/models/Address");
  const User = require("../src/store/models/User");

  const db = getStoreDB();
  if (db.readyState !== 1) {
    await new Promise((r) => db.once("connected", r));
  }

  const filter = singleOrderId ? { _id: singleOrderId } : {};
  const orders = await Order.find(filter).select("_id customerId shippingAddress");

  let scanned = 0;
  let needed = 0;
  let fixed = 0;
  const stillBroken = [];

  for (const order of orders) {
    scanned++;
    const sa = order.shippingAddress || {};
    const missing = REQUIRED.filter((k) => !cleanStr(sa[k]));
    if (missing.length === 0) continue;
    needed++;

    // Try default address first, then most recent active address
    let addr = await Address.findOne({
      userId: order.customerId,
      isActive: true,
      isDefault: true,
    });
    if (!addr) {
      addr = await Address.findOne({
        userId: order.customerId,
        isActive: true,
      }).sort({ updatedAt: -1 });
    }

    const user = await User.findById(order.customerId).select("mobile firstName lastName");

    const patched = { ...sa.toObject?.() || sa };
    if (!cleanStr(patched.fullName)) {
      patched.fullName = addr?.name || cleanStr(`${user?.firstName || ""} ${user?.lastName || ""}`);
    }
    if (!cleanStr(patched.phone)) {
      patched.phone = addr?.phone || user?.mobile || "";
    }
    if (!cleanStr(patched.addressLine1)) patched.addressLine1 = addr?.addressLine1 || "";
    if (!cleanStr(patched.addressLine2)) patched.addressLine2 = addr?.addressLine2 || addr?.landmark || "";
    if (!cleanStr(patched.city)) patched.city = addr?.city || "";
    if (!cleanStr(patched.state)) patched.state = addr?.state || "";
    if (!cleanStr(patched.postalCode)) patched.postalCode = addr?.pincode || "";
    if (!cleanStr(patched.country)) patched.country = addr?.country || "India";

    const stillMissing = REQUIRED.filter((k) => !cleanStr(patched[k]));

    if (stillMissing.length) {
      stillBroken.push({
        orderId: order._id.toString(),
        customerId: order.customerId?.toString(),
        missingBefore: missing,
        missingAfter: stillMissing,
      });
      continue;
    }

    fixed++;
    console.log(`  Order ${order._id}: ${missing.join(", ")} → patched`);

    if (apply) {
      order.shippingAddress = patched;
      await order.save();
    }
  }

  console.log(`\nScanned: ${scanned}`);
  console.log(`Needed backfill: ${needed}`);
  console.log(`Patched: ${fixed}${apply ? " (written)" : " (dry run, use --apply to write)"}`);
  console.log(`Still broken (no Address available): ${stillBroken.length}`);
  if (stillBroken.length) {
    for (const b of stillBroken) {
      console.log(`  - ${b.orderId} (cust ${b.customerId}) missing: ${b.missingAfter.join(", ")}`);
    }
  }

  process.exit(0);
})().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
