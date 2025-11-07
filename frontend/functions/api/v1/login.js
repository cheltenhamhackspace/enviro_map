/**
 * Login API Endpoint
 * Handles user authentication with Turnstile verification and JWT generation
 */
import { SignJWT, importPKCS8 } from 'jose';

export async function onRequest(context) {
    try {
        // Get request body
        const body = await context.request.formData();
        const turnstileResponse = body.get('cf-turnstile-response');
        const remoteip = context.request.headers.get('CF-Connecting-IP');
        const email = body.get('email');

        // Validate input
        if (!email || !turnstileResponse) {
            return createErrorResponse('Missing required fields', 400);
        }

        if (!validateEmail(email)) {
            return createErrorResponse('Invalid email format', 400);
        }

        // Verify Turnstile token
        // Skip verification if TURNSTILE_KEY is not set (development mode)
        if (context.env.TURNSTILE_KEY) {
            const verifiedHuman = await verifyTurnstile(turnstileResponse, remoteip, context.env.TURNSTILE_KEY);

            if (!verifiedHuman) {
                return createErrorResponse('Turnstile verification failed', 403);
            }
        } else {
            console.log('TURNSTILE_KEY not set - skipping verification (development mode)');
        }

        // Generate JWT token
        const jwt = await generateJWT(email, context.env.JWT_PRIVATE_KEY);

        // Send login email
        const emailSent = await sendLoginEmail(email, jwt, context.env.MAILCHANNELS_API_KEY);

        if (!emailSent) {
            return createErrorResponse('Failed to send login email', 500);
        }

        // Return success response
        return new Response(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Login Email Sent</title>
                <style>
                    body { font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 2rem auto; padding: 2rem; }
                    .success { background: #d4edda; border: 1px solid #c3e6cb; color: #155724; padding: 1rem; border-radius: 0.5rem; }
                    .btn { display: inline-block; background: #206bc4; color: white; padding: 0.75rem 1.5rem; text-decoration: none; border-radius: 0.5rem; margin-top: 1rem; }
                </style>
            </head>
            <body>
                <div class="success">
                    <h1>✅ Login Email Sent</h1>
                    <p>A login link has been sent to <strong>${email}</strong>.</p>
                    <p>Please check your email and click the link to sign in. If you don't see the email, please check your spam folder.</p>
                    <a href="/" class="btn">Return to Dashboard</a>
                </div>
            </body>
            </html>
        `, {
            headers: {
                'Content-Type': 'text/html;charset=UTF-8',
                'Access-Control-Allow-Origin': '*'
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        return createErrorResponse('Internal server error', 500);
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
 * Generates JWT token for authentication
 */
async function generateJWT(email, privateKeyPem) {
    try {
        const alg = 'EdDSA';
        const privateKey = await importPKCS8(privateKeyPem, alg);

        const jwt = await new SignJWT({
            sub: email, // Use email as subject for now
            email: email,
            email_verified: false,
            iss: 'map.cheltenham.space',
            aud: 'enviro-dashboard'
        })
        .setProtectedHeader({ alg, typ: 'JWT' })
        .setIssuedAt()
        .setExpirationTime('15m') // 15 minutes expiry
        .sign(privateKey);

        return jwt;
    } catch (error) {
        console.error('JWT generation error:', error);
        throw new Error('Failed to generate authentication token');
    }
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
                name: 'Cheltenham Hackspace Environmental Monitor',
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
                            .btn { display: inline-block; background: #206bc4; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
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

/**
 * Creates standardized error response
 */
function createErrorResponse(message, status = 400) {
    return new Response(JSON.stringify({
        error: true,
        message: message
    }), {
        status: status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        }
    });
}

/**
 * Handle OPTIONS requests for CORS preflight
 */
export async function onRequestOptions() {
    return new Response(null, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        }
    });
}
