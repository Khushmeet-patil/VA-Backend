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
 *   GK_ENV            "sandbox" or "production"
 *   GK_API_BASE_URL   e.g. https://api.gokwik.co
 *   GK_APP_ID         provided by GoKwik
 *   GK_APP_SECRET     provided by GoKwik
 *   GK_MID            merchant ID provided by GoKwik
 */
const axios = require("axios");
const Product = require("../models/Product");
const logger = require("../utils/logger");

/* ─────────────────────────────────────────────
   CONFIGURATION GETTERS
   (Evaluated dynamically to avoid dotenv timing issues)
───────────────────────────────────────────── */

const getGkConfig = () => {
  const env = "sandbox"; // FORCED TO SANDBOX AS REQUESTED
  const mid = env === "production" ? (process.env.GK_PROD_MID || "").trim() : (process.env.GK_SANDBOX_MID || "").trim();
  const appId = env === "production" ? (process.env.GK_PROD_APP_ID || "").trim() : (process.env.GK_SANDBOX_APP_ID || "").trim();
  const appSecret = env === "production" ? (process.env.GK_PROD_APP_SECRET || "").trim() : (process.env.GK_SANDBOX_APP_SECRET || "").trim();
  
  // Force sandbox if sandbox merchant ID is detected
  const isSandbox = env === "sandbox" || mid === "19vhta8dq0co";
  
  const productSyncUrl = isSandbox
      ? "https://api-gw-v4.dev.gokwik.io/sandbox"
      : (process.env.GK_API_BASE_URL || "https://api.gokwik.co");

  const collectionSyncUrl = isSandbox
      ? "https://api-gw-v4.dev.gokwik.io/sandbox"
      : (process.env.GK_API_BASE_URL || "https://api.gokwik.co");

  const checkoutBaseUrl = isSandbox
    ? "https://api-gw-v4.dev.gokwik.io/sandbox"
    : (process.env.GK_API_BASE_URL || "https://api.gokwik.co");

  return { env, mid, appId, appSecret, isSandbox, productSyncUrl, collectionSyncUrl, checkoutBaseUrl };
};

/**
 * Build the standard headers GoKwik expects for product/collection sync.
 * Uses gk-merchant-id (from curl) + app_name: checkout.
 */
const buildItemHeaders = (config) => ({
  "gk-app-id": config.appId,
  "gk-app-secret": config.appSecret,
  "gk-merchant-id": config.mid,
  "app_name": "checkout",
  "Content-Type": "application/json",
});

/**
 * Build the standard headers GoKwik expects for checkout/order APIs.
 */
const buildCheckoutHeaders = (config) => ({
  "gk-app-id": config.appId,
  "gk-app-secret": config.appSecret,
  "gk-merchant-id": config.mid,
  "app_name": "checkout",
  "Content-Type": "application/json",
});

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
    vendor: "VedicAstro",
    product_type: product.category?.name || "General",
    merchant_id: process.env.GK_MID || "", // Fallback if mapper doesn't have config
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
  const config = getGkConfig();
  if (!config.mid) {
    logger.warn("GoKwik outbound: GK_MID not set — skipping product sync");
    return;
  }

  try {
    const productData = mapProductToGokwik(product, isDeleted);
    productData.merchant_id = config.mid; // Override with dynamic mid
    
    const syncUrl = `${config.productSyncUrl}/v3/product/update-product-details`;
    const headers = buildItemHeaders(config);

    logger.info("GoKwik syncProduct initiating", { 
      productId: product._id, 
      name: product.name,
      url: syncUrl,
      merchantId: config.mid,
      isVisible: product.isVisible,
      isDeleted 
    });

    const res = await axios.post(
      syncUrl,
      productData,
      { headers, timeout: 15000 }
    );
    
    logger.info("GoKwik syncProduct success", {
      productId: product._id,
      gkStatus: res.status,
      gkResponse: res.data,
    });

    return { success: true, data: res.data };
  } catch (err) {
    const errorData = err?.response?.data;
    const errorMessage = (typeof errorData === 'object' && errorData !== null) 
      ? (errorData.message || JSON.stringify(errorData)) 
      : (errorData || err.message);

    logger.error("GoKwik syncProduct failed", {
      productId: product?._id,
      status: err?.response?.status,
      error: errorMessage,
    });
    return { success: false, error: errorMessage };
  }
};

/* ─────────────────────────────────────────────
   SYNC COLLECTION (CATEGORY)
───────────────────────────────────────────── */

const mongoose = require("mongoose");

exports.syncCollection = async (categoryOrId) => {
  const config = getGkConfig();
  if (!config.mid) {
    logger.warn("GoKwik outbound: GK_MID not set — skipping collection sync");
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
    payload.merchant_id = config.mid; // Dynamic override

    const syncUrl = `${config.collectionSyncUrl}/v3/collection/update-collection`;
    const headers = buildItemHeaders(config);

    logger.info("GoKwik syncCollection initiating", {
      categoryId: category._id,
      name: category.name,
      url: syncUrl,
      merchantId: config.mid,
    });

    const res = await axios.post(
      syncUrl,
      payload,
      { headers, timeout: 15000 }
    );
    logger.info("GoKwik syncCollection success", {
      categoryId: category._id,
      gkStatus: res.status,
      gkResponse: res.data,
    });

    return { success: true, data: res.data };
  } catch (err) {
    const errorData = err?.response?.data;
    const errorMessage = (typeof errorData === 'object' && errorData !== null) 
      ? (errorData.message || JSON.stringify(errorData)) 
      : (errorData || err.message);

    logger.error("GoKwik syncCollection failed", {
      categoryId: categoryOrId?._id || categoryOrId,
      status: err?.response?.status,
      error: errorMessage,
    });
    return { success: false, error: errorMessage };
  }
};

