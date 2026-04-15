const { fetchAllWithdrawals, updateWithdrawalStatus, markWithdrawalPaid, getWithdrawalBreakdown } = require("../../controllers/withdrawal.controller")

const router = require("express").Router()

router.get("/view", fetchAllWithdrawals)
router.get("/:id/breakdown", getWithdrawalBreakdown)

router.put("/:id/update", updateWithdrawalStatus)

router.post("/:id/paid", markWithdrawalPaid)

module.exports = router