// Health check endpoint for Railway
const http = require('http');

const PORT = process.env.PORT || 3001;

const healthCheck = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    }));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

healthCheck.listen(PORT + 1, () => {
  console.log(`Health check server running on port ${PORT + 1}`);
});

module.exports = healthCheck;
