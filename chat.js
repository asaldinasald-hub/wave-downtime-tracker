// Chat client-side logic
let socket;
let currentUser = null;
let isAdmin = false;
let messageCooldown = false;

// Connect to chat server
function initializeChat() {
    // Automatic server detection
    let serverUrl;
    
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        // Local development
        serverUrl = 'http://localhost:3000';
    } else {
        // Production - update this URL after deploying to Render
        serverUrl = 'https://wave-chat-server.onrender.com'; // Update this after deployment!
    }
    
    console.log('Connecting to chat server:', serverUrl);
    
    socket = io(serverUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
    });
    
    setupSocketListeners();
    loadSavedNickname();
}

function setupSocketListeners() {
    socket.on('connect', () => {
        console.log('Connected to chat server');
        if (currentUser) {
            socket.emit('rejoin', currentUser);
        }
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected from chat server');
    });
    
    socket.on('userJoined', (data) => {
        showSystemMessage(`${data.nickname} joined the chat`);
        updateOnlineCount(data.onlineCount);
    });
    
    socket.on('userLeft', (data) => {
        showSystemMessage(`${data.nickname} left the chat`);
        updateOnlineCount(data.onlineCount);
    });
    
    socket.on('message', (data) => {
        displayMessage(data);
    });
    
    socket.on('messageHistory', (messages) => {
        const chatMessages = document.getElementById('chatMessages');
        chatMessages.innerHTML = '';
        messages.forEach(msg => displayMessage(msg));
        scrollToBottom();
    });
    
    socket.on('onlineCount', (count) => {
        updateOnlineCount(count);
    });
    
    socket.on('error', (error) => {
        showError(error.message);
    });
    
    socket.on('nicknameAccepted', (data) => {
        currentUser = data.user;
        isAdmin = data.isAdmin;
        saveNickname(data.user.nickname, data.user.id, data.user.avatarHue);
        document.getElementById('welcomeNickname').textContent = data.user.nickname;
        showChatInterface();
        if (isAdmin) {
            showSystemMessage('You are now the chat administrator! You can ban users.', 'admin');
        }
    });
    
    socket.on('banned', () => {
        showError('You have been banned from the chat');
        clearNickname();
        showNicknameSetup();
    });
    
    socket.on('messageDeleted', (messageId) => {
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement) {
            messageElement.remove();
        }
    });
}

function loadSavedNickname() {
    const savedNickname = localStorage.getItem('chatNickname');
    const savedUserId = localStorage.getItem('chatUserId');
    const savedAvatarHue = localStorage.getItem('chatAvatarHue');
    
    if (savedNickname && savedUserId && savedAvatarHue) {
        // Сразу скрываем форму ввода никнейма
        document.getElementById('nicknameSetup').classList.add('hidden');
        document.getElementById('chatWelcome').classList.remove('hidden');
        document.getElementById('welcomeNickname').textContent = savedNickname;
        
        // Автоматически входим с сохраненными данными
        socket.emit('rejoin', {
            id: savedUserId,
            nickname: savedNickname,
            avatarHue: parseInt(savedAvatarHue)
        });
    }
}

function saveNickname(nickname, userId, avatarHue) {
    localStorage.setItem('chatNickname', nickname);
    localStorage.setItem('chatUserId', userId);
    localStorage.setItem('chatAvatarHue', avatarHue.toString());
}

function clearNickname() {
    localStorage.removeItem('chatNickname');
    localStorage.removeItem('chatUserId');
    localStorage.removeItem('chatAvatarHue');
    currentUser = null;
    isAdmin = false;
    document.getElementById('welcomeNickname').textContent = '';
}

// Nickname validation
function validateNickname(nickname) {
    const englishOnly = /^[a-zA-Z0-9_]+$/;
    
    if (!nickname || nickname.trim().length < 3) {
        return 'Nickname must be at least 3 characters';
    }
    
    if (nickname.length > 20) {
        return 'Nickname must be at most 20 characters';
    }
    
    if (!englishOnly.test(nickname)) {
        return 'Nickname must contain only English letters, numbers, and underscores';
    }
    
    return null;
}

// UI Functions
function showNicknameSetup() {
    document.getElementById('nicknameSetup').classList.remove('hidden');
    document.getElementById('chatWelcome').classList.add('hidden');
    document.getElementById('chatContainer').classList.add('hidden');
}

function showChatInterface() {
    document.getElementById('nicknameSetup').classList.add('hidden');
    document.getElementById('chatWelcome').classList.remove('hidden');
    document.getElementById('chatContainer').classList.remove('hidden');
}

