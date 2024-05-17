export async function onRequest(context) {
    async function verifyTurnstile(turnstile_response, remoteip) {
        // Validate the token by calling the
        // "/siteverify" API endpoint.
        let formData = new FormData();
        formData.append('secret', context.env.TURNSTILE_KEY);
        formData.append('response', turnstile_response);
        formData.append('remoteip', remoteip);

        const url = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
        const result = await fetch(url, {
            body: formData,
            method: 'POST',
        });

        const outcome = await result.json();
        console.log(outcome);
        if (outcome.success) {
            return true;
        }
        return false;
    }

    function validateEmail(email) {
        return String(email)
            .toLowerCase()
            .match(
                /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
            );
    };

    // get body
    const body = await context.request.formData();
    // Turnstile injects a token in "cf-turnstile-response".
    const turnstile_response = body.get('cf-turnstile-response');
    const remoteip = context.request.headers.get('CF-Connecting-IP');
    const email = body.get('email');

    const verifiedHuman = await verifyTurnstile(turnstile_response, remoteip);

    if (verifiedHuman && validateEmail(email)) {
        // Replace <yourcompany.com> with the domain you set up earlier
        const sender = 'noreply@map.cheltenham.space'
        const send_request = new Request('https://api.mailchannels.net/tx/v1/send', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                personalizations: [
                    {
                        to: [{ email: email, name: 'Recipient' }],
                    },
                ],
                from: {
                    email: sender,
                    name: 'Cheltenham Hackspace',
                },
                subject: 'Sign in link',
                content: [
                    {
                        type: 'text/html',
                        value: '<h1>Hello from Cheltenham hackspace enviro map</h1>\nThis function is a work in progress at the moment... sorry.',
                    },
                ],
            }),
        })
        const resp = await fetch(send_request)
        const response = await resp.json();
        console.log(response);
        return new Response("Email sent")
    }
    return new Response("Nope. Forbidden.", { status: 403 })
}
