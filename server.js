const app = require('./app');
const os = require('os');

const PORT = process.env.PORT || 3000;

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

const server = app.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log(`🎬 Movie Watchlist running at:`);
  console.log(`   本机访问: http://localhost:${PORT}`);
  console.log(`   手机访问: http://${ip}:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down gracefully…');
  server.close(() => process.exit(0));
});

module.exports = server;
