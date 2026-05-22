/**
 * server/index.js
 *
 * AWS integration points in this file:
 *   - CloudWatch: console.log() is captured automatically by the ECS
 *                 awslogs log driver → /ecs/naija-store log group.
 *                 No SDK code needed here — the Docker runtime handles it.
 *   - ECS health check: ALB calls GET /api/health every 30s.
 *                 If it fails 3× the task is replaced automatically.
 */

const express = require("express");
const path    = require("path");
const cors    = require("cors");

const productsRouter = require("./routes/products");
const ordersRouter   = require("./routes/orders");
const usersRouter    = require("./routes/users");
const { verifyToken } = require("./middleware/auth");

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────
app.use(express.json());
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || "https://naijaafricaribstore.co.uk",
  credentials: true,
}));

// Structured request logging → captured by CloudWatch awslogs driver
app.use((req, _res, next) => {
  console.log(JSON.stringify({
    level:     "INFO",
    method:    req.method,
    path:      req.path,
    timestamp: new Date().toISOString(),
    requestId: req.headers["x-amzn-requestid"] || "local",
  }));
  next();
});

// ── AWS Health check (Step 7 — ECS/Fargate) ──────────────────
// ALB pings this every 30 s. Unhealthy → task replaced.
app.get("/api/health", (_req, res) => {
  res.json({
    status:    "ok",
    service:   "naija-store-api",
    timestamp: new Date().toISOString(),
    region:    process.env.AWS_REGION || "eu-west-2",
  });
});

// ── Public routes (no auth) ───────────────────────────────────
// API Gateway routes /api/products without a JWT authorizer
// so anyone can browse the shop without logging in.
app.use("/api/products", productsRouter);

// ── Protected routes (require Cognito JWT) ────────────────────
// API Gateway rejects requests without a valid JWT before they
// even reach the ALB — verifyToken middleware is a second
// layer of defence inside the container.
app.use("/api/orders", verifyToken, ordersRouter);
app.use("/api/users",  verifyToken, usersRouter);

// ── Serve React build (Step 3 — CloudFront + S3 for prod) ────
// In production CloudFront serves the React build from S3.
// This fallback lets you run the full app locally with one command.
app.use(express.static(path.join(__dirname, "../public")));
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "../public", "index.html"));
});

// ── Error handler → structured log to CloudWatch ─────────────
app.use((err, _req, res, _next) => {
  console.error(JSON.stringify({
    level:     "ERROR",
    message:   err.message,
    stack:     err.stack,
    timestamp: new Date().toISOString(),
  }));
  res.status(err.status || 500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(JSON.stringify({
    level:   "INFO",
    message: `Naija Store API running on port ${PORT}`,
    env:     process.env.NODE_ENV,
    region:  process.env.AWS_REGION,
  }));
});

module.exports = app;
