import { NextResponse } from 'next/server';

// CORS headers configuration
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://iptv-monitor2.vercel.app',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Credentials': 'true',
};

export async function POST() {
  try {
    console.log("=== NEXTJS LOGOUT REQUEST START ===");

    const response = NextResponse.json({
      success: true,
      message: 'Logged out successfully',
      authenticated: false
    });

    // Clear cookie dengan berbagai konfigurasi untuk memastikan terhapus
    const cookieConfigs = [
      {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 0,
        path: '/'
      },
      {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 0,
        path: '/'
      },
      {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: 0,
        path: '/'
      },
      {
        maxAge: 0,
        path: '/'
      }
    ];

    // Clear dengan semua konfigurasi
    cookieConfigs.forEach(config => {
      response.cookies.set('token', '', config);
    });

    // Set CORS headers
    Object.entries(corsHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    console.log("✅ NextJS logout successful - all cookies cleared");
    console.log("=== NEXTJS LOGOUT REQUEST END ===");

    return response;
  } catch (error) {
    console.error('Logout API error:', error);
    const response = NextResponse.json(
      { success: true, message: 'Logged out successfully', authenticated: false },
      { status: 200 } // Selalu return 200 untuk logout
    );

    // Set CORS headers for error response
    Object.entries(corsHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  }
}

// OPTIONS handler untuk preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  });
}