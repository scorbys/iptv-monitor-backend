import { NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import { createUser }  from '../../../db';

const JWT_SECRET = new TextEncoder().encode('Pec@tu2024++');

export async function POST(request) {
  try {
    const { username, email, password } = await request.json();

    // Validate input
    if (!username || !email || !password) {
      return NextResponse.json(
        { success: false, error: 'All fields are required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Validate password length
    if (password.length < 6) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 6 characters long' },
        { status: 400 }
      );
    }

    // Create user
    const createResult = await createUser({ username, email, password });
    
    if (!createResult.success) {
      return NextResponse.json(
        { success: false, error: createResult.error },
        { status: 400 }
      );
    }

    // Create JWT token
    const token = await new SignJWT({
      userId: createResult.userId,
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
        id: createResult.userId,
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

    return response;
  } catch (error) {
    console.error('Register API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}