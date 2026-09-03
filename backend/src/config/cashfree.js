const logger = require("../config/logger");

/**
 * Cashfree Payment Gateway configuration.
 * Uses the official cashfree-pg REST API (v2025-01-01).
 * Never throws — returns null if credentials are missing so the rest of
 * the app keeps running without a payment gateway configured.
 */

const CASHFREE_API_VERSION = "2025-01-01";
const CASHFREE_SANDBOX_URL = "https://sandbox.cashfree.com/pg";
const CASHFREE_PROD_URL = "https://api.cashfree.com/pg";

function getBaseUrl() {
  return process.env.NODE_ENV === "production" ? CASHFREE_PROD_URL : CASHFREE_SANDBOX_URL;
}

function isEnabled() {
  return Boolean(process.env.CASHFREE_APP_ID && process.env.CASHFREE_SECRET_KEY);
}

/**
 * Low-level authenticated POST to Cashfree.
 */
async function cashfreePost(path, body) {
  if (!isEnabled()) return null;
  const url = `${getBaseUrl()}${path}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-client-id": process.env.CASHFREE_APP_ID,
        "x-client-secret": process.env.CASHFREE_SECRET_KEY,
        "x-api-version": CASHFREE_API_VERSION,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      logger.warn(`[cashfree] POST ${path} failed: ${res.status} ${JSON.stringify(data)}`);
      return null;
    }
    return data;
  } catch (err) {
    logger.warn(`[cashfree] POST ${path} error: ${err.message}`);
    return null;
  }
}

/**
 * GET from Cashfree (e.g. order status).
 */
async function cashfreeGet(path) {
  if (!isEnabled()) return null;
  const url = `${getBaseUrl()}${path}`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "x-client-id": process.env.CASHFREE_APP_ID,
        "x-client-secret": process.env.CASHFREE_SECRET_KEY,
        "x-api-version": CASHFREE_API_VERSION,
      },
    });
    const data = await res.json();
    if (!res.ok) {
      logger.warn(`[cashfree] GET ${path} failed: ${res.status}`);
      return null;
    }
    return data;
  } catch (err) {
    logger.warn(`[cashfree] GET ${path} error: ${err.message}`);
    return null;
  }
}

module.exports = { isEnabled, cashfreePost, cashfreeGet, getBaseUrl };
