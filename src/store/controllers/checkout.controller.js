const checkoutService = require("../services/checkout.service");

exports.cartCheckout = async (req, res) => {
  try {
    const userId = req.user._id;
    const { couponCode, shippingAddress, selectedItems } = req.body;

    const result = await checkoutService.cartCheckout({
      userId,
      couponCode,
      shippingAddress,
      selectedItems,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "Cart checkout failed",
    });
  }
};

exports.buyNowCheckout = async (req, res) => {
  try {
    const order = await checkoutService.buyNowCheckout({
      userId: req.user._id,
      ...req.body,
    });

    res.status(200).json({
      success: true,
      order,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

exports.getCheckoutSummary = async (req, res) => {
  const userId = req.user._id;
  const { type, productId, quantity, couponCode, selectedItems } = req.body;

  let summary;

  if (type === "buy_now") {
    summary = await checkoutService.buyNowSummary({
      userId,
      productId,
      quantity,
      couponCode,
    });
  } else {
    summary = await checkoutService.cartSummary({
      userId,
      couponCode,
      selectedItems,
    });
  }

  res.json({
    success: true,
    data: summary,
  });
};
