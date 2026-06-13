/**
 * Login API Endpoint
 * Handles user authentication with Turnstile verification and JWT generation
 */
import { signToken } from './lib/auth.js';
import { apiError } from './lib/responses.js';

export async function onRequest(context) {
    try {
        // Get request body
        const body = await context.request.formData();
        const turnstileResponse = body.get('cf-turnstile-response');
        const remoteip = context.request.headers.get('CF-Connecting-IP');
        const email = body.get('email');

        // Validate input
        if (!email || !turnstileResponse) {
            return apiError('invalid_request', 'Missing required fields', 400, { cors: false });
        }

        if (!validateEmail(email)) {
            return apiError('invalid_request', 'Invalid email format', 400, { cors: false });
        }

        // Verify Turnstile token
        // Skip verification if TURNSTILE_KEY is not set (development mode)
        if (context.env.TURNSTILE_KEY) {
            const verifiedHuman = await verifyTurnstile(turnstileResponse, remoteip, context.env.TURNSTILE_KEY);

            if (!verifiedHuman) {
                return apiError('turnstile_failed', 'Turnstile verification failed', 403, { cors: false });
            }
        } else {
            console.log('TURNSTILE_KEY not set - skipping verification (development mode)');
        }

        // Look up existing user
        const user = await context.env.READINGS_TABLE.prepare(
            "SELECT id FROM users WHERE email = ?"
        ).bind(email).first();

        if (!user) {
            // Anti-enumeration: identical response whether or not the account
            // exists. No email is sent for unknown addresses.
            return new Response(JSON.stringify({
                success: true,
                email: email,
                message: 'Login email sent'
            }), {
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'no-store'
                }
            });
        }

        // Generate a single-use login token (purpose + jti enforced by /verify)
        const jwt = await signToken({
            email: email,
            userId: user.id,
            purpose: 'login',
            expiry: '15m',
            jti: crypto.randomUUID()
        }, context.env.JWT_PRIVATE_KEY);

        // Send login email
        const emailSent = await sendLoginEmail(email, jwt, context.env.MAILCHANNELS_API_KEY);

        if (!emailSent) {
            return apiError('email_failed', 'Failed to send login email', 500, { cors: false });
        }

        // Return JSON; the login page renders the success state client-side.
        // (Server-rendered HTML here previously reflected the user-supplied email — XSS.)
        return new Response(JSON.stringify({
            success: true,
            email: email,
            message: 'Login email sent'
        }), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-store'
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        return apiError('internal_error', 'Internal server error', 500, { cors: false });
    }
}

/**
 * Validates Turnstile token with Cloudflare
 */
async function verifyTurnstile(turnstileResponse, remoteip, turnstileKey) {
    try {
        const formData = new FormData();
        formData.append('secret', turnstileKey);
        formData.append('response', turnstileResponse);
        formData.append('remoteip', remoteip);

        const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            body: formData,
        });

        const result = await response.json();
        console.log('Turnstile verification result:', result);
        
        return result.success === true;
    } catch (error) {
        console.error('Turnstile verification error:', error);
        return false;
    }
}

/**
 * Validates email format
 */
function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Sends login email via MailChannels
 */
async function sendLoginEmail(email, jwt, mailchannelsApiKey) {
    try {
        // Check if API key is configured
        if (!mailchannelsApiKey) {
            console.error('MAILCHANNELS_API_KEY not configured');
            return false;
        }

        const emailContent = {
            personalizations: [{
                to: [{ email: email, name: 'User' }],
            }],
            from: {
                email: 'noreply@map.cheltenham.space',
                name: 'Cheltenham Hackspace',
            },
            subject: 'Your Environmental Dashboard Login Link',
            content: [{
                type: 'text/html',
                value: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="UTF-8">
                        <style>
                            body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; color: #333; }
                            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                            .header { background: linear-gradient(135deg, #206bc4, #4dabf7); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
                            .content { background: #f8f9fa; padding: 20px; border-radius: 0 0 8px 8px; }
                            .btn { display: inline-block; background: #0d3a66; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: 600; }
                            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="header">
                                <h1>🌍 Environmental Dashboard Login</h1>
                            </div>
                            <div class="content">
                                <p>Hello!</p>
                                <p>You requested to sign in to the Cheltenham Hackspace Environmental Monitoring Dashboard.</p>
                                <p>Click the button below to securely sign in:</p>
                                <a href="https://map.cheltenham.space/api/v1/verify?jwt=${jwt}" class="btn">Sign In to Dashboard</a>
                                <p><strong>This link will expire in 15 minutes</strong> for your security.</p>
                                <p>If you didn't request this login, you can safely ignore this email.</p>
                            </div>
                            <div class="footer">
                                <p>Cheltenham Hackspace Environmental Monitoring<br>
                                <a href="https://www.cheltenhamhackspace.org/">www.cheltenhamhackspace.org</a></p>
                            </div>
                        </div>
                    </body>
                    </html>
                `
            }],
        };

        const response = await fetch('https://api.mailchannels.net/tx/v1/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Api-Key': mailchannelsApiKey,
            },
            body: JSON.stringify(emailContent),
        });

        console.log('Email send status:', response.status);
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Email send error response:', errorText);
        }

        return response.ok;
    } catch (error) {
        console.error('Email send error:', error);
        return false;
    }
}


