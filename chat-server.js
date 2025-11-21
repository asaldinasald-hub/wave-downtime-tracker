const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

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

// Путь к файлу для сохранения данных
const DATA_FILE = path.join(__dirname, 'chat-data.json');

// In-memory storage (for production, use a database like MongoDB or PostgreSQL)
const users = new Map(); // userId -> { id, nickname, socketId, avatarHue, joinedAt, isAdmin, ip }
const registeredUsers = new Map(); // Permanent storage: userId -> { id, nickname, avatarHue, isAdmin, ip }
const ipToUser = new Map(); // IP -> { nickname, avatarHue } - хранение никнейма и аватара по IP
const messages = []; // Array of messages
const bannedUsers = new Set(); // Set of banned userIds
const bannedNicknames = new Set(); // Set of permanently banned nicknames (lowercase)
const bannedIPs = new Set(); // Set of permanently banned IP addresses
const userLastMessages = new Map(); // userId -> последнее сообщение для проверки дубликатов
let adminId = null; // First user with nickname 'mefisto' becomes admin
const MESSAGE_RETENTION_TIME = 24 * 60 * 60 * 1000; // 24 hours

// Функция для получения IP адреса клиента
function getClientIP(socket) {
    // Проверяем заголовки для случаев когда используется прокси/CDN
    const forwarded = socket.handshake.headers['x-forwarded-for'];
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    
    const realIP = socket.handshake.headers['x-real-ip'];
    if (realIP) {
        return realIP;
    }
    
    // Fallback на прямой IP
    return socket.handshake.address;
}

// Функции для сохранения и загрузки данных
function saveData() {
    try {
        const data = {
            registeredUsers: Array.from(registeredUsers.entries()),
            ipToUser: Array.from(ipToUser.entries()),
            messages: messages.slice(-1000), // Сохраняем последние 1000 сообщений
            bannedUsers: Array.from(bannedUsers),
            bannedNicknames: Array.from(bannedNicknames),
            bannedIPs: Array.from(bannedIPs),
            adminId: adminId,
            timestamp: Date.now()
        };
        
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        console.log('Data saved to file');
    } catch (error) {
        console.error('Error saving data:', error);
    }
}

function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            
            // Восстанавливаем зарегистрированных пользователей
            data.registeredUsers.forEach(([userId, user]) => {
                registeredUsers.set(userId, user);
            });
            
            // Восстанавливаем IP -> User mapping
            data.ipToUser.forEach(([ip, userData]) => {
                ipToUser.set(ip, userData);
            });
            
            // Восстанавливаем сообщения (только за последние 24 часа)
            const now = Date.now();
            const cutoff = now - MESSAGE_RETENTION_TIME;
            data.messages.forEach(msg => {
                if (msg.timestamp > cutoff) {
                    messages.push(msg);
                }
            });
            
            // Восстанавливаем баны
            data.bannedUsers.forEach(userId => bannedUsers.add(userId));
            data.bannedNicknames.forEach(nickname => bannedNicknames.add(nickname));
            data.bannedIPs.forEach(ip => bannedIPs.add(ip));
            
            // Восстанавливаем админа
            if (data.adminId) {
                adminId = data.adminId;
            }
            
            console.log(`Data loaded: ${registeredUsers.size} users, ${messages.length} messages, ${bannedIPs.size} banned IPs`);
        } else {
            console.log('No saved data found, starting fresh');
        }
    } catch (error) {
        console.error('Error loading data:', error);
    }
}

// Загружаем данные при старте
loadData();

// Автосохранение каждые 5 минут
setInterval(() => {
    saveData();
}, 5 * 60 * 1000);

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
        saveData(); // Сохраняем после очистки
    }
}, 60000); // Check every minute

// Generate random hue for avatar
function generateAvatarHue() {
    return Math.floor(Math.random() * 360);
}

// Check if nickname is available
function isNicknameAvailable(nickname, excludeUserId = null) {
    const lowerNickname = nickname.toLowerCase();
    
    // Проверяем забаненные никнеймы
    if (bannedNicknames.has(lowerNickname)) {
        return false;
    }
    
    // Проверяем зарегистрированных пользователей (постоянное хранилище)
    for (const [userId, user] of registeredUsers) {
        if (userId !== excludeUserId && user.nickname.toLowerCase() === lowerNickname) {
            return false;
        }
    }
    
    return true;
}

// Отслеживание всех подключений к сайту
const allConnections = new Set(); // Все активные socket соединения