/* ─────────────────────────────────────────────
   SYNC ALL (FULL CATALOG)
───────────────────────────────────────────── */

exports.syncEverything = async () => {
  const config = getGkConfig();
  if (!config.mid) {
    logger.warn("GoKwik outbound: GK_MID not set — skipping full sync");
    return { 
      success: false, 
      message: "GoKwik credentials (GK_MID) not configured in .env",
      environment: config.isSandbox ? "sandbox" : "production",
    };
  }

  const Category = require("../models/Category");

  try {
    const categories = await Category.find({}).lean();
    const products = await Product.find({ "approval.status": "approved" }).populate("category", "name");

    logger.info("GoKwik full sync process started", {
      env: config.env,
      productSyncUrl: config.productSyncUrl,
      collectionSyncUrl: config.collectionSyncUrl,
      merchantId: config.mid,
      categoriesFound: categories.length,
      approvedProductsFound: products.length,
    });

    if (products.length === 0) {
      logger.warn("No approved products found for GoKwik sync. Please ensure products are approved in Admin Panel.");
    }

    // 1. Sync Categories (Collections)
    const collectionResults = [];
    for (const cat of categories) {
      try {
        const payload = await mapCategoryToGokwik(cat);
        payload.merchant_id = config.mid; // Dynamic override

        logger.info("Syncing collection to GoKwik", { 
          id: cat._id, name: cat.name, 
          productCount: payload.product_ids.length 
        });

        const syncUrl = `${config.collectionSyncUrl}/v3/collection/update-collection`;
        const res = await axios.post(
          syncUrl, 
          payload, 
          { headers: buildItemHeaders(config), timeout: 15000 }
        );

        collectionResults.push({ 
          id: cat._id.toString(), 
          name: cat.name, 
          productCount: payload.product_ids.length,
          success: true, 
          gkResponse: res.data 
        });
      } catch (err) {
        const errorData = err?.response?.data;
        const errorMessage = (typeof errorData === 'object' && errorData !== null) 
          ? (errorData.message || JSON.stringify(errorData)) 
          : (errorData || err.message);

        logger.error("Collection sync failed", { 
          id: cat._id, name: cat.name,
          status: err?.response?.status,
          error: errorMessage 
        });
        collectionResults.push({ 
          id: cat._id.toString(), 
          name: cat.name, 
          success: false, 
          error: errorMessage 
        });
      }
    }

    // 2. Sync Products
    const productResults = [];
    for (const prod of products) {
      try {
        const payload = mapProductToGokwik(prod);
        payload.merchant_id = config.mid; // Dynamic override

        logger.info("Syncing product to GoKwik", { 
          id: prod._id, name: prod.name,
          price: prod.pricing?.finalPrice 
        });

        const syncUrl = `${config.productSyncUrl}/v3/product/update-product-details`;
        const res = await axios.post(
          syncUrl, 
          payload, 
          { headers: buildItemHeaders(config), timeout: 15000 }
        );

        productResults.push({ 
          id: prod._id.toString(), 
          name: prod.name,
          price: prod.pricing?.finalPrice,
          success: true, 
          gkResponse: res.data 
        });
      } catch (err) {
        const errorData = err?.response?.data;
        const errorMessage = (typeof errorData === 'object' && errorData !== null) 
          ? (errorData.message || JSON.stringify(errorData)) 
          : (errorData || err.message);

        logger.error("Product sync failed during syncEverything", { 
          productId: prod._id, name: prod.name,
          status: err?.response?.status,
          error: errorMessage 
        });
        productResults.push({ 
          id: prod._id.toString(), 
          name: prod.name,
          success: false, 
          error: errorMessage 
        });
      }
    }

    const summary = {
      success: true,
      message: "GoKwik full catalog sync completed (LOCAL)",
      environment: `${config.isSandbox ? "sandbox" : "production"} [Raw env: '${config.env}', mid: '${config.mid}']`,
      syncedAt: new Date().toISOString(),
      details: {
        collections: {
          total: categories.length,
          synced: collectionResults.filter(r => r.success).length,
          failed: collectionResults.filter(r => !r.success).length,
          results: collectionResults,
        },
        products: {
          total: products.length,
          synced: productResults.filter(r => r.success).length,
          failed: productResults.filter(r => !r.success).length,
          results: productResults,
        },
      },
    };

    logger.info("GoKwik full sync completed", {
      collectionsTotal: categories.length,
      collectionsSynced: collectionResults.filter(r => r.success).length,
      productsTotal: products.length,
      productsSynced: productResults.filter(r => r.success).length,
    });

    return summary;
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
  const config = getGkConfig();
  if (!config.appId || !config.appSecret) {
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
      `${config.checkoutBaseUrl}/v3/orders/update`,
      payload,
      { headers: buildCheckoutHeaders(config), timeout: 8000 }
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
