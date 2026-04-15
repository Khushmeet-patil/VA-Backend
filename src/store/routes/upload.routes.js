const express = require("express");
const router = express.Router();
const upload = require("../middleware/upload.middleware");
const { uploadToR2 } = require("../utils/r2Storage");

/* ======================================================
   🔹 SINGLE FILE UPLOAD
====================================================== */
router.post("/single", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    const url = await uploadToR2(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );

    return res.status(201).json({
      success: true,
      message: "File uploaded successfully to R2",
      url,
    });
  } catch (error) {
    console.error("Single upload error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Upload failed",
    });
  }
});

/* ======================================================
   🔹 MULTIPLE FILE UPLOAD
====================================================== */
router.post("/multiple", upload.array("files", 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No files uploaded",
      });
    }

    const uploadPromises = req.files.map((file) =>
      uploadToR2(file.buffer, file.originalname, file.mimetype)
    );

    const urls = await Promise.all(uploadPromises);

    return res.status(201).json({
      success: true,
      message: "Files uploaded successfully to R2",
      urls,
    });
  } catch (error) {
    console.error("Multiple upload error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Upload failed",
    });
  }
});

module.exports = router;

module.exports = router;
