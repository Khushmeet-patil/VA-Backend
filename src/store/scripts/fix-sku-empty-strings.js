/**
 * One-time migration: Fix duplicate SKU empty-string issue
 *
 * MongoDB's sparse unique index allows multiple `null` values but NOT multiple `""`.
 * Any product saved before the null-guard was added may have `sku: ""`.
 * This script converts all such documents to `sku: null`.
 *
 * Run with:  node scripts/fix-sku-empty-strings.js
 */

require("dotenv").config();
const mongoose = require("mongoose");

const MONGO_URI = process.env.STORE_MONGO_URI || process.env.MONGODB_URI;

if (!MONGO_URI) {
  console.error("❌ MONGO_URI not set in environment");
  process.exit(1);
}

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log("✅ Connected to MongoDB");

  const db = mongoose.connection.db;
  const collection = db.collection("products");

  // Count how many are affected
  const count = await collection.countDocuments({ sku: "" });
  console.log(`🔍 Found ${count} product(s) with sku: ""`);

  if (count === 0) {
    console.log("✅ Nothing to fix. All good!");
    await mongoose.disconnect();
    return;
  }

  // Update: set sku to null (unset the empty string)
  const result = await collection.updateMany(
    { sku: "" },
    { $set: { sku: null } }
  );

  console.log(`✅ Fixed ${result.modifiedCount} product(s) — sku: "" → null`);
  await mongoose.disconnect();
  console.log("✅ Done. Disconnected.");
}

run().catch((err) => {
  console.error("❌ Migration failed:", err.message);
  process.exit(1);
});
