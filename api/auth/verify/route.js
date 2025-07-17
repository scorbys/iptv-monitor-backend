import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { getUserById } from '../../../db';

const JWT_SECRET = new TextEncoder().encode('Pec@tu2024++');

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://iptv-monitor2.vercel.app',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Credentials': 'true',
};

export async function GET(request) {
  try {
    const token = request.cookies.get('token')?.value;

    if (!token) {
      const response = NextResponse.json(
        { success: false, error: 'No token provided' },
        { status: 401 }
      );
      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
      return response;
    }

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const user = await getUserById(payload.userId);

    if (!user) {
      const response = NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 401 }
      );
      response.cookies.delete('token');
      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
      return response;
    }

    const response = NextResponse.json({
      success: true,
      user: {
        userId: user._id || user.userId, // Pastikan userId ada
        username: user.username,
        email: user.email
      }
    });

    Object.entries(corsHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error) {
    console.error('Token verification error:', error);
    const response = NextResponse.json(
      { success: false, error: 'Invalid token' },
      { status: 401 }
    );
    response.cookies.delete('token');
    Object.entries(corsHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    return response;
  }
}

export async function POST(request) {
  try {
    // existing code...
    const response = NextResponse.json({
      success: true,
      // ... data
    });

    // Set CORS headers
    Object.entries(corsHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  } catch (error) {
    // handle error with CORS headers
    const errorResponse = NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );

    Object.entries(corsHeaders).forEach(([key, value]) => {
      errorResponse.headers.set(key, value);
    });

    return errorResponse;
  }
}

// OPTIONS handler for preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  });
}