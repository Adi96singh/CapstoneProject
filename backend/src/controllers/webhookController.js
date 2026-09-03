const { getStripe } = require("../config/stripe");
const paymentService = require("../services/paymentService");
const logger = require("../config/logger");

/**
 * Stripe webhook — expects the raw request body (mounted with express.raw
 * in app.js, before the global express.json() parser) so the signature can
 * be verified.
 */
async function stripeWebhook(req, res) {
  const stripe = getStripe();
  if (!stripe) return res.status(503).json({ success: false, message: "Payments not configured" });

  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = process.env.STRIPE_WEBHOOK_SECRET
      ? stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET)
      : JSON.parse(req.body.toString());
  } catch (err) {
    logger.warn(`[webhook] stripe signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    await paymentService.markPaid(event.data.object.id);
  }

  return res.json({ received: true });
}

module.exports = { stripeWebhook };
