import { NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import { authenticateUser } from '../../../db';

const JWT_SECRET = new TextEncoder().encode('Pec@tu2024++');

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://iptv-monitor2.vercel.app',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Credentials': 'true',
};

// Gunakan setting cookie yang sama di semua auth routes
const cookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'none',
  maxAge: 7 * 24 * 60 * 60,
  path: '/'
};

export async function POST(request) {
  // Set timeout untuk seluruh request handler
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000); // 25 detik

  try {
    const { identifier, password } = await request.json();

    // Validate input
    if (!identifier || !password) {
      clearTimeout(timeoutId);
      const response = NextResponse.json(
        { success: false, error: 'Email/username and password are required' },
        { status: 400 }
      );
      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
      return response;
    }

    // Validate input tidak kosong
    if (identifier.trim().length === 0 || password.trim().length === 0) {
      clearTimeout(timeoutId);
      const response = NextResponse.json(
        { success: false, error: 'Email/username and password cannot be empty' },
        { status: 400 }
      );
      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
      return response;
    }

    console.log('Login attempt for:', identifier);

    // Authenticate user dengan timeout yang lebih pendek
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Authentication timeout')), 15000) // Kurangi dari 10000 ke 15000
    );

    const authResult = await Promise.race([
      authenticateUser(identifier, password),
      timeoutPromise
    ]);

    clearTimeout(timeoutId);

    if (!authResult.success) {
      console.log('Login failed:', authResult.error);
      const response = NextResponse.json(
        { success: false, error: authResult.error },
        { status: 401 }
      );
      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
      return response;
    }

    // Create JWT token
    const token = await new SignJWT({
      userId: authResult.user.userId,
      username: authResult.user.username,
      email: authResult.user.email
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(JWT_SECRET);

    console.log('Login successful for:', authResult.user.username);

    // Create response
    const response = NextResponse.json({
      success: true,
      user: authResult.user,
      message: 'Login successful'
    });

    // Set cookie dengan domain yang benar
    response.cookies.set('token', token, cookieOptions);

    Object.entries(corsHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    console.error('Login API error:', error);

    // Handle specific error types
    let errorMessage = 'Internal server error';
    let statusCode = 500;

    if (error.name === 'AbortError') {
      errorMessage = 'Request timeout';
      statusCode = 504;
    } else if (error.message === 'Authentication timeout') {
      errorMessage = 'Authentication timeout. Please try again.';
      statusCode = 504;
    } else if (error.message === 'Database connection failed') {
      errorMessage = 'Database connection failed. Please try again.';
      statusCode = 503;
    }

    const response = NextResponse.json(
      { success: false, error: errorMessage },
      { status: statusCode }
    );
    Object.entries(corsHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    return response;
  }
}

// OPTIONS handler for preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  });
}
