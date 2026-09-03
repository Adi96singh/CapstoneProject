const { Queue } = require("bullmq");
const redisClient = require("../config/redis");

const connection = redisClient;

const emailQueue = new Queue("emailQueue", { connection });
const notificationQueue = new Queue("notificationQueue", { connection });
const aiQueue = new Queue("aiQueue", { connection });
const fileProcessingQueue = new Queue("fileProcessingQueue", { connection });
const escalationQueue = new Queue("escalationQueue", { connection });

module.exports = {
  emailQueue,
  notificationQueue,
  aiQueue,
  fileProcessingQueue,
  escalationQueue,
};
