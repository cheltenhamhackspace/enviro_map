// LIKELY A TEMPORARY TEST FUNCTION

const jose = require('jose');

export async function onRequest(context) {

    const urlParams = new URL(context.request.url).searchParams;
    let jwt = urlParams.get("jwt");

    if (jwt) {

        let payload, protectedHeader;

        const alg = 'RS256';
        const publicKey = await jose.importSPKI(context.env.JWT_PUBLIC_KEY, alg);

        try {
            let { payload, protectedHeader } = await jose.jwtVerify(jwt, publicKey, {
                issuer: 'testIssuer',
                audience: 'testAudience',
            });
        }
        catch (error) {
            Response(`JWT validation error: ${error}`, { status: 500 })
        }

        try {
            console.log("payload", payload);
            const jsonString = JSON.stringify(payload);
        }
        catch (error) {
            console.log(error);
        }

        try {
            console.log("protectedHeader", protectedHeader);
        }
        catch (error) {
            console.log(error);
        }

        return new Response(`JWT verified ${jsonString}`, {
            headers: {
                "content-type": "text/html;charset=UTF-8",
            }
        });
    }
    return new Response("No JWT specified.", { status: 404 })
}
