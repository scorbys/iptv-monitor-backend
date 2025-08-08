const fs = require('fs');
const path = require('path');

export async function GET(req, params) {
  try {
    // Extract path from params
    const imagePath = params.params.path;
    
    // Join path array if multiple segments
    const fullPath = Array.isArray(imagePath) ? imagePath.join('/') : imagePath;
    const filePath = path.join(process.cwd(), 'public/uploads', fullPath);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return new Response('File not found', { status: 404 });
    }
    
    // Get file stats
    const stats = fs.statSync(filePath);
    
    // Set appropriate content type
    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp'
    };
    
    const contentType = contentTypes[ext] || 'application/octet-stream';
    
    // Read file
    const fileBuffer = fs.readFileSync(filePath);
    
    // Return response with proper headers
    return new Response(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': stats.size.toString(),
        'Cache-Control': 'public, max-age=31536000', // 1 year cache
      },
    });
    
  } catch (error) {
    console.error('Error serving file:', error);
    return new Response('Internal server error', { status: 500 });
  }
}