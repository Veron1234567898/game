const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

// Global leaderboard (in-memory)
const leaderboard = []; // [{ username, score }]

const app = express();
const server = http.createServer(app);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

// Apply rate limiting to all requests
app.use(limiter);

// CORS configuration
const corsOptions = {
  origin: [
    'https://blockfly.netlify.app',
    'https://30a2892e-ba17-462a-9090-b690928b7e9f-00-3balcxel4t0v5.pike.replit.dev'
  ],
  methods: ['GET', 'POST'],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.static('public')); // Serve your Babylon game from /public

const io = socketIo(server, {
  cors: corsOptions
});

// Store connected users and messages
const connectedUsers = new Map();
const messages = [];

// Helper function to validate messages
const validateMessage = (message) => {
  if (!message || typeof message !== 'string') return false;
  if (message.length > 500) return false; // Max message length
  return true;
};

io.on('connection', (socket) => {
  console.log('A user connected');
  
  // Handle user joining
  socket.on('user_join', (username) => {
    if (!username || typeof username !== 'string' || username.length > 20) {
      socket.emit('error', 'Invalid username');
      return;
    }
    
    connectedUsers.set(socket.id, {
      id: socket.id,
      username: username,
      joinTime: Date.now()
    });
    
    io.emit('user_list', Array.from(connectedUsers.values()));
    io.emit('system_message', `${username} has joined the chat`);
  });

  // Handle score submission
  socket.on('submit_score', (score) => {
    const user = connectedUsers.get(socket.id);
    if (!user) return;
    // Add or update user's score
    const existing = leaderboard.find(entry => entry.username === user.username);
    if (existing) {
      if (score > existing.score) existing.score = score;
    } else {
      leaderboard.push({ username: user.username, score });
    }
    // Sort leaderboard
    leaderboard.sort((a, b) => b.score - a.score);
    // Broadcast updated leaderboard (top 10)
    io.emit('leaderboard', leaderboard.slice(0, 10));
  });

  // Send leaderboard to new connections
  socket.emit('leaderboard', leaderboard.slice(0, 10));

  // Handle chat messages
  socket.on('chat message', (msg) => {
    const user = connectedUsers.get(socket.id);
    if (!user) {
      socket.emit('error', 'You must join the chat first');
      return;
    }

    if (!validateMessage(msg)) {
      socket.emit('error', 'Invalid message');
      return;
    }

    const message = {
      id: Date.now(),
      userId: user.id,
      username: user.username,
      content: msg,
      timestamp: Date.now()
    };

    console.log('Received chat message from server:', msg);

    messages.push(message);
    if (messages.length > 100) messages.shift(); // Keep last 100 messages

    io.emit('chat message', message);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    const user = connectedUsers.get(socket.id);
    if (user) {
      connectedUsers.delete(socket.id);
      io.emit('user_list', Array.from(connectedUsers.values()));
      io.emit('system_message', `${user.username} has left the chat`);
    }
    console.log('A user disconnected');
  });

  // Send initial data to new connection
  socket.emit('initial_data', {
    users: Array.from(connectedUsers.values()),
    messages: messages.slice(-50) // Send last 50 messages
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});