export async function onRequest(context) {
    // For testing purpose, replace this with your personal email
    // so that you can see the message sent to your inbox
    const receiver = context.env.owner_email;
    console.log(receiver);
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
                    to: [{ email: receiver, name: 'Test Recipient' }],
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
                    value: '<h1>Hello from Cloudflare worker</h1>',
                },
            ],
        }),
    })
    const resp = await fetch(send_request)
    const response = await resp.json();
    console.log(response);
    return new Response(response)
}
