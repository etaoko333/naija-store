/**
 * server/routes/products.js
 *
 * AWS integration: API Gateway (Step 5) + DynamoDB (Step 8)
 *
 * These routes are PUBLIC — API Gateway routes /api/products
 * WITHOUT a Cognito JWT authorizer, so any visitor can browse
 * the Nigerian food catalogue before signing in.
 *
 * Request flow for GET /api/products:
 *   Browser → Route 53 → CloudFront → API Gateway → ALB → ECS → DynamoDB
 */

const express = require("express");
const router  = express.Router();
const { getProducts, getProductById } = require("../db/products");

// GET /api/products?category=Meat+%26+Poultry&limit=12
router.get("/", async (req, res, next) => {
  try {
    const { category, limit, lastKey } = req.query;
    const result = await getProducts({
      category,
      limit:   limit ? parseInt(limit, 10) : 50,
      lastKey: lastKey ? JSON.parse(decodeURIComponent(lastKey)) : undefined,
    });

    res.json({
      products:    result.items,
      nextPageKey: result.lastKey
        ? encodeURIComponent(JSON.stringify(result.lastKey))
        : null,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/products/:productId
router.get("/:productId", async (req, res, next) => {
  try {
    const product = await getProductById(req.params.productId);
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json(product);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
