/**
 * Audit vendor pickup-address completeness.
 * --------------------------------------------------
 * Reports every vendor whose pickup address would be rejected by Kwikship.
 * Read-only — does not modify any data.
 *
 * Usage:
 *   node scripts/audit-vendor-pickup.js                # all vendors
 *   node scripts/audit-vendor-pickup.js --approved     # only approved vendors
 */

require("dotenv").config();

const args = process.argv.slice(2);
const onlyApproved = args.includes("--approved");

(async () => {
  const { getStoreDB } = require("../src/store/config/db");
  const Vendor = require("../src/store/models/Vendor");
  const { validateVendorPickup } = require("../src/store/services/kwikship.service");

  const db = getStoreDB();
  if (db.readyState !== 1) {
    await new Promise((r) => db.once("connected", r));
  }

  const filter = onlyApproved ? { status: "approved" } : {};
  const vendors = await Vendor.find(filter).lean();

  let okCount = 0;
  const broken = [];

  for (const v of vendors) {
    const r = validateVendorPickup(v);
    if (r.ok) {
      okCount++;
    } else {
      broken.push({
        id: v._id.toString(),
        storeName: v.storeName,
        storeEmail: v.storeEmail,
        status: v.status,
        errors: r.errors,
      });
    }
  }

  console.log(`\nScanned: ${vendors.length} vendor(s)${onlyApproved ? " (approved only)" : ""}`);
  console.log(`OK:      ${okCount}`);
  console.log(`Broken:  ${broken.length}\n`);

  if (broken.length) {
    console.log("Vendors with invalid pickup address:");
    for (const b of broken) {
      console.log(`  - [${b.status}] ${b.storeName} (${b.id})`);
      console.log(`      email: ${b.storeEmail}`);
      console.log(`      issue: ${b.errors.join("; ")}`);
    }
  }

  process.exit(0);
})().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(1);
});
