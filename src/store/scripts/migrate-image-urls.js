const mongoose = require("mongoose");
require("dotenv").config();

const MONGO_URI = process.env.STORE_MONGO_URI;
const OLD_DOMAIN = "pub-ca8033f45aab48c4a6a8a668291771b0.r2.dev";
const NEW_DOMAIN = "pub-c9ac3ed39952447287320fce822a40b0.r2.dev";

async function migrate() {
  try {
    console.log("--- Starting Database Image URL Migration ---");
    console.log(`Replacing ${OLD_DOMAIN} with ${NEW_DOMAIN}`);

    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB.");

    // 1. Update Products
    const Product = mongoose.model("Product", new mongoose.Schema({
      images: [String]
    }, { strict: false }));

    const products = await Product.find({ images: { $regex: OLD_DOMAIN } });
    console.log(`Found ${products.length} products to update.`);

    for (const product of products) {
      product.images = product.images.map(url => url.replace(OLD_DOMAIN, NEW_DOMAIN));
      await product.save();
    }
    console.log("Products updated.");

    // 2. Update Categories
    const Category = mongoose.model("Category", new mongoose.Schema({
      image: String
    }, { strict: false }));

    const categories = await Category.find({ image: { $regex: OLD_DOMAIN } });
    console.log(`Found ${categories.length} categories to update.`);

    for (const category of categories) {
      category.image = category.image.replace(OLD_DOMAIN, NEW_DOMAIN);
      await category.save();
    }
    console.log("Categories updated.");

    // 3. Update Banners
    const Banner = mongoose.model("Banner", new mongoose.Schema({
      image: String
    }, { strict: false }));

    const banners = await Banner.find({ image: { $regex: OLD_DOMAIN } });
    console.log(`Found ${banners.length} banners to update.`);

    for (const banner of banners) {
      banner.image = banner.image.replace(OLD_DOMAIN, NEW_DOMAIN);
      await banner.save();
    }
    console.log("Banners updated.");

    console.log("--- Migration Completed Successfully ---");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

migrate();
function replace(oldDomain, newDomain) {
    return (url) => url.replace(oldDomain, newDomain);
}
