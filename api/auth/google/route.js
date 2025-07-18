import { NextResponse } from 'next/server';
import { OAuth2Client } from 'google-auth-library';

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.BASE_URL}/api/auth/google/callback`
);

export async function GET(request) {
  try {
    const url = client.generateAuthUrl({
      access_type: "offline",
      scope: ["profile", "email"],
    });

    return NextResponse.redirect(url);
  } catch (error) {
    console.error('Google auth error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate auth URL' },
      { status: 500 }
    );
  }
}