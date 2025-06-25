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