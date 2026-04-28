/**
 * Kwikship Integration Diagnostic
 * --------------------------------
 * Run this to isolate Kwikship issues without going through the order flow.
 *
 * Usage:
 *   node scripts/test-kwikship.js                  # tests using DB account or env vars
 *   node scripts/test-kwikship.js --dev            # forces dev URL
 *   node scripts/test-kwikship.js --prod           # forces prod URL
 *   node scripts/test-kwikship.js --waybill        # also creates a test waybill (requires --dev)
 *
 * What it checks:
 *   1. Network reachability to the Kwikship base URL (DNS + TCP + TLS)
 *   2. /authToken — credential validity
 *   3. /waybill (only with --waybill flag) — full flow with test pincode 560064
 */

require("dotenv").config();
const axios = require("axios");
const dns = require("dns").promises;

const args = process.argv.slice(2);
const forceDev = args.includes("--dev");
const forceProd = args.includes("--prod");
const tryWaybill = args.includes("--waybill");

const DEV_URL = "https://dev-gk-kwik-ship.dev.gokwik.io";
const PROD_URL = "https://api.gokwik.co/kwikship";

const log = (label, data) =>
  console.log(`\n[${label}]`, typeof data === "string" ? data : JSON.stringify(data, null, 2));

const fmtDate = (d) => {
  const M = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}-${M[d.getMonth()]}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

async function resolveCreds() {
  if (process.env.KWIKSHIP_USERNAME && process.env.KWIKSHIP_PASSWORD) {
    return {
      source: "env",
      username: process.env.KWIKSHIP_USERNAME,
      password: process.env.KWIKSHIP_PASSWORD,
      isDev: process.env.KWIKSHIP_MODE === "dev",
    };
  }
  // Fall back to DB
  const { getStoreDB } = require("../src/store/config/db");
  const Kwikship = require("../src/store/models/Kwikship");
  const { decrypt } = require("../src/store/utils/crypto");

  const db = getStoreDB();
  if (db.readyState !== 1) {
    await new Promise((r) => db.once("connected", r));
  }
  const acc = await Kwikship.findOne({ isActive: true });
  if (!acc) throw new Error("No Kwikship account configured (no env vars and no active DB record)");
  return {
    source: "db",
    username: acc.username,
    password: decrypt(acc.password),
    isDev: acc.isDev,
  };
}

async function checkDns(host) {
  try {
    const a = await dns.lookup(host);
    log("DNS", { host, ip: a.address, family: `IPv${a.family}` });
    return true;
  } catch (err) {
    log("DNS FAILED", { host, error: err.message });
    return false;
  }
}

async function getToken(baseUrl, username, password) {
  log("AUTH REQUEST", { url: `${baseUrl}/authToken`, username });
  const start = Date.now();
  try {
    const res = await axios.post(
      `${baseUrl}/authToken`,
      { username, password },
      { timeout: 30000 }
    );
    log("AUTH RESPONSE", { ms: Date.now() - start, status: res.status, data: res.data });
    if (res.data?.status !== "SUCCESS" || !res.data?.token) {
      throw new Error(`Auth response not SUCCESS: ${res.data?.status} ${res.data?.message || ""}`);
    }
    return res.data.token;
  } catch (err) {
    log("AUTH FAILED", {
      ms: Date.now() - start,
      message: err.message,
      code: err.code,
      responseStatus: err.response?.status,
      responseData: err.response?.data,
    });
    throw err;
  }
}

async function createTestWaybill(baseUrl, token) {
  const now = new Date();
  const tat = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const code = `TEST-${Date.now()}`;

  // Both pickup and delivery use test pincode 560064 per Kwikship docs
  const testAddress = (name) => ({
    name,
    email: "test@example.com",
    phone: "9999999999",
    alternatePhone: "9999999999",
    address1: "225, Scheme No 114 Part 1 Ab Road",
    address2: "",
    pincode: "560064",
    city: "Bangalore",
    state: "Karnataka",
    stateCode: "KA",
    country: "India",
    countryCode: "IN",
    gstin: "",
  });

  const payload = {
    returnShipmentFlag: "false",
    Shipment: {
      code,
      SaleOrderCode: code,
      orderCode: code,
      channelCode: "CUSTOM",
      channelName: "VedicStore",
      invoiceCode: code,
      orderDate: fmtDate(now),
      fullFillmentTat: fmtDate(tat),
      weight: "500",
      length: "100",
      height: "100",
      breadth: "100",
      source: "vedicstore",
      numberOfBoxes: "1",
      items: [
        {
          name: "Test Item",
          description: "Diagnostic test item",
          quantity: 1,
          skuCode: "TEST-SKU-001",
          itemPrice: 100,
          category: "DEFAULT",
        },
      ],
    },
    deliveryAddressId: "",
    deliveryAddressDetails: testAddress("Test Customer"),
    pickupAddressId: "",
    pickupAddressDetails: testAddress("Test Vendor"),
    returnAddressDetails: testAddress("Test Vendor"),
    currencyCode: "INR",
    paymentMode: "PREPAID",
    totalAmount: "100.00",
    collectableAmount: "0.00",
  };

  log("WAYBILL REQUEST", { url: `${baseUrl}/waybill`, code });
  const start = Date.now();
  try {
    const res = await axios.post(`${baseUrl}/waybill`, payload, {
      headers: { Authorization: token },
      timeout: 30000,
    });
    log("WAYBILL RESPONSE", { ms: Date.now() - start, data: res.data });
  } catch (err) {
    log("WAYBILL FAILED", {
      ms: Date.now() - start,
      message: err.message,
      responseStatus: err.response?.status,
      responseData: err.response?.data,
    });
  }
}

(async () => {
  console.log("======================================");
  console.log("  Kwikship Integration Diagnostic");
  console.log("======================================");

  let creds;
  try {
    creds = await resolveCreds();
  } catch (err) {
    log("CREDENTIALS NOT FOUND", err.message);
    process.exit(1);
  }
  log("CREDENTIALS", { source: creds.source, username: creds.username, isDev: creds.isDev });

  const isDev = forceDev ? true : forceProd ? false : creds.isDev;
  const baseUrl = isDev ? DEV_URL : PROD_URL;
  const host = new URL(baseUrl).host;
  log("TARGET", { baseUrl, mode: isDev ? "DEV/SANDBOX" : "PRODUCTION" });

  const dnsOk = await checkDns(host);
  if (!dnsOk) {
    log("HINT", "DNS resolution failed — check internet/DNS config on server.");
    process.exit(1);
  }

  let token;
  try {
    token = await getToken(baseUrl, creds.username, creds.password);
    log("AUTH OK", `Token (truncated): ${token.slice(0, 32)}…`);
  } catch (err) {
    if (err.code === "ECONNABORTED" || /timeout/i.test(err.message)) {
      log("HINT", "Request timed out — likely outbound firewall blocking " + host + ", or Kwikship API is down.");
    } else if (err.response?.data?.status === "INVALID_CREDENTIALS") {
      log("HINT", "Network OK but credentials are wrong for this environment. Confirm with Kwikship which mode (dev/prod) these credentials belong to.");
    }
    process.exit(1);
  }

  if (tryWaybill) {
    if (!isDev) {
      log("WARN", "--waybill is only safe to run against --dev environment. Aborting waybill test.");
      process.exit(0);
    }
    await createTestWaybill(baseUrl, token);
  }

  process.exit(0);
})();
