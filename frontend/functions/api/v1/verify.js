/**
 * JWT Verification API Endpoint
 * Verifies JWT tokens from login emails and redirects users to the dashboard
 */
import { jwtVerify, importSPKI } from 'jose';

export async function onRequest(context) {
    try {
        const url = new URL(context.request.url);
        const jwt = url.searchParams.get('jwt');

        if (!jwt) {
            return createErrorPage('Missing authentication token', 'No JWT token was provided in the request.');
        }

        // Verify the JWT token
        const verificationResult = await verifyJWT(jwt, context.env.JWT_PUBLIC_KEY);
        
        if (!verificationResult.success) {
            return createErrorPage('Invalid or expired token', verificationResult.error);
        }

        // Extract user information from the token
        const { payload } = verificationResult.data;
        const userEmail = payload.email || payload.sub;

        // Create session or redirect to dashboard with authentication
        // For now, we'll show a success page and redirect to dashboard
        return createSuccessPage(userEmail);

    } catch (error) {
        console.error('JWT verification error:', error);
        return createErrorPage('Authentication failed', 'An unexpected error occurred during authentication.');
    }
}

/**
 * Verifies JWT token using the public key
 */
async function verifyJWT(jwt, publicKeyPem) {
    try {
        const alg = 'EdDSA';
        const publicKey = await importSPKI(publicKeyPem, alg);

        const verificationResult = await jwtVerify(jwt, publicKey, {
            issuer: 'map.cheltenham.space',
            audience: 'enviro-dashboard',
        });

        return {
            success: true,
            data: verificationResult
        };
    } catch (error) {
        console.error('JWT verification failed:', error);
        
        let errorMessage = 'Invalid token';
        if (error.code === 'ERR_JWT_EXPIRED') {
            errorMessage = 'Token has expired. Please request a new login link.';
        } else if (error.code === 'ERR_JWT_INVALID') {
            errorMessage = 'Invalid token format.';
        }

        return {
            success: false,
            error: errorMessage
        };
    }
}

/**
 * Creates a success page for successful authentication
 */
function createSuccessPage(email) {
    return new Response(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Login Successful - Environmental Dashboard</title>
            <style>
                body {
                    font-family: system-ui, -apple-system, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0;
                    padding: 1rem;
                }
                .container {
                    background: rgba(255, 255, 255, 0.95);
                    backdrop-filter: blur(10px);
                    border-radius: 1rem;
                    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
                    padding: 2rem;
                    text-align: center;
                    max-width: 500px;
                    width: 100%;
                }
                .success-icon {
                    width: 64px;
                    height: 64px;
                    background: linear-gradient(135deg, #2fb344, #51cf66);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto 1.5rem;
                    color: white;
                    font-size: 2rem;
                }
                h1 {
                    color: #2fb344;
                    margin-bottom: 1rem;
                }
                .email {
                    background: #f8f9fa;
                    padding: 0.75rem;
                    border-radius: 0.5rem;
                    margin: 1rem 0;
                    font-family: monospace;
                    color: #495057;
                }
                .btn {
                    display: inline-block;
                    background: linear-gradient(135deg, #206bc4, #4dabf7);
                    color: white;
                    padding: 0.75rem 2rem;
                    text-decoration: none;
                    border-radius: 0.5rem;
                    margin-top: 1.5rem;
                    transition: transform 0.2s ease;
                }
                .btn:hover {
                    transform: translateY(-2px);
                }
                .countdown {
                    margin-top: 1rem;
                    color: #6c757d;
                    font-size: 0.9rem;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="success-icon">✓</div>
                <h1>Login Successful!</h1>
                <p>Welcome to the Environmental Monitoring Dashboard.</p>
                <div class="email">Authenticated as: ${email}</div>
                <p>You will be redirected to the dashboard automatically.</p>
                <a href="/" class="btn">Go to Dashboard</a>
                <div class="countdown">Redirecting in <span id="countdown">5</span> seconds...</div>
            </div>
            
            <script>
                // Auto-redirect after 5 seconds
                let countdown = 5;
                const countdownElement = document.getElementById('countdown');
                
                const timer = setInterval(() => {
                    countdown--;
                    countdownElement.textContent = countdown;
                    
                    if (countdown <= 0) {
                        clearInterval(timer);
                        window.location.href = '/';
                    }
                }, 1000);
                
                // Allow immediate redirect on click
                document.querySelector('.btn').addEventListener('click', () => {
                    clearInterval(timer);
                });
            </script>
        </body>
        </html>
    `, {
        headers: {
            'Content-Type': 'text/html;charset=UTF-8',
            'Access-Control-Allow-Origin': '*'
        }
    });
}

/**
 * Creates an error page for failed authentication
 */
function createErrorPage(title, message) {
    return new Response(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Authentication Error - Environmental Dashboard</title>
            <style>
                body {
                    font-family: system-ui, -apple-system, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0;
                    padding: 1rem;
                }
                .container {
                    background: rgba(255, 255, 255, 0.95);
                    backdrop-filter: blur(10px);
                    border-radius: 1rem;
                    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
                    padding: 2rem;
                    text-align: center;
                    max-width: 500px;
                    width: 100%;
                }
                .error-icon {
                    width: 64px;
                    height: 64px;
                    background: linear-gradient(135deg, #d63939, #f03e3e);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto 1.5rem;
                    color: white;
                    font-size: 2rem;
                }
                h1 {
                    color: #d63939;
                    margin-bottom: 1rem;
                }
                .error-message {
                    background: #f8d7da;
                    border: 1px solid #f5c6cb;
                    color: #721c24;
                    padding: 1rem;
                    border-radius: 0.5rem;
                    margin: 1rem 0;
                }
                .btn {
                    display: inline-block;
                    background: linear-gradient(135deg, #206bc4, #4dabf7);
                    color: white;
                    padding: 0.75rem 2rem;
                    text-decoration: none;
                    border-radius: 0.5rem;
                    margin: 0.5rem;
                    transition: transform 0.2s ease;
                }
                .btn:hover {
                    transform: translateY(-2px);
                }
                .btn-secondary {
                    background: linear-gradient(135deg, #6c757d, #868e96);
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="error-icon">✗</div>
                <h1>${title}</h1>
                <div class="error-message">${message}</div>
                <p>Please try logging in again or contact support if the problem persists.</p>
                <a href="/login.html" class="btn">Try Login Again</a>
                <a href="/" class="btn btn-secondary">Go to Dashboard</a>
            </div>
        </body>
        </html>
    `, {
        status: 400,
        headers: {
            'Content-Type': 'text/html;charset=UTF-8',
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
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        }
    });
}
