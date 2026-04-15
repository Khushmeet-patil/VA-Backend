const { requestWithdrawal } = require("../../controllers/withdrawal.controller");

const router = require("express").Router();

router.post("/request", requestWithdrawal);
router.get("/history", require("../../controllers/withdrawal.controller").getVendorWithdrawals);
router.get("/wallet", require("../../controllers/withdrawal.controller").getVendorWallet);

module.exports = router;
