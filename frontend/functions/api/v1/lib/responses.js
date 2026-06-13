/**
 * Standard response helpers (rework plan WP6).
 *
 * Error contract for all non-frozen endpoints:
 *   { "error": { "code": "<machine_readable>", "message": "<human readable>" } }
 * with conventional status codes: 400 validation, 401 unauthenticated,
 * 403 forbidden, 404 not found, 405 method, 429 rate limited, 500 unexpected.
 *
 * The sensor ingest POST responses are frozen and never use these helpers.
 */

/**
 * JSON success response.
 * opts.cors        — include Access-Control-Allow-Origin: * (default true;
 *                    set false on authenticated, same-origin-only endpoints)
 * opts.cacheControl— Cache-Control header value (default no explicit caching)
 * opts.headers     — extra headers (e.g. Set-Cookie, ETag)
 */
export function json(data, { status = 200, cors = true, cacheControl, headers = {} } = {}) {
    const h = { 'Content-Type': 'application/json', ...headers };
    if (cors) h['Access-Control-Allow-Origin'] = '*';
    if (cacheControl) h['Cache-Control'] = cacheControl;
    return new Response(JSON.stringify(data), { status, headers: h });
}

/**
 * Standard error envelope. message is also exposed at the top level as
 * `message` during the transition so older client code reading data.message
 * keeps working; new code should read data.error.message.
 */
export function apiError(code, message, status = 400, { cors = true, headers = {} } = {}) {
    const h = { 'Content-Type': 'application/json', ...headers };
    if (cors) h['Access-Control-Allow-Origin'] = '*';
    return new Response(JSON.stringify({
        error: { code, message },
        message
    }), { status, headers: h });
}
