const mongoose = require("mongoose");

const AlertSchema = new mongoose.Schema({
  msg: String,
  timeframe: String
});

module.exports = {
  Alert: mongoose.model("Alert", AlertSchema),
};
