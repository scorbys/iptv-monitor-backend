import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { getUserById }  from '../../../db';

const JWT_SECRET = new TextEncoder().encode('Pec@tu2024++');

export async function GET(request) {
  try {
    // Get token from cookies
    const token = request.cookies.get('token')?.value;

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'No token provided' },
        { status: 401 }
      );
    }

    // Verify token
    const { payload } = await jwtVerify(token, JWT_SECRET);
    
    // Get fresh user data from database
    const user = await getUserById(payload.userId);
    
    if (!user) {
      // User not found in database, clear cookie
      const response = NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 401 }
      );
      response.cookies.delete('token');
      return response;
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Token verification error:', error);
    
    // Clear invalid token
    const response = NextResponse.json(
      { success: false, error: 'Invalid token' },
      { status: 401 }
    );
    response.cookies.delete('token');
    return response;
  }
}

export async function POST(request) {
  // Tambahkan CORS headers
  const headers = {
    'Access-Control-Allow-Origin': 'https://iptv-monitor2.vercel.app',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  };

  try {
    // existing code...
    const response = NextResponse.json({
      success: true,
      // ... data
    });
    
    // Set CORS headers
    Object.entries(headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    
    return response;
  } catch (error) {
    // handle error with CORS headers
    const errorResponse = NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
    
    Object.entries(headers).forEach(([key, value]) => {
      errorResponse.headers.set(key, value);
    });
    
    return errorResponse;
  }
}

// Tambahkan OPTIONS handler untuk preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': 'https://iptv-monitor2.vercel.app',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Credentials': 'true',
    },
  });
}