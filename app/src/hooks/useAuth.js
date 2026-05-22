/**
 * app/src/hooks/useAuth.js
 *
 * AWS integration: Amazon Cognito (Step 2)
 *
 * This hook wires the React frontend to the Cognito hosted UI.
 *
 * Auth flow:
 *   1. User clicks "Sign in" → redirected to Cognito hosted UI
 *      (https://naija-store-auth.auth.eu-west-2.amazoncognito.com)
 *   2. Cognito handles login/signup/MFA
 *   3. Cognito redirects back to /callback with ?code=...
 *   4. exchangeCodeForTokens() calls Cognito /oauth2/token
 *   5. JWT id_token is stored in memory (never localStorage)
 *   6. Every API call includes: Authorization: Bearer <id_token>
 *   7. API Gateway validates the JWT against Cognito JWKS
 *
 * Env vars (injected by CI/CD pipeline → Vite build):
 *   VITE_COGNITO_USER_POOL_ID   e.g. eu-west-2_aBcDeFgHi
 *   VITE_COGNITO_CLIENT_ID      e.g. 1a2b3c4d5e6f7g8h9i0j
 *   VITE_AWS_REGION             eu-west-2
 *   VITE_API_URL                https://api.naijaafricaribstore.co.uk
 */

import { useState, useCallback, useEffect, createContext, useContext } from "react";

const COGNITO_DOMAIN   = `https://naija-store-auth.auth.${import.meta.env.VITE_AWS_REGION}.amazoncognito.com`;
const CLIENT_ID        = import.meta.env.VITE_COGNITO_CLIENT_ID;
const REDIRECT_URI     = `${window.location.origin}/callback`;

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]   = useState(null);   // { sub, email, name }
  const [token, setToken] = useState(null);   // JWT id_token (in memory only)
  const [loading, setLoading] = useState(true);

  // Check for auth code in URL on page load (Cognito callback)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code   = params.get("code");

    if (code) {
      window.history.replaceState({}, "", window.location.pathname);
      exchangeCodeForTokens(code);
    } else {
      setLoading(false);
    }
  }, []);

  // Exchange Cognito auth code for JWT tokens
  async function exchangeCodeForTokens(code) {
    try {
      const body = new URLSearchParams({
        grant_type:   "authorization_code",
        client_id:    CLIENT_ID,
        code,
        redirect_uri: REDIRECT_URI,
      });

      const res  = await fetch(`${COGNITO_DOMAIN}/oauth2/token`, {
        method:  "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });

      const data = await res.json();
      if (data.id_token) {
        // Decode JWT payload (no signature check — API Gateway does that)
        const payload = JSON.parse(atob(data.id_token.split(".")[1]));
        setToken(data.id_token);
        setUser({ sub: payload.sub, email: payload.email, name: payload.given_name });
      }
    } catch (err) {
      console.error("Cognito token exchange failed:", err);
    } finally {
      setLoading(false);
    }
  }

  // Redirect to Cognito hosted UI
  const signIn = useCallback(() => {
    const params = new URLSearchParams({
      response_type: "code",
      client_id:     CLIENT_ID,
      redirect_uri:  REDIRECT_URI,
      scope:         "openid email profile",
    });
    window.location.href = `${COGNITO_DOMAIN}/oauth2/authorize?${params}`;
  }, []);

  // Sign out — invalidate Cognito session
  const signOut = useCallback(() => {
    setUser(null);
    setToken(null);
    window.location.href = `${COGNITO_DOMAIN}/logout?client_id=${CLIENT_ID}&logout_uri=${window.location.origin}`;
  }, []);

  // Authenticated fetch — attaches JWT to every API call
  // API Gateway validates the JWT before the request hits the ALB.
  const authFetch = useCallback(async (url, options = {}) => {
    if (!token) throw new Error("Not authenticated");
    return fetch(`${import.meta.env.VITE_API_URL}${url}`, {
      ...options,
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${token}`,  // ← API Gateway checks this
        ...options.headers,
      },
    });
  }, [token]);

  return (
    <AuthContext.Provider value={{ user, token, loading, signIn, signOut, authFetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
