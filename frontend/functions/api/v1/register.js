/**
 * User Registration API Endpoint
 * Handles user account creation with Turnstile verification and sends login email
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

        // Check if user already exists
        const existingUser = await context.env.READINGS_TABLE.prepare(
            "SELECT id, email FROM users WHERE email = ?"
        ).bind(email).first();

        let userId;
        let isNewUser = false;

        if (existingUser) {
            // User exists, just send login email
            userId = existingUser.id;
        } else {
            // Create new user
            const createResult = await context.env.READINGS_TABLE.prepare(
                "INSERT INTO users (email, created_at, email_verified) VALUES (?, ?, 0)"
            ).bind(email, Date.now()).run();

            if (!createResult.success) {
                return createErrorResponse('Failed to create user account', 500);
            }

            // Get the newly created user ID
            const newUser = await context.env.READINGS_TABLE.prepare(
                "SELECT id FROM users WHERE email = ?"
            ).bind(email).first();

            userId = newUser.id;
            isNewUser = true;
        }

        // Generate JWT token with user ID
        const jwt = await generateJWT(email, userId, context.env.JWT_PRIVATE_KEY);

        // Send registration/login email
        const emailSent = await sendRegistrationEmail(email, jwt, isNewUser, context.env.MAILCHANNELS_API_KEY);

        if (!emailSent) {
            return createErrorResponse('Failed to send verification email', 500);
        }

        // Return JSON; the register page renders the success state client-side.
        // (Server-rendered HTML here previously reflected the user-supplied email — XSS.)
        return new Response(JSON.stringify({
            success: true,
            email: email,
            isNewUser: isNewUser,
            message: isNewUser ? 'Registration email sent' : 'Login email sent'
        }), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-store'
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        return createErrorResponse('Internal server error: ' + error.message, 500);
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
async function generateJWT(email, userId, privateKeyPem) {
    try {
        const alg = 'EdDSA';
        const privateKey = await importPKCS8(privateKeyPem, alg);

        const jwt = await new SignJWT({
            sub: userId.toString(),
            email: email,
            user_id: userId,
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
 * Sends registration email via MailChannels
 */
async function sendRegistrationEmail(email, jwt, isNewUser, mailchannelsApiKey) {
    try {
        // Check if API key is configured
        if (!mailchannelsApiKey) {
            console.error('MAILCHANNELS_API_KEY not configured');
            return false;
        }

        const subject = isNewUser ?
            'Welcome to Environmental Dashboard - Verify Your Email' :
            'Your Environmental Dashboard Login Link';

        const greeting = isNewUser ?
            '<p>Welcome! Your account has been successfully created.</p>' :
            '<p>You requested to sign in to the Cheltenham Hackspace Environmental Monitoring Dashboard.</p>';

        const emailContent = {
            personalizations: [{
                to: [{ email: email, name: 'User' }],
            }],
            from: {
                email: 'noreply@map.cheltenham.space',
                name: 'Cheltenham Hackspace',
            },
            subject: subject,
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
                            .feature-list { background: white; padding: 15px; border-radius: 6px; margin: 15px 0; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="header">
                                <h1>🌍 Environmental Dashboard ${isNewUser ? 'Registration' : 'Login'}</h1>
                            </div>
                            <div class="content">
                                ${greeting}
                                <p>Click the button below to verify your email and access your dashboard:</p>
                                <a href="https://map.cheltenham.space/api/v1/verify?jwt=${jwt}" class="btn">Verify Email & Sign In</a>
                                ${isNewUser ? `
                                <div class="feature-list">
                                    <h3 style="margin-top: 0;">What you can do:</h3>
                                    <ul>
                                        <li>Register and manage your own environmental sensors</li>
                                        <li>View real-time air quality data</li>
                                        <li>Access historical trends and analytics</li>
                                        <li>Make your sensors public or keep them private</li>
                                    </ul>
                                </div>
                                ` : ''}
                                <p><strong>This link will expire in 15 minutes</strong> for your security.</p>
                                <p>If you didn't request this ${isNewUser ? 'registration' : 'login'}, you can safely ignore this email.</p>
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
