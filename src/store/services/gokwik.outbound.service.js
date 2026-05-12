/**
 * GoKwik Outbound Service
 *
 * Handles calls FROM our backend TO GoKwik's API:
 *   - Sync Product  → POST /v3/product/update-product-details
 *   - Sync Collection → POST /v3/collection/update-collection
 *   - Update Order  → POST /v3/orders/update
 *
 * All syncs are fire-and-forget: we log errors but never fail our own
 * operations if GoKwik is unreachable.
 *
 * Required env vars (from GoKwik):
 *   GK_API_BASE_URL   e.g. https://api.gokwik.co  (or sandbox URL)
 *   GK_APP_ID         provided by GoKwik
 *   GK_APP_SECRET     provided by GoKwik
 */
const axios = require("axios");
const Product = require("../models/Product");
const logger = require("../utils/logger");

const BASE_URL = process.env.GK_API_BASE_URL || "https://api.gokwik.co";
const APP_ID = process.env.GK_APP_ID || "";
const APP_SECRET = process.env.GK_APP_SECRET || "";

const gkHeaders = {
  "gk-app-id": APP_ID,
  "gk-app-secret": APP_SECRET,
  "Content-Type": "application/json",
  "app_name": "checkout", // Added per sandbox requirements
};

/* ─────────────────────────────────────────────
   INTERNAL MAPPERS
───────────────────────────────────────────── */

const mapProductToGokwik = (product, isDeleted = false) => {
  const pid = product._id.toString();

  // Variants: if product has size variants use those, else one default variant
  let variants;
  if (product.variants && product.variants.length > 0) {
    variants = product.variants.map((v, idx) => ({
      id: `${pid}-${v.size}`,
      product_id: pid,
      image_id: "1",
      title: v.size,
      price: product.pricing.finalPrice,
      compare_at_price: product.pricing.mrp || product.pricing.finalPrice,
      inventory_quantity: v.stock || 0,
      sku: product.sku || `${pid}-${v.size}`,
    }));
  } else {
    variants = [
      {
        id: `${pid}-default`,
        product_id: pid,
        image_id: "1",
        title: "Default",
        price: product.pricing.finalPrice,
        compare_at_price: product.pricing.mrp || product.pricing.finalPrice,
        inventory_quantity: product.stock || 0,
        sku: product.sku || pid,
      },
    ];
  }

  // Images
  const images = (product.images || []).map((src, idx) => ({
    id: String(idx + 1),
    product_id: pid,
    src,
    variant_ids: [],
  }));

  if (images.length === 0) {
    images.push({ id: "1", product_id: pid, src: "", variant_ids: [] });
  }

  // Options (Required for products with variants in GoKwik)
  const options = [];
  if (product.variants && product.variants.length > 0) {
    options.push({
      name: product.variantName || "Size",
      values: product.variants.map(v => v.size)
    });
  } else {
    options.push({
      name: "Title",
      values: ["Default"]
    });
  }

  return {
    id: pid,
    title: product.name,
    status: product.isVisible ? "published" : "draft",
    tags: (product.tags || []).join(","),
    updated_at: (product.updatedAt || new Date()).toISOString(),
    handle: product.slug || pid,
    body_html: product.description || "",
    vendor: "VedicAstro", // Or get from product.vendorId if available
    product_type: product.category?.name || "General",
    merchant_id: process.env.GK_MID || "", // Added merchant_id
    is_deleted: isDeleted,
    variants,
    images,
    options
  };
};

const mapCategoryToGokwik = async (category) => {
  const productDocs = await Product.find(
    { category: category._id, status: true, "approval.status": "approved" },
    "_id"
  ).lean();

  return {
    id: category._id.toString(),
    handle: category.slug || category._id.toString(),
    title: category.name,
    product_ids: productDocs.map((p) => p._id.toString()),
    updated_at: (category.updatedAt || new Date()).toISOString(),
  };
};

/* ─────────────────────────────────────────────
   SYNC PRODUCT
───────────────────────────────────────────── */

exports.syncProduct = async (product, isDeleted = false) => {
  if (!APP_ID || !APP_SECRET) {
    logger.warn("GoKwik outbound: GK_APP_ID / GK_APP_SECRET not set — skipping product sync");
    return;
  }

  try {
    const productData = mapProductToGokwik(product, isDeleted);
    // GoKwik V3 update-product-details usually expects the raw product object
    // but some versions expect it wrapped in a "product" key.
    // We will send the raw object but log it for debugging.
    
    logger.info("GoKwik syncProduct initiating", { 
      productId: product._id, 
      name: product.name,
      isVisible: product.isVisible,
      isDeleted 
    });

    const res = await axios.post(
      `${BASE_URL}/v3/product/update-product-details`,
      productData,
      { headers: gkHeaders, timeout: 10000 }
    );
    
    logger.info("GoKwik syncProduct success", {
      productId: product._id,
      gkResponse: res.data,
    });
  } catch (err) {
    logger.error("GoKwik syncProduct failed", {
      productId: product?._id,
      error: err?.response?.data || err.message,
    });
  }
};

