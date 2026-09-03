const path = require("path");
const { Sequelize } = require("sequelize");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
require("dotenv").config({ path: path.resolve(__dirname, "../../../.env") });
require("dotenv").config();

const dbUrl = process.env.MYSQL_URL || process.env.DATABASE_URL;

const useSsl =
  process.env.DB_SSL === "true" ||
  (dbUrl && (dbUrl.includes("ssl=") || dbUrl.includes("tidbcloud") || dbUrl.includes("aivencloud")));

const dialectOptions = useSsl
  ? { ssl: { require: true, rejectUnauthorized: false } }
  : {};

const sequelize = dbUrl
  ? new Sequelize(dbUrl, {
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
