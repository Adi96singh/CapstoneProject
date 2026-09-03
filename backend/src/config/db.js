const path = require("path");
const { Sequelize } = require("sequelize");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
require("dotenv").config({ path: path.resolve(__dirname, "../../../.env") });
require("dotenv").config();

let rawDbUrl = process.env.MYSQL_URL || process.env.DATABASE_URL;
let cleanDbUrl = rawDbUrl;
let useSsl = false;

if (rawDbUrl) {
  useSsl =
    process.env.DB_SSL === "true" ||
    rawDbUrl.includes("ssl") ||
    rawDbUrl.includes("tidbcloud") ||
    rawDbUrl.includes("aivencloud");

  // Strip ?ssl=... or &ssl=... query parameters because mysql2 mistakes it
  // for a named SSL profile string instead of an object
  cleanDbUrl = rawDbUrl
    .replace(/[?&]ssl=[^&]*/gi, "")
    .replace(/\?$/, "");

  // Ensure a valid user database is targeted (redirect /sys, /mysql or root to /test)
  try {
    const parsed = new URL(cleanDbUrl);
    const systemSchemas = ["", "/", "/sys", "/mysql", "/information_schema", "/performance_schema"];
    if (systemSchemas.includes(parsed.pathname)) {
      parsed.pathname = `/${process.env.DB_NAME || "test"}`;
      cleanDbUrl = parsed.toString();
    }
  } catch (err) {
    if (cleanDbUrl.endsWith(":4000/") || cleanDbUrl.endsWith(":4000") || cleanDbUrl.endsWith(":4000/sys")) {
      cleanDbUrl = cleanDbUrl.replace(/:4000(\/(sys)?)?$/, ":4000/test");
    }
  }
}

const dialectOptions = useSsl
  ? { ssl: { require: true, rejectUnauthorized: false } }
  : {};

const sequelize = cleanDbUrl
  ? new Sequelize(cleanDbUrl, {
      dialect: "mysql",
      dialectOptions,
      logging: process.env.NODE_ENV === "development" ? console.log : false,
      define: {
        underscored: true,
        timestamps: true,
      },
      pool: {
        max: 10,
        min: 0,
        acquire: 30000,
        idle: 10000,
      },
    })
  : new Sequelize(
      process.env.DB_NAME || "solveit",
      process.env.DB_USER || "root",
      process.env.DB_PASSWORD || "root",
      {
        host: process.env.DB_HOST || "localhost",
        port: process.env.DB_PORT || 3306,
        dialect: "mysql",
        dialectOptions,
        logging: process.env.NODE_ENV === "development" ? console.log : false,
        define: {
          underscored: true,
          timestamps: true,
        },
        pool: {
          max: 10,
          min: 0,
          acquire: 30000,
          idle: 10000,
        },
      }
    );

module.exports = sequelize;