/* ─────────────────────────────────────────────
   SYNC COLLECTION (CATEGORY)
───────────────────────────────────────────── */

const mongoose = require("mongoose");

exports.syncCollection = async (categoryOrId) => {
  if (!APP_ID || !APP_SECRET) {
    logger.warn("GoKwik outbound: GK_APP_ID / GK_APP_SECRET not set — skipping collection sync");
    return;
  }

  const Category = require("../models/Category");

  try {
    let category = categoryOrId;
    if (typeof categoryOrId === "string" || categoryOrId instanceof mongoose.Types.ObjectId) {
      category = await Category.findById(categoryOrId);
    }

    if (!category) {
      logger.warn("GoKwik syncCollection: Category not found", { categoryId: categoryOrId });
      return;
    }

    const payload = await mapCategoryToGokwik(category);
    const res = await axios.post(
      `${BASE_URL}/v3/collection/update-collection`,
      payload,
      { headers: gkHeaders, timeout: 8000 }
    );
    logger.info("GoKwik syncCollection success", {
      categoryId: category._id,
      gkResponse: res.data,
    });
  } catch (err) {
    logger.error("GoKwik syncCollection failed", {
      categoryId: categoryOrId?._id || categoryOrId,
      error: err?.response?.data || err.message,
    });
  }
};

/* ─────────────────────────────────────────────
   SYNC ALL (FULL CATALOG)
───────────────────────────────────────────── */

exports.syncEverything = async () => {
  if (!APP_ID || !APP_SECRET) {
    logger.warn("GoKwik outbound: GK_APP_ID / GK_APP_SECRET not set — skipping full sync");
    return { success: false, message: "GoKwik credentials (GK_APP_ID/GK_APP_SECRET) not configured in .env" };
  }

  const Category = require("../models/Category");

  try {
    const categories = await Category.find({}).lean();
    const products = await Product.find({ "approval.status": "approved" });

    logger.info("GoKwik full sync process started", {
      categoriesFound: categories.length,
      approvedProductsFound: products.length,
    });

    if (products.length === 0) {
      logger.warn("No approved products found for GoKwik sync. Please ensure products are approved in Admin Panel.");
    }

    // 1. Sync Categories
    const catResults = [];
    for (const cat of categories) {
      try {
        const payload = await mapCategoryToGokwik(cat);
        await axios.post(`${BASE_URL}/v3/collection/update-collection`, payload, {
          headers: gkHeaders,
          timeout: 10000,
        });
        catResults.push({ id: cat._id, success: true });
      } catch (err) {
        catResults.push({ id: cat._id, success: false, error: err.message });
      }
    }

    // 2. Sync Products
    const prodResults = [];
    for (const prod of products) {
      try {
        const payload = mapProductToGokwik(prod);
        await axios.post(`${BASE_URL}/v3/product/update-product-details`, payload, {
          headers: gkHeaders,
          timeout: 10000,
        });
        prodResults.push({ id: prod._id, success: true });
      } catch (err) {
        logger.error("Individual product sync failed during syncEverything", { 
          productId: prod._id, 
          error: err?.response?.data || err.message 
        });
        prodResults.push({ id: prod._id, success: false, error: err.message });
      }
    }

    return {
      success: true,
      message: "Sync process completed",
      details: {
        categories: { total: categories.length, synced: catResults.filter(r => r.success).length },
        products: { total: products.length, synced: prodResults.filter(r => r.success).length }
      }
    };
  } catch (error) {
    logger.error("GoKwik full sync process failed", { error: error.message });
    throw error;
  }
};

/* ─────────────────────────────────────────────
   UPDATE ORDER
───────────────────────────────────────────── */

const ORDER_STATUS_MAP = {
  confirmed: "Confirmed",
  processing: "Confirmed",
  partially_shipped: "Confirmed",
  shipped: "Confirmed",
  completed: "Confirmed",
  cancelled: "Cancelled",
  pending: "Pending",
  failed: "Failed",
};

exports.updateOrder = async (order, refundAmount = null) => {
  if (!APP_ID || !APP_SECRET) {
    logger.warn("GoKwik outbound: GK_APP_ID / GK_APP_SECRET not set — skipping order update");
    return;
  }

  try {
    const payload = {
      merchant_order_id: order.orderNumber,
      order_status: ORDER_STATUS_MAP[order.orderStatus] || "Confirmed",
      awb_number: order.kwikship?.waybill || "",
      awb_status: order.kwikship?.status || "",
      shipping_provider: order.kwikship?.courierName || "",
      order_note: order.notes || "",
      ...(refundAmount ? { refund_amount: String(refundAmount) } : {}),
    };

    const res = await axios.post(
      `${BASE_URL}/v3/orders/update`,
      payload,
      { headers: gkHeaders, timeout: 8000 }
    );
    logger.info("GoKwik updateOrder success", {
      orderNumber: order.orderNumber,
      gkResponse: res.data,
    });
  } catch (err) {
    logger.error("GoKwik updateOrder failed", {
      orderNumber: order.orderNumber,
      error: err?.response?.data || err.message,
    });
  }
};
