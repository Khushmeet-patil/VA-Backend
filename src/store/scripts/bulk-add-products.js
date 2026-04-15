const axios = require("axios");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");

// Configuration
const BASE_URL = "https://backendstore-production-1122.up.railway.app/api";
const VENDOR_EMAIL = "khusmitpatil4@gmail.com";
const VENDOR_PASSWORD = "123456789";
const IMAGES_DIR = path.join(__dirname, "../productimages");

const PRODUCT_NAMES = ["Astro", "Rudra", "Vedic", "Divine", "Spiritual", "Cosmic", "Lunar", "Solar", "Ganesh", "Shiva"];
const PRODUCT_TYPES = ["Mala", "Stone", "Yantra", "Ring", "Bracelet", "Necklace", "Incense", "Oil"];
const PURPOSES = ["career_success", "love_relationships", "health_healing", "money", "evil_eye_protection", "protection_negativity", "gifting"];

async function run() {
  try {
    console.log("--- Starting Bulk Product Addition Script ---");

    // 1. Login
    console.log("Logging in...");
    const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
      email: VENDOR_EMAIL,
      password: VENDOR_PASSWORD,
    });

    const token = loginRes.data.token;
    console.log("Login successful!");

    const headers = { Authorization: `Bearer ${token}` };

    // 2. Fetch Categories
    console.log("Fetching categories...");
    const categoryRes = await axios.get(`${BASE_URL}/category`);
    const categories = categoryRes.data.categories;

    if (!categories || categories.length === 0) {
      throw new Error("No categories found. Please add categories first.");
    }
    console.log(`Found ${categories.length} categories.`);

    // 3. Read Images
    if (!fs.existsSync(IMAGES_DIR)) {
      fs.mkdirSync(IMAGES_DIR);
    }
    const images = fs.readdirSync(IMAGES_DIR).filter(file => /\.(jpg|jpeg|png|webp)$/i.test(file));

    if (images.length === 0) {
      console.warn("No images found in 'product images' folder. Please add some screenshots!");
      return;
    }
    console.log(`Found ${images.length} images to use.`);

    // 4. Create Products (Limit to number of images or specified count)
    const count = images.length;
    console.log(`Starting creation of ${count} products...`);

    for (let i = 0; i < count; i++) {
        try {
            const imageName = images[i];
            const imagePath = path.join(IMAGES_DIR, imageName);

            // A. Upload Image
            console.log(`[${i+1}/${count}] Uploading image: ${imageName}...`);
            const formData = new FormData();
            formData.append("file", fs.createReadStream(imagePath));

            const uploadRes = await axios.post(`${BASE_URL}/upload/single`, formData, {
                headers: {
                    ...headers,
                    ...formData.getHeaders(),
                },
                timeout: 30000, // 30s timeout
            });

            const imageUrl = uploadRes.data.url;
            console.log(`Uploaded! URL: ${imageUrl}`);

            // B. Generate Dummy Data
            const namePrefix = PRODUCT_NAMES[Math.floor(Math.random() * PRODUCT_NAMES.length)];
            const nameSuffix = PRODUCT_TYPES[Math.floor(Math.random() * PRODUCT_TYPES.length)];
            const productName = `${namePrefix} ${nameSuffix} ${Math.floor(Math.random() * 1000)}`;
            const slug = productName.toLowerCase().replace(/ /g, "-") + "-" + Date.now();
            
            const mrp = Math.floor(Math.random() * 4500) + 500;
            const discountValue = Math.random() > 0.5 ? 10 : 0;
            const categoryId = categories[Math.floor(Math.random() * categories.length)]._id;
            const purpose = [PURPOSES[Math.floor(Math.random() * PURPOSES.length)]];

            const productData = {
                name: productName,
                slug: slug,
                category: categoryId,
                shortDescription: `Authentic ${productName} for your spiritual needs.`,
                description: `This is a high-quality ${productName} designed for ${purpose[0].replace("_", " ")}. It is spiritually energized and ready for use.`,
                pricing: {
                    mrp: mrp,
                    discountType: discountValue > 0 ? "percentage" : "none",
                    discountValue: discountValue,
                    gstRate: 18,
                    finalPrice: mrp
                },
                images: [imageUrl],
                stock: Math.floor(Math.random() * 50) + 10,
                purposes: purpose,
                tags: [namePrefix, nameSuffix, "Astro", "Vedic"]
            };

            // C. Create Product
            console.log(`Creating product: ${productName}...`);
            const productRes = await axios.post(`${BASE_URL}/vendor/products/create`, productData, { headers });
            console.log(`Product created successfully! ID: ${productRes.data.product._id}`);
            console.log("------------------------------------------");

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error) {
            console.error(`Error processing image ${images[i]}:`, error.message);
            if (error.response) {
                console.error("Response data:", JSON.stringify(error.response.data, null, 2));
            }
            console.log("Skipping to next image...");
            console.log("------------------------------------------");
        }
    }

    console.log("All products added successfully!");

  } catch (error) {
    console.error("An error occurred:");
    if (error.response) {
      console.error(JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }
  }
}

run();
