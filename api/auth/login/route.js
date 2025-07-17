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
  try {
    const { identifier, password } = await request.json();

    // Validate input
    if (!identifier || !password) {
      const response = NextResponse.json(
        { success: false, error: 'Email/username and password are required' },
        { status: 400 }
      );
      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
      return response;
    }

    // Authenticate user dengan timeout
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Database timeout')), 10000)
    );

    const authResult = await Promise.race([
      authenticateUser(identifier, password),
      timeoutPromise
    ]);

    if (!authResult.success) {
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
    console.error('Login API error:', error);
    const response = NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
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
