// LIKELY A TEMPORARY TEST FUNCTION

const jose = require('jose');

export async function onRequest(context) {

    const urlParams = new URL(context.request.url).searchParams;
    let jwt = urlParams.get("jwt");

    if (jwt) {

        const alg = 'RS256';
        const privateKey = await jose.importSPKI(context.env.JWT_PUBLIC_KEY, alg);

        const { payload, protectedHeader } = await jose.jwtVerify(jwt, publicKey, {
            issuer: 'testIssuer',
            audience: 'testAudience',
        });

        console.log(payload);
        console.log(protectedHeader);

        return new Response(`<h1>${payload}</h1>${protectedHeader}`, {
            headers: {
                "content-type": "text/html;charset=UTF-8",
            }
        });
    }
    return new Response("No JWT specified.", { status: 404 })
}
