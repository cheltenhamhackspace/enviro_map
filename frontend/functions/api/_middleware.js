/**
 * API middleware (rework plan WP6).
 *
 * Runs for every /api/* request:
 * - Answers CORS preflight once, instead of an onRequestOptions copy in
 *   every handler file.
 * - Catches anything a handler throws and returns the standard error
 *   envelope instead of a Workers exception page.
 *
 * The sensor ingest contract (POST /api/v1/sensor/{device_id}) is untouched:
 * its responses are produced by the handler as before; this only adds the
 * safety net around uncaught errors.
 */

const PREFLIGHT_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
};

export async function onRequest(context) {
    if (context.request.method === 'OPTIONS') {
        return new Response(null, { headers: PREFLIGHT_HEADERS });
    }

    try {
        return await context.next();
    } catch (error) {
        console.error('Unhandled API error:', context.request.method, new URL(context.request.url).pathname, error);
        return new Response(JSON.stringify({
            error: { code: 'internal_error', message: 'Internal server error' }
        }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }
}
