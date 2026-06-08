require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { initCache } = require('./cache');
const { startSync, getSyncStatus } = require('./sync');
const routes = require('./routes');

const PORT = process.env.PORT || 3001;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use('/api', routes);

// Make io available to route handlers
app.set('io', io);

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
});

initCache();
startSync(io);

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