io.on('connection', (socket) => {
    const clientIP = getClientIP(socket);
    console.log('New connection:', socket.id, 'IP:', clientIP);
    
    // Проверяем не забанен ли IP
    if (bannedIPs.has(clientIP)) {
        console.log('Banned IP attempted to connect:', clientIP);
        socket.emit('banned');
        socket.disconnect(true);
        return;
    }
    
    // Добавляем в список всех подключенных
    allConnections.add(socket.id);
    
    // Send current online count (всех на сайте)
    io.emit('onlineCount', allConnections.size);
    
    // Отправляем сохраненные данные по IP, если они есть
    if (ipToUser.has(clientIP)) {
        const savedData = ipToUser.get(clientIP);
        socket.emit('savedIPData', savedData);
        console.log('Sent saved data for IP:', clientIP, savedData);
    }
    
    socket.on('setNickname', (nickname) => {
        // Повторная проверка IP при попытке установить никнейм
        if (bannedIPs.has(clientIP)) {
            socket.emit('banned');
            socket.disconnect(true);
            return;
        }
        
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
            isAdmin: isAdmin,
            ip: clientIP
        };
        
        users.set(userId, user);
        socket.userId = userId;
        
        // Сохраняем в постоянное хранилище
        registeredUsers.set(userId, {
            id: user.id,
            nickname: user.nickname,
            avatarHue: user.avatarHue,
            isAdmin: user.isAdmin,
            ip: clientIP
        });
        
        // Сохраняем никнейм и аватар по IP
        ipToUser.set(clientIP, {
            nickname: user.nickname,
            avatarHue: user.avatarHue
        });
        console.log('Saved IP data:', clientIP, '-> nickname:', user.nickname, 'hue:', user.avatarHue);
        
        // Сохраняем данные в файл
        saveData();
        
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
            onlineCount: allConnections.size
        });
        
        console.log(`User joined: ${nickname} (${userId}), total online: ${users.size}`);
    });
    
    socket.on('rejoin', (userData) => {
        // Проверяем не забанен ли IP
        if (bannedIPs.has(clientIP)) {
            socket.emit('banned');
            socket.disconnect(true);
            return;
        }
        
        // Handle reconnection with existing nickname
        if (userData && userData.id && registeredUsers.has(userData.id)) {
            const registeredUser = registeredUsers.get(userData.id);
            
            // Проверяем не забанен ли пользователь по ID
            if (bannedUsers.has(userData.id)) {
                socket.emit('banned');
                return;
            }
            
            // Создаем/обновляем активного пользователя
            const user = {
                id: registeredUser.id,
                nickname: registeredUser.nickname,
                socketId: socket.id,
                avatarHue: registeredUser.avatarHue,
                joinedAt: Date.now(),
                isAdmin: registeredUser.isAdmin,
                ip: clientIP
            };
            
            users.set(userData.id, user);
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
            
            // Отправляем историю сообщений
            const recentMessages = messages.filter(msg => 
                msg.timestamp > Date.now() - MESSAGE_RETENTION_TIME
            );
            socket.emit('messageHistory', recentMessages);
            
            // Уведомляем всех о входе
            io.emit('userJoined', {
                nickname: user.nickname,
                onlineCount: allConnections.size
            });
            
            console.log(`User rejoined: ${user.nickname} (${userData.id}), total online: ${users.size}`);
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
        
        const trimmedMessage = messageText.trim();
        
        // Автомодерация: проверка на ссылки (http://, https://, www., .com, .ru, etc)
        const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.(com|ru|net|org|io|gg|xyz|me|co|uk|us|tv|yt|cc|link|site|online|store|app|dev|tech)[^\s]*)/gi;
        if (urlRegex.test(trimmedMessage)) {
            socket.emit('error', { message: 'Links are not allowed in chat' });
            console.log(`Blocked link from ${user.nickname}: ${trimmedMessage}`);
            return;
        }
        
        // Автомодерация: проверка на упоминания @никнейм
        if (/@\w+/.test(trimmedMessage)) {
            socket.emit('error', { message: 'Mentions (@username) are not allowed' });
            console.log(`Blocked mention from ${user.nickname}: ${trimmedMessage}`);
            return;
        }
        
        // Автомодерация: проверка на дубликаты сообщений
        const lastMessage = userLastMessages.get(socket.userId);
        if (lastMessage === trimmedMessage) {
            socket.emit('error', { message: 'Cannot send duplicate messages' });
            console.log(`Blocked duplicate from ${user.nickname}: ${trimmedMessage}`);
            return;
        }
        
        // Сохраняем последнее сообщение пользователя
        userLastMessages.set(socket.userId, trimmedMessage);
        
        const message = {
            id: uuidv4(),
            userId: user.id,
            nickname: user.nickname,
            avatarHue: user.avatarHue,
            message: trimmedMessage,
            timestamp: Date.now()
        };
        
        messages.push(message);
        
        // Сохраняем данные после нового сообщения (каждые 10 сообщений)
        if (messages.length % 10 === 0) {
            saveData();
        }
        
        // Broadcast message to all users
        io.emit('message', message);
        
        console.log(`Message from ${user.nickname}: ${trimmedMessage}`);
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
        
        // Ban user permanently
        bannedUsers.add(targetUserId);
        bannedNicknames.add(targetUser.nickname.toLowerCase()); // Блокируем никнейм навсегда
        
        // Блокируем IP адрес навсегда (кроме IP админа mefisto)
        if (targetUser.ip) {
            // Находим IP админа
            let adminIP = null;
            if (adminId && registeredUsers.has(adminId)) {
                adminIP = registeredUsers.get(adminId).ip;
            }
            
            // Не баним IP админа
            if (targetUser.ip !== adminIP) {
                bannedIPs.add(targetUser.ip);
                ipToUser.delete(targetUser.ip); // Удаляем сохраненные данные
                console.log(`Banned IP: ${targetUser.ip} (user: ${targetUser.nickname})`);
            } else {
                console.log(`Skipped banning admin IP: ${targetUser.ip}`);
            }
        }
        
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
        
        // Remove from active users and registered users
        users.delete(targetUserId);
        registeredUsers.delete(targetUserId);
        
        // Сохраняем данные после бана
        saveData();
        
        io.emit('userLeft', {
            nickname: targetUser.nickname,
            onlineCount: users.size
        });
        
        console.log(`User banned: ${targetUser.nickname} by admin`);
    });
    
    socket.on('disconnect', () => {
        // Удаляем из общего списка подключений
        allConnections.delete(socket.id);
        
        // Обновляем счетчик для всех
        io.emit('onlineCount', allConnections.size);
        
        if (socket.userId && users.has(socket.userId)) {
            const user = users.get(socket.userId);
            users.delete(socket.userId);
            
            io.emit('userLeft', {
                nickname: user.nickname,
                onlineCount: allConnections.size
            });
            
            console.log(`User left: ${user.nickname}, total online: ${allConnections.size}`);
        } else {
            console.log(`Connection closed: ${socket.id}, total online: ${allConnections.size}`);
        }
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        onlineUsers: users.size,
        registeredUsers: registeredUsers.size,
        totalMessages: messages.length,
        adminExists: !!adminId,
        bannedUsers: bannedUsers.size,
        bannedIPs: bannedIPs.size
    });
});

