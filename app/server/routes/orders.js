/**
 * server/routes/orders.js
 *
 * AWS integration: Cognito (Step 2) + API Gateway (Step 5) + DynamoDB (Step 8)
 *
 * These routes are PROTECTED — verifyToken middleware (mounted in index.js)
 * has already verified the Cognito JWT and set req.user before any handler runs.
 *
 * The userId used to write/read DynamoDB records comes from req.user.sub —
 * the immutable Cognito subject identifier, NOT anything the client can forge.
 *
 * Request flow for POST /api/orders:
 *   Browser (with JWT) → CloudFront → API Gateway (validates JWT) →
 *   ALB → ECS container → DynamoDB PutItem
 */

const express = require("express");
const router  = express.Router();
const {
  createOrder,
  getOrdersByUser,
  getOrderById,
} = require("../db/orders");

// POST /api/orders  — place a new order
router.post("/", async (req, res, next) => {
  try {
    const { items, deliveryAddress, total } = req.body;

    if (!items?.length) {
      return res.status(400).json({ error: "Order must contain at least one item" });
    }

    // req.user.sub is the Cognito user ID — set by verifyToken middleware
    const order = await createOrder({
      userId: req.user.sub,
      items,
      deliveryAddress,
      total,
    });

    console.log(JSON.stringify({
      level:   "INFO",
      event:   "order_created",
      orderId: order.orderId,
      userId:  req.user.sub,
      total:   order.total,
      items:   items.length,
    }));

    res.status(201).json(order);
  } catch (err) {
    next(err);
  }
});

// GET /api/orders  — all orders for the logged-in user
router.get("/", async (req, res, next) => {
  try {
    const orders = await getOrdersByUser(req.user.sub);
    res.json({ orders });
  } catch (err) {
    next(err);
  }
});

// GET /api/orders/:orderId
router.get("/:orderId", async (req, res, next) => {
  try {
    const order = await getOrderById(req.params.orderId, req.user.sub);
    if (!order) return res.status(404).json({ error: "Order not found" });
    res.json(order);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
