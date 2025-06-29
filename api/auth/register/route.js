import { NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import { createUser } from '../../../db';

const JWT_SECRET = new TextEncoder().encode('Pec@tu2024++');

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://iptv-monitor2.vercel.app',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Credentials': 'true',
};

export async function POST(request) {
  try {
    const { username, email, password } = await request.json();

    // Validate input
    if (!username || !email || !password) {
      const response = NextResponse.json(
        { success: false, error: 'All fields are required' },
        { status: 400 }
      );

      // Set CORS headers - INI YANG HILANG
      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      return response;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      const response = NextResponse.json(
        { success: false, error: 'Invalid email format' },
        { status: 400 }
      );

      // Set CORS headers
      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      return response;
    }

    // Validate password length
    if (password.length < 6) {
      const response = NextResponse.json(
        { success: false, error: 'Password must be at least 6 characters long' },
        { status: 400 }
      );

      // Set CORS headers
      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      return response;
    }

    // Create user
    const createResult = await createUser({ username, email, password });

    if (!createResult.success) {
      const response = NextResponse.json(
        { success: false, error: createResult.error },
        { status: 400 }
      );

      // Set CORS headers
      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      return response;
    }

    // Create JWT token
    const token = await new SignJWT({
      userId: createResult.userId.toString(),
      username: username,
      email: email
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(JWT_SECRET);

    // Create response
    const response = NextResponse.json({
      success: true,
      user: {
        userId: createResult.userId, // PERBAIKI: tambahkan userId
        username: username,
        email: email
      },
      message: 'Registration successful'
    });

    // Set HTTP-only cookie
    response.cookies.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 // 7 days
    });

    // Set CORS headers
    Object.entries(corsHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error) {
    console.error('Registration API error:', error);
    // handle error with CORS headers
    const errorResponse = NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );

    Object.entries(corsHeaders).forEach(([key, value]) => {
      errorResponse.headers.set(key, value);
    });

    return errorResponse; // PERBAIKI: return errorResponse, bukan undefined
  }
}

// OPTIONS handler for preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  });
}