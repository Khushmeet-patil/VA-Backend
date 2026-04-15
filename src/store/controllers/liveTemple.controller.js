const service = require("../services/liveTemple.service");

/* ============ PUBLIC ============ */
exports.getActiveLiveTemples = async (req, res) => {
  try {
    const temples = await service.getActiveLiveTemples();

    res.status(200).json({
      success: true,
      data: temples,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ============ ADMIN ============ */
exports.createLiveTemple = async (req, res) => {
  try {
    const { title, liveUrl, isActive = true } = req.body;

    if (!title || !liveUrl) {
      return res.status(400).json({
        success: false,
        message: "title and liveUrl are required",
      });
    }

    const createdTemple = await service.createLiveTemple({
      title,
      liveUrl,
      isActive,
    });

    return res.status(201).json({
      success: true,
      message: "Live temple created successfully",
      data: createdTemple,
    });
  } catch (error) {
    console.error("createLiveTemple error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create live temple",
    });
  }
};

exports.getAllLiveTemples = async (req, res) => {
  try {
    const temples = await service.getAllLiveTemples();

    res.status(200).json({ success: true, data: temples });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getLiveTempleById = async (req, res) => {
  try {
    const temple = await service.getLiveTempleById(req.params.id);

    if (!temple) {
      return res.status(404).json({
        success: false,
        message: "Live temple not found",
      });
    }

    res.status(200).json({ success: true, data: temple });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateLiveTemple = async (req, res) => {
  try {
    const updatedTemple = await service.updateLiveTemple(
      req.params.id,
      req.body,
    );

    if (!updatedTemple) {
      return res.status(404).json({
        success: false,
        message: "Live temple not found",
      });
    }

    res.status(200).json({ success: true, data: updatedTemple });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateLiveTempleStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const temple = await service.toggleLiveTempleStatus(id);

    if (!temple) {
      return res.status(404).json({
        success: false,
        message: "Live temple not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Live temple status updated",
      data: temple,
    });
  } catch (error) {
    console.error("updateLiveTempleStatus error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update live temple status",
    });
  }
};

exports.deleteLiveTemple = async (req, res) => {
  try {
    const temple = await service.deleteLiveTemple(req.params.id);

    if (!temple) {
      return res.status(404).json({
        success: false,
        message: "Live temple not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Live temple deleted successfully",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
