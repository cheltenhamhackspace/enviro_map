/**
 * Shared auth helpers for the API functions.
 *
 * Token model (rework plan §5):
 * - Login tokens:   purpose=login, 15 min expiry, unique jti, single-use
 *                   (consumed by POST /api/v1/verify via auth_tokens_used).
 * - Session tokens: purpose=session, 7 day expiry, carried in an httpOnly
 *                   cookie — never readable by page JavaScript.
 *
 * The purpose claim is enforced on both sides: /verify only accepts login
 * tokens (a session token can no longer mint a fresh session forever), and
 * API endpoints only accept session tokens (a login link can't be used as a
 * bearer credential).
 *
 * This file exports no onRequest* handlers, so it does not register a route.
 */
import { jwtVerify, importSPKI, SignJWT, importPKCS8 } from 'jose';

const ALG = 'EdDSA';
const ISSUER = 'map.cheltenham.space';
const AUDIENCE = 'enviro-dashboard';
export const SESSION_COOKIE = 'enviro_session';
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

/**
 * Signs a JWT. purpose must be 'login' or 'session'.
 */
export async function signToken({ email, userId, purpose, expiry, jti }, privateKeyPem) {
    const privateKey = await importPKCS8(privateKeyPem, ALG);
    let jwt = new SignJWT({
        sub: userId.toString(),
        email: email,
        user_id: userId,
        purpose: purpose,
        iss: ISSUER,
        aud: AUDIENCE
    })
        .setProtectedHeader({ alg: ALG, typ: 'JWT' })
        .setIssuedAt()
        .setExpirationTime(expiry);
    if (jti) {
        jwt = jwt.setJti(jti);
    }
    return jwt.sign(privateKey);
}

/**
 * Verifies a JWT and requires the expected purpose claim.
 * Returns { success: true, payload } or { success: false, error }.
 */
export async function verifyToken(jwt, publicKeyPem, expectedPurpose) {
    try {
        const publicKey = await importSPKI(publicKeyPem, ALG);
        const { payload } = await jwtVerify(jwt, publicKey, {
            issuer: ISSUER,
            audience: AUDIENCE,
        });
        if (payload.purpose !== expectedPurpose) {
            return { success: false, error: 'Wrong token type' };
        }
        return { success: true, payload };
    } catch (error) {
        let message = 'Invalid token';
        if (error.code === 'ERR_JWT_EXPIRED') {
            message = 'Token has expired. Please request a new login link.';
        }
        return { success: false, error: message };
    }
}

/**
 * Extracts the session JWT from the request's cookies (null if absent).
 */
export function getSessionCookie(request) {
    const cookieHeader = request.headers.get('Cookie');
    if (!cookieHeader) return null;
    for (const part of cookieHeader.split(';')) {
        const eq = part.indexOf('=');
        if (eq === -1) continue;
        if (part.slice(0, eq).trim() === SESSION_COOKIE) {
            return part.slice(eq + 1).trim() || null;
        }
    }
    return null;
}

/**
 * Verifies the request's session cookie.
 * Returns { userId, email } or null when unauthenticated.
 */
export async function requireSession(context) {
    const jwt = getSessionCookie(context.request);
    if (!jwt) return null;
    const result = await verifyToken(jwt, context.env.JWT_PUBLIC_KEY, 'session');
    if (!result.success) return null;
    return {
        userId: result.payload.user_id,
        email: result.payload.email
    };
}

/**
 * Set-Cookie value for a new session (pass null to clear it on logout).
 * Secure requires HTTPS — fine in production; with `wrangler pages dev`
 * over plain http the cookie will not be stored.
 */
export function sessionCookieHeader(sessionJwt) {
    if (sessionJwt === null) {
        return `${SESSION_COOKIE}=; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=0`;
    }
    return `${SESSION_COOKIE}=${sessionJwt}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
}

/**
 * SHA-256 hex digest — used to store sensor ingest tokens hashed at rest.
 */
export async function sha256Hex(text) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Standard JSON error response (shape matches the existing handlers;
 * unified envelope comes with the WP6 middleware).
 */
export function jsonError(message, status = 400) {
    return new Response(JSON.stringify({ error: true, message: message }), {
        status: status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        }
    });
}
