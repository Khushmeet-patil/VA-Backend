const Counter = require("../models/Counter");

module.exports = async function generateOrderNumber() {
  const counter = await Counter.findOneAndUpdate(
    { name: "order" },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  return `ORD-${String(counter.seq).padStart(6, "0")}`;
};
