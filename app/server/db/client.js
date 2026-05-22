/**
 * server/db/client.js
 *
 * AWS integration: Amazon DynamoDB (Step 8)
 *
 * The DynamoDB client uses the ECS task IAM role automatically —
 * NO ACCESS KEYS in environment variables.
 *
 * How credentials flow in ECS Fargate:
 *   Terraform creates an IAM task role → attached to the ECS task definition
 *   → ECS injects temporary credentials into the container via the
 *   ECS metadata endpoint → AWS SDK picks them up automatically.
 *
 * The DynamoDB table names are injected as environment variables
 * by the ECS task definition (see terraform/ecs.tf):
 *   PRODUCTS_TABLE = naija-store-products
 *   ORDERS_TABLE   = naija-store-orders
 *   USERS_TABLE    = naija-store-users
 */

const { DynamoDBClient }            = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient }    = require("@aws-sdk/lib-dynamodb");

const raw = new DynamoDBClient({
  region: process.env.AWS_REGION || "eu-west-2",
  // No credentials config needed — SDK reads from ECS task role automatically
});

// DocumentClient handles marshalling JS objects ↔ DynamoDB AttributeValues
const ddb = DynamoDBDocumentClient.from(raw, {
  marshallOptions:   { removeUndefinedValues: true },
  unmarshallOptions: { wrapNumbers: false },
});

const TABLES = {
  PRODUCTS: process.env.PRODUCTS_TABLE || "naija-store-products",
  ORDERS:   process.env.ORDERS_TABLE   || "naija-store-orders",
  USERS:    process.env.USERS_TABLE    || "naija-store-users",
};

module.exports = { ddb, TABLES };
