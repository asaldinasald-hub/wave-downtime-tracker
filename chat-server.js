const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());

// In-memory storage (for production, use a database like MongoDB or PostgreSQL)
const users = new Map(); // userId -> { id, nickname, socketId, avatarHue, joinedAt, isAdmin }
const messages = []; // Array of messages
const bannedUsers = new Set(); // Set of banned userIds
let adminId = null; // First user with nickname 'mefisto' becomes admin
const MESSAGE_RETENTION_TIME = 24 * 60 * 60 * 1000; // 24 hours

// Clean old messages periodically
setInterval(() => {
    const now = Date.now();
    const cutoff = now - MESSAGE_RETENTION_TIME;
    
    let removedCount = 0;
    while (messages.length > 0 && messages[0].timestamp < cutoff) {
        messages.shift();
        removedCount++;
    }
    
    if (removedCount > 0) {
        console.log(`Cleaned ${removedCount} old messages`);
    }
}, 60000); // Check every minute

// Generate random hue for avatar
function generateAvatarHue() {
    return Math.floor(Math.random() * 360);
}

// Check if nickname is available
function isNicknameAvailable(nickname, excludeUserId = null) {
    for (const [userId, user] of users) {
        if (userId !== excludeUserId && user.nickname.toLowerCase() === nickname.toLowerCase()) {
            return false;
        }
    }
    return true;
}

io.on('connection', (socket) => {
    console.log('New connection:', socket.id);
    
    // Send current online count
    socket.emit('onlineCount', users.size);
    
    socket.on('setNickname', (nickname) => {
        // Validate nickname
        const englishOnly = /^[a-zA-Z0-9_]+$/;
        
        if (!nickname || nickname.trim().length < 3 || nickname.length > 20) {
            socket.emit('error', { message: 'Nickname must be 3-20 characters' });
            return;
        }
        
        if (!englishOnly.test(nickname)) {
            socket.emit('error', { message: 'Nickname must contain only English letters, numbers, and underscores' });
            return;
        }
        
        if (!isNicknameAvailable(nickname)) {
            socket.emit('error', { message: 'Nickname already taken' });
            return;
        }
        
        // Create user
        const userId = uuidv4();
        const isAdmin = !adminId && nickname.toLowerCase() === 'mefisto';
        
        if (isAdmin) {
            adminId = userId;
            console.log('Admin user created:', nickname);
        }
        
        const user = {
            id: userId,
            nickname: nickname,
            socketId: socket.id,
            avatarHue: generateAvatarHue(),
            joinedAt: Date.now(),
            isAdmin: isAdmin
        };
        
        users.set(userId, user);
        socket.userId = userId;
        
        // Send acceptance and user data
        socket.emit('nicknameAccepted', {
            user: {
                id: user.id,
                nickname: user.nickname,
                avatarHue: user.avatarHue,
                isAdmin: user.isAdmin
            },
            isAdmin: isAdmin
        });
        
        // Send message history (last 24 hours)
        const recentMessages = messages.filter(msg => 
            msg.timestamp > Date.now() - MESSAGE_RETENTION_TIME
        );
        socket.emit('messageHistory', recentMessages);
        
        // Broadcast user joined
        io.emit('userJoined', {
            nickname: user.nickname,
            onlineCount: users.size
        });
        
        console.log(`User joined: ${nickname} (${userId}), total online: ${users.size}`);
    });
    
    socket.on('rejoin', (userData) => {
        // Handle reconnection with existing nickname
        if (userData && userData.id && users.has(userData.id)) {
            const user = users.get(userData.id);
            user.socketId = socket.id;
            socket.userId = user.id;
            
            socket.emit('nicknameAccepted', {
                user: {
                    id: user.id,
                    nickname: user.nickname,
                    avatarHue: user.avatarHue,
                    isAdmin: user.isAdmin
                },
                isAdmin: user.isAdmin
            });
            
            const recentMessages = messages.filter(msg => 
                msg.timestamp > Date.now() - MESSAGE_RETENTION_TIME
            );
            socket.emit('messageHistory', recentMessages);
        }
    });
    
    socket.on('message', (messageText) => {
        if (!socket.userId || !users.has(socket.userId)) {
            socket.emit('error', { message: 'You must set a nickname first' });
            return;
        }
        
        if (bannedUsers.has(socket.userId)) {
            socket.emit('banned');
            return;
        }
        
        const user = users.get(socket.userId);
        
        if (!messageText || messageText.trim().length === 0 || messageText.length > 100) {
            socket.emit('error', { message: 'Message must be 1-100 characters' });
            return;
        }
        
        const message = {
            id: uuidv4(),
            userId: user.id,
            nickname: user.nickname,
            avatarHue: user.avatarHue,
            message: messageText.trim(),
            timestamp: Date.now()
        };
        
        messages.push(message);
        
        // Broadcast message to all users
        io.emit('message', message);
        
        console.log(`Message from ${user.nickname}: ${messageText}`);
    });
    
    socket.on('banUser', (targetUserId) => {
        // Check if requester is admin
        if (!socket.userId || socket.userId !== adminId) {
            socket.emit('error', { message: 'Only admin can ban users' });
            return;
        }
        
        if (!users.has(targetUserId)) {
            socket.emit('error', { message: 'User not found' });
            return;
        }
        
        const targetUser = users.get(targetUserId);
        
        // Can't ban self
        if (targetUserId === adminId) {
            socket.emit('error', { message: 'Cannot ban admin' });
            return;
        }
        
        // Ban user
        bannedUsers.add(targetUserId);
        
        // Remove all their messages
        const messagesToRemove = [];
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].userId === targetUserId) {
                messagesToRemove.push(messages[i].id);
                messages.splice(i, 1);
            }
        }
        
        // Notify all clients to remove messages
        messagesToRemove.forEach(messageId => {
            io.emit('messageDeleted', messageId);
        });
        
        // Disconnect banned user
        const targetSocket = io.sockets.sockets.get(targetUser.socketId);
        if (targetSocket) {
            targetSocket.emit('banned');
            targetSocket.disconnect(true);
        }
        
        // Remove from users
        users.delete(targetUserId);
        
        io.emit('userLeft', {
            nickname: targetUser.nickname,
            onlineCount: users.size
        });
        
        console.log(`User banned: ${targetUser.nickname} by admin`);
    });
    
    socket.on('disconnect', () => {
        if (socket.userId && users.has(socket.userId)) {
            const user = users.get(socket.userId);
            users.delete(socket.userId);
            
            io.emit('userLeft', {
                nickname: user.nickname,
                onlineCount: users.size
            });
            
            console.log(`User left: ${user.nickname}, total online: ${users.size}`);
        }
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        onlineUsers: users.size,
        totalMessages: messages.length,
        adminExists: !!adminId
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Chat server running on port ${PORT}`);
    console.log(`Admin will be the first user with nickname 'mefisto'`);
});
