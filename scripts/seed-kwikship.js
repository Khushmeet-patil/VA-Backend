require("dotenv").config();
const mongoose = require("mongoose");
const { getStoreDB } = require("../src/store/config/db");
const { encrypt } = require("../src/store/utils/crypto");
const Kwikship = require("../src/store/models/Kwikship");

async function seed() {
  try {
    const username = "dev-store-kwik-labs";
    const password = "rSsq3o22cYG07VWK3t1";

    console.log("Starting Kwikship Seed...");
    
    // Wait for DB connection
    const db = getStoreDB();
    if (db.readyState !== 1) {
        console.log("Waiting for DB connection...");
        await new Promise((resolve) => {
            db.once("connected", resolve);
        });
    }

    // Deactivate existing
    await Kwikship.updateMany({}, { isActive: false });

    // Upsert the dev account
    const account = await Kwikship.findOneAndUpdate(
      { username: username },
      {
        password: encrypt(password),
        isActive: true,
        isDev: true
      },
      { upsert: true, new: true }
    );

    console.log("✅ Successfully seeded Kwikship dev credentials!");
    console.log("Username:", account.username);
    console.log("Environment: Sandbox/Dev");
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  }
}

seed();
