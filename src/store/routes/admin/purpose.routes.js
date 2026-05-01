const express = require("express");
const router = express.Router();
const Purpose = require("../../models/Purpose");

// Get all purposes (Admin)
router.get("/", async (req, res) => {
  try {
    const purposes = await Purpose.find().sort({ createdAt: -1 });
    res.json(purposes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create Purpose
router.post("/create", async (req, res) => {
  try {
    const { name, slug, description, image, color, isActive } = req.body;
    
    // Check if slug exists
    const existing = await Purpose.findOne({ slug });
    if (existing) {
      return res.status(400).json({ message: "Purpose with this slug already exists" });
    }

    const purpose = new Purpose({
      name,
      slug,
      description,
      image,
      color,
      isActive: isActive !== undefined ? isActive : true,
    });

    await purpose.save();
    res.status(201).json(purpose);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update Purpose
router.put("/update/:id", async (req, res) => {
  try {
    const { name, slug, description, image, color, isActive } = req.body;
    
    const purpose = await Purpose.findById(req.params.id);
    if (!purpose) {
      return res.status(404).json({ message: "Purpose not found" });
    }

    // If slug is changed, check if it already exists
    if (slug && slug !== purpose.slug) {
      const existing = await Purpose.findOne({ slug });
      if (existing) {
        return res.status(400).json({ message: "Purpose with this slug already exists" });
      }
    }

    purpose.name = name || purpose.name;
    purpose.slug = slug || purpose.slug;
    purpose.description = description !== undefined ? description : purpose.description;
    purpose.image = image !== undefined ? image : purpose.image;
    purpose.color = color || purpose.color;
    purpose.isActive = isActive !== undefined ? isActive : purpose.isActive;

    await purpose.save();
    res.json(purpose);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete Purpose
router.delete("/delete/:id", async (req, res) => {
  try {
    const purpose = await Purpose.findByIdAndDelete(req.params.id);
    if (!purpose) {
      return res.status(404).json({ message: "Purpose not found" });
    }
    res.json({ message: "Purpose deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
