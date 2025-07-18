import { NextResponse } from 'next/server';
import { OAuth2Client } from 'google-auth-library';
import { SignJWT } from 'jose';
import { createUser, getUserByEmail } from '../../../../db';

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.BASE_URL}/api/auth/google/callback`
);

const JWT_SECRET = new TextEncoder().encode('Pec@tu2024++');

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');

    if (!code) {
      return NextResponse.json(
        { success: false, error: 'Authorization code not found' },
        { status: 400 }
      );
    }

    // Exchange code for tokens
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    // Get user info from Google
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    // Check if user exists
    let user = await getUserByEmail(email);

    if (!user) {
      // Create new user
      user = await createUser({
        email,
        username: name,
        googleId,
        avatar: picture,
        provider: 'google'
      });
    }

    // Generate JWT token
    const token = await new SignJWT({
      userId: user._id || user.userId,
      username: user.username,
      email: user.email
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(JWT_SECRET);

    // Create response and set cookie
    const response = NextResponse.redirect(`${process.env.BASE_URL}/dashboard`);
    response.cookies.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Google callback error:', error);
    return NextResponse.redirect(`${process.env.BASE_URL}/login?error=auth_failed`);
  }
}