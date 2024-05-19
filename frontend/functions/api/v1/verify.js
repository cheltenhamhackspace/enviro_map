// LIKELY A TEMPORARY TEST FUNCTION

const jose = require('jose');

export async function onRequest(context) {

    const urlParams = new URL(context.request.url).searchParams;
    let jwt = urlParams.get("jwt");

    if (jwt) {

        let verifyResults;

        const alg = 'RS256';
        const publicKey = await jose.importSPKI(context.env.JWT_PUBLIC_KEY, alg);

        try {
            verifyResults = await jose.jwtVerify(jwt, publicKey, {
                issuer: 'testIssuer',
                audience: 'testAudience',
            });
        }
        catch (error) {
            return new Response(`JWT validation error: ${error}`, { status: 500 })
        }

        return new Response(`JWT verified ${JSON.stringify(verifyResults)}`, {
            headers: {
                "content-type": "text/html;charset=UTF-8",
            }
        });
    }
    return new Response("No JWT specified.", { status: 404 })
}