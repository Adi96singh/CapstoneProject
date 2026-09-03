const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
require("dotenv").config({ path: path.resolve(__dirname, "../../../.env") });
require("dotenv").config();
const logger = require("../config/logger");

// Importing each worker module starts it listening on its queue.
require("./emailWorker");
require("./notificationWorker");
require("./aiWorker");
require("./escalationWorker");
require("./fileProcessingWorker");

logger.info("[workers] all workers started: email, notification, ai, escalation, fileProcessing");
