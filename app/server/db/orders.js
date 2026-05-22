/**
 * server/db/orders.js
 *
 * AWS integration: DynamoDB naija-store-orders table (Step 8)
 *
 * Table schema (from terraform/dynamodb.tf):
 *   PK: orderId (S)   SK: userId (S)
 *   GSI: userId-createdAt-index  →  hash=userId, range=createdAt
 *
 * Every order is tied to a Cognito userId (req.user.sub).
 * The GSI lets us fetch all orders for a user efficiently.
 */

const { randomUUID } = require("crypto");
const {
  PutCommand,
  QueryCommand,
  GetCommand,
  UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");

const { ddb, TABLES } = require("./client");

// ── Create a new order ────────────────────────────────────────
async function createOrder({ userId, items, deliveryAddress, total }) {
  const orderId   = randomUUID();
  const createdAt = new Date().toISOString();

  const order = {
    orderId,
    userId,       // Cognito sub from JWT — injected by verifyToken middleware
    items,        // [{ productId, name, qty, price }]
    deliveryAddress,
    total,
    status:    "pending",  // pending → confirmed → dispatched → delivered
    createdAt,
    updatedAt: createdAt,
  };

  await ddb.send(new PutCommand({
    TableName: TABLES.ORDERS,
    Item:      order,
  }));

  return order;
}

// ── Get all orders for a user (newest first) ──────────────────
async function getOrdersByUser(userId) {
  const result = await ddb.send(new QueryCommand({
    TableName:                TABLES.ORDERS,
    IndexName:                "userId-createdAt-index",
    KeyConditionExpression:   "#uid = :uid",
    ExpressionAttributeNames: { "#uid": "userId" },
    ExpressionAttributeValues:{ ":uid": userId },
    ScanIndexForward:         false,   // newest first
    Limit:                    20,
  }));

  return result.Items || [];
}

// ── Get a single order ────────────────────────────────────────
async function getOrderById(orderId, userId) {
  const result = await ddb.send(new GetCommand({
    TableName: TABLES.ORDERS,
    Key:       { orderId, userId },
  }));
  return result.Item || null;
}

// ── Update order status ───────────────────────────────────────
async function updateOrderStatus(orderId, userId, status) {
  const result = await ddb.send(new UpdateCommand({
    TableName:                 TABLES.ORDERS,
    Key:                       { orderId, userId },
    UpdateExpression:          "SET #s = :s, updatedAt = :ua",
    ExpressionAttributeNames:  { "#s": "status" },
    ExpressionAttributeValues: { ":s": status, ":ua": new Date().toISOString() },
    ReturnValues:              "ALL_NEW",
  }));
  return result.Attributes;
}

module.exports = { createOrder, getOrdersByUser, getOrderById, updateOrderStatus };
