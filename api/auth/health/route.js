import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'IPTV Authentication API'
  });
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