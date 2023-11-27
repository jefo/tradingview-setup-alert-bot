const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');

const app = express();
const port = 3000;

// Подключение к MongoDB
mongoose.connect('mongodb://localhost:27017/alerts', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
const connection = mongoose.connection;
connection.once('open', () => {
  console.log('Connected to MongoDB');
});

// Модель для хранения timeseries данных
const AlertSchema = new mongoose.Schema({
  type: String,
  timeframe: String,
  timestamp: {
    type: Date,
    default: Date.now,
  },
});
const Alert = mongoose.model('Alert', AlertSchema);

// Для обработки JSON-запросов
app.use(bodyParser.json());

// POST запрос /alert
app.post('/alert', (req, res) => {
  // Получение данных из запроса
  const { type, timeframe } = req.body;

  // Создание экземпляра Alert
  const alert = new Alert({ type, timeframe });

  // Сохранение в базу данных
  alert.save()
    .then(() => {
      res.status(200).json(alert);
    })
    .catch((err) => {
      res.status(400).send('Unable to save to database');
    });
});

// Запуск сервера
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
