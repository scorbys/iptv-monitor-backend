const fs = require('fs').promises; // Gunakan promises version
const path = require('path');

export async function GET(req, params) {
  try {
    // Extract path from params
    const imagePath = params.params.path;
    
    // Join path array if multiple segments
    const fullPath = Array.isArray(imagePath) ? imagePath.join('/') : imagePath;
    
    // Security: Prevent directory traversal
    const sanitizedPath = path.normalize(fullPath).replace(/^(\.\.[\/\\])+/, '');
    const filePath = path.join(process.cwd(), 'public/uploads', sanitizedPath);
    
    // Additional security check
    if (!filePath.startsWith(path.join(process.cwd(), 'public/uploads'))) {
      return new Response('Access denied', { status: 403 });
    }
    
    // Check if file exists
    try {
      const stats = await fs.stat(filePath);
      
      if (!stats.isFile()) {
        return new Response('Not a file', { status: 404 });
      }
      
      // Set appropriate content type
      const ext = path.extname(filePath).toLowerCase();
      const contentTypes = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml'
      };
      
      const contentType = contentTypes[ext] || 'application/octet-stream';
      
      // Read file
      const fileBuffer = await fs.readFile(filePath);
      
      // Return response with proper headers
      return new Response(fileBuffer, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Length': stats.size.toString(),
          'Cache-Control': 'public, max-age=31536000', // 1 year cache
          'Last-Modified': stats.mtime.toUTCString(),
          'ETag': `"${stats.mtime.getTime()}-${stats.size}"`, // Simple ETag
        },
      });
      
    } catch (statError) {
      if (statError.code === 'ENOENT') {
        return new Response('File not found', { status: 404 });
      }
      throw statError;
    }
    
  } catch (error) {
    console.error('Error serving file:', error);
    
    // Don't expose internal paths in production
    const message = process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : `Error: ${error.message}`;
      
    return new Response(message, { status: 500 });
  }
}