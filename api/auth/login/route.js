import { NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import { authenticateUser } from '../../../db';

const JWT_SECRET = new TextEncoder().encode('Pec@tu2024++');

export async function POST(request) {
  try {
    const { identifier, password } = await request.json();

    // Validate input
    if (!identifier || !password) {
      return NextResponse.json(
        { success: false, error: 'Email/username and password are required' },
        { status: 400 }
      );
    }

    // Authenticate user
    const authResult = await authenticateUser(identifier, password);
    
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: 401 }
      );
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

    // Set HTTP-only cookie
    response.cookies.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 // 7 days
    });

    return response;
  } catch (error) {
    console.error('Login API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}