function showError(message) {
    const errorElement = document.getElementById('nicknameError');
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    setTimeout(() => {
        errorElement.style.display = 'none';
    }, 3000);
}

function updateOnlineCount(count) {
    document.getElementById('onlineCount').textContent = count;
}

function displayMessage(data) {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message';
    messageDiv.setAttribute('data-message-id', data.id);
    
    if (data.type === 'system') {
        messageDiv.classList.add('system-message');
        messageDiv.innerHTML = `<span class="system-text">${escapeHtml(data.message)}</span>`;
        
        // Удаляем системное сообщение через 3 секунды
        setTimeout(() => {
            if (messageDiv && messageDiv.parentNode) {
                messageDiv.style.transition = 'opacity 0.3s ease-out';
                messageDiv.style.opacity = '0';
                setTimeout(() => {
                    if (messageDiv.parentNode) {
                        messageDiv.remove();
                    }
                }, 300);
            }
        }, 3000);
    } else {
        const isOwnMessage = currentUser && data.userId === currentUser.id;
        if (isOwnMessage) {
            messageDiv.classList.add('own-message');
        }
        
        const avatarStyle = `filter: hue-rotate(${data.avatarHue}deg) saturate(1.5);`;
        
        messageDiv.innerHTML = `
            <img src="userschaticons.png" class="chat-avatar" style="${avatarStyle}" alt="${escapeHtml(data.nickname)}">
            <div class="message-content">
                <div class="message-header">
                    <span class="message-nickname">${escapeHtml(data.nickname)}</span>
                    <span class="message-time">${formatTime(data.timestamp)}</span>
                    ${isAdmin && !isOwnMessage ? `<button class="ban-button" onclick="banUser('${data.userId}', '${escapeHtml(data.nickname)}')">Ban</button>` : ''}
                </div>
                <div class="message-text">${escapeHtml(data.message)}</div>
            </div>
        `;
    }
    
    chatMessages.appendChild(messageDiv);
    scrollToBottom();
}

function showSystemMessage(message, type = 'info') {
    displayMessage({
        id: Date.now(),
        type: 'system',
        message: message,
        timestamp: Date.now()
    });
}

function scrollToBottom() {
    const chatMessages = document.getElementById('chatMessages');
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

// Event Handlers
document.getElementById('setNicknameBtn').addEventListener('click', () => {
    const nickname = document.getElementById('nicknameInput').value.trim();
    const error = validateNickname(nickname);
    
    if (error) {
        showError(error);
        return;
    }
    
    socket.emit('setNickname', nickname);
});

document.getElementById('nicknameInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('setNicknameBtn').click();
    }
});

document.getElementById('sendMessageBtn').addEventListener('click', sendMessage);

document.getElementById('messageInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !messageCooldown) {
        sendMessage();
    }
});

function sendMessage() {
    if (messageCooldown) {
        return;
    }
    
    const messageInput = document.getElementById('messageInput');
    const message = messageInput.value.trim();
    
    if (!message || message.length > 100) {
        return;
    }
    
    socket.emit('message', message);
    messageInput.value = '';
    
    // Start cooldown
    startCooldown();
}

function startCooldown() {
    messageCooldown = true;
    const cooldownElement = document.getElementById('messageCooldown');
    const sendButton = document.getElementById('sendMessageBtn');
    const messageInput = document.getElementById('messageInput');
    
    sendButton.disabled = true;
    messageInput.disabled = true;
    
    let timeLeft = 5;
    cooldownElement.textContent = `Wait ${timeLeft}s`;
    cooldownElement.style.display = 'block';
    
    const interval = setInterval(() => {
        timeLeft--;
        if (timeLeft > 0) {
            cooldownElement.textContent = `Wait ${timeLeft}s`;
        } else {
            clearInterval(interval);
            cooldownElement.style.display = 'none';
            messageCooldown = false;
            sendButton.disabled = false;
            messageInput.disabled = false;
        }
    }, 1000);
}

function banUser(userId, nickname) {
    if (!isAdmin) return;
    
    if (confirm(`Ban ${nickname} permanently? This will delete all their messages.`)) {
        socket.emit('banUser', userId);
    }
}

// Initialize chat when page loads
document.addEventListener('DOMContentLoaded', () => {
    initializeChat();
    
    // Уведомляем сервер что мы на сайте (для подсчета онлайн)
    window.addEventListener('beforeunload', () => {
        if (socket && socket.connected) {
            socket.disconnect();
        }
    });
});
