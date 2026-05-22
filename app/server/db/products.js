/**
 * server/db/products.js
 *
 * AWS integration: DynamoDB naija-store-products table (Step 8)
 *
 * Table schema (from terraform/dynamodb.tf):
 *   PK: productId (S)
 *   GSI: category-createdAt-index  →  hash=category, range=createdAt
 *
 * All Nigerian food products live in DynamoDB.
 * On first deploy, seed the table using the seed script below.
 */

const {
  GetCommand,
  QueryCommand,
  ScanCommand,
  PutCommand,
} = require("@aws-sdk/lib-dynamodb");

const { ddb, TABLES } = require("./client");

// ── Get all products (with optional category filter) ──────────
async function getProducts({ category, limit = 50, lastKey } = {}) {
  if (category && category !== "All") {
    // Use the GSI to query by category efficiently
    const params = {
      TableName:                TABLES.PRODUCTS,
      IndexName:                "category-createdAt-index",
      KeyConditionExpression:   "#cat = :cat",
      ExpressionAttributeNames: { "#cat": "category" },
      ExpressionAttributeValues:{ ":cat": category },
      Limit:                    limit,
    };
    if (lastKey) params.ExclusiveStartKey = lastKey;

    const result = await ddb.send(new QueryCommand(params));
    return {
      items:   result.Items,
      lastKey: result.LastEvaluatedKey,
    };
  }

  // Scan returns all products (fine for a small catalogue)
  const params = {
    TableName: TABLES.PRODUCTS,
    Limit:     limit,
    FilterExpression: "#stock = :true",
    ExpressionAttributeNames:  { "#stock": "inStock" },
    ExpressionAttributeValues: { ":true": true },
  };
  if (lastKey) params.ExclusiveStartKey = lastKey;

  const result = await ddb.send(new ScanCommand(params));
  return {
    items:   result.Items,
    lastKey: result.LastEvaluatedKey,
  };
}

// ── Get a single product by ID ────────────────────────────────
async function getProductById(productId) {
  const result = await ddb.send(new GetCommand({
    TableName: TABLES.PRODUCTS,
    Key:       { productId },
  }));
  return result.Item || null;
}

// ── Seed helper (run once after terraform apply) ──────────────
async function seedProduct(product) {
  await ddb.send(new PutCommand({
    TableName:           TABLES.PRODUCTS,
    Item:                { ...product, createdAt: new Date().toISOString() },
    ConditionExpression: "attribute_not_exists(productId)", // don't overwrite
  }));
}

module.exports = { getProducts, getProductById, seedProduct };