// Get banned IPs list
app.get('/admin/banned-ips', (req, res) => {
    const bannedIPsList = Array.from(bannedIPs);
    res.json({
        count: bannedIPsList.length,
        ips: bannedIPsList
    });
});

// Clear all bans (requires admin key)
app.post('/admin/clear-bans', express.json(), (req, res) => {
    const { adminKey } = req.body;
    
    // Simple admin key check (можно улучшить)
    if (adminKey !== 'mefisto_admin_2025') {
        return res.status(403).json({ error: 'Invalid admin key' });
    }
    
    const stats = {
        bannedIPsCleared: bannedIPs.size,
        bannedUsersCleared: bannedUsers.size,
        bannedNicknamesCleared: bannedNicknames.size
    };
    
    // Очищаем все баны
    bannedIPs.clear();
    bannedUsers.clear();
    bannedNicknames.clear();
    
    console.log('All bans cleared by admin:', stats);
    
    res.json({
        success: true,
        message: 'All bans cleared',
        stats: stats
    });
});

// Remove specific IP ban
app.post('/admin/unban-ip', express.json(), (req, res) => {
    const { adminKey, ip } = req.body;
    
    if (adminKey !== 'mefisto_admin_2025') {
        return res.status(403).json({ error: 'Invalid admin key' });
    }
    
    if (!ip) {
        return res.status(400).json({ error: 'IP address required' });
    }
    
    if (bannedIPs.has(ip)) {
        bannedIPs.delete(ip);
        saveData(); // Сохраняем после разбана
        console.log('IP unbanned:', ip);
        res.json({ success: true, message: `IP ${ip} unbanned` });
    } else {
        res.status(404).json({ error: 'IP not found in ban list' });
    }
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Chat server running on port ${PORT}`);
    console.log(`Admin will be the first user with nickname 'mefisto'`);
    
    // Сохраняем данные при остановке сервера
    process.on('SIGINT', () => {
        console.log('Saving data before shutdown...');
        saveData();
        process.exit(0);
    });
    
    process.on('SIGTERM', () => {
        console.log('Saving data before shutdown...');
        saveData();
        process.exit(0);
    });
});
