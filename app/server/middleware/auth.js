/**
 * server/middleware/auth.js
 *
 * AWS integration: Amazon Cognito (Step 2)
 *
 * How it works in the architecture:
 *   1. User logs in via the React app → Cognito issues a JWT id_token
 *   2. React stores the token in memory and sends it on every API call:
 *        Authorization: Bearer <jwt>
 *   3. API Gateway (Step 5) validates the JWT signature against the
 *      Cognito JWKS endpoint BEFORE the request reaches the ALB.
 *      Any request with a missing or expired token is rejected with 401.
 *   4. This middleware is a second layer of defence inside the container —
 *      it decodes the JWT claims so route handlers can read req.user.sub,
 *      req.user.email, etc. without making another Cognito API call.
 */

const { CognitoJwtVerifier } = require("aws-jwt-verify");

// Verifier is created once at startup (caches Cognito JWKS automatically)
const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID,   // set by ECS task definition
  tokenUse:   "id",
  clientId:   process.env.COGNITO_CLIENT_ID,       // set by ECS task definition
});

async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or malformed Authorization header" });
  }

  const token = authHeader.split(" ")[1];

  try {
    // Validates signature, expiry, audience, issuer against Cognito JWKS
    const payload = await verifier.verify(token);

    // Attach decoded claims to the request for use in route handlers
    req.user = {
      sub:   payload.sub,          // Cognito user ID (unique, immutable)
      email: payload.email,
      name:  payload.name || payload.given_name,
    };

    next();
  } catch (err) {
    console.warn(JSON.stringify({
      level:   "WARN",
      message: "JWT verification failed",
      error:   err.message,
      path:    req.path,
    }));
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = { verifyToken };
