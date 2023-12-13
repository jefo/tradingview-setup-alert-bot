const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const { queue } = require("./worker");
const { Alert } = require("./models");

const app = express();
const port = 3000;

// Подключение к MongoDB
mongoose.connect("mongodb://localhost:27017/alerts", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
const connection = mongoose.connection;
connection.once("open", () => {
  console.log("Connected to MongoDB");
});

// Для обработки JSON-запросов
app.use(bodyParser.json());

const handleAlert = (timeframe) => (req, res) => {
  // Получение данных из запроса
  const msg = req.body.msg;
  queue.add("screener", { timeframe, msg });

  res.send("ok");
};

app.get("/ping", (req, res) => req.send("pong"));
// POST запрос /alert
app.post("/alert/h4", handleAlert("h4"));
app.post("/alert/m15", handleAlert("m15"));

// Запуск сервера
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
