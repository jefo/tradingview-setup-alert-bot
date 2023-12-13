const { Worker, Queue } = require("bullmq");
const { Alert } = require("./models");

module.exports = {
  queue: new Queue("screener"),
  worker: new Worker("screener", async (job) => {
    try {
      const alert = new Alert(job.data);
      await alert.save();
      console.log("saved", job.data);
    } catch (e) {
      console.error(e);
    }
  }),
};
