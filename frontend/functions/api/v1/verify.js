// LIKELY A TEMPORARY TEST FUNCTION

const jose = require('jose');

export async function onRequest(context) {

    const urlParams = new URL(context.request.url).searchParams;
    let jwt = urlParams.get("jwt");

    if (jwt) {
        const alg = 'RS256';
        const publicKey = await jose.importSPKI(context.env.JWT_PUBLIC_KEY, alg);

        let { payload, protectedHeader } = await jose.jwtVerify(jwt, publicKey, {
            issuer: 'testIssuer',
            audience: 'testAudience',
        });

        try {
            console.log("payload", payload);
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

        return new Response(`JWT verified ${JSON.stringify(payload)}`, {
            headers: {
                "content-type": "text/html;charset=UTF-8",
            }
        });
    }
    return new Response("No JWT specified.", { status: 404 })
}
