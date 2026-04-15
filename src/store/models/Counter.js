const mongoose = require("mongoose");
const { getStoreDB } = require("../config/db");

const counterSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
  },
  seq: {
    type: Number,
    default: 0,
  },
});

module.exports = getStoreDB().models.Counter || getStoreDB().model("Counter", counterSchema);
