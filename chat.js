// Chat client-side logic
let socket;
let currentUser = null;
let isAdmin = false;
let messageCooldown = false;
let browserFingerprint = null;

// System message queue
const systemMessageQueue = [];
let activeSystemMessages = 0;
const MAX_CONCURRENT_SYSTEM_MESSAGES = 3;
let isProcessingQueue = false;

// Generate browser fingerprint
async function generateFingerprint() {
    const components = [];
    
    // Screen resolution
    components.push(screen.width + 'x' + screen.height);
    components.push(screen.colorDepth);
    
    // Timezone
    components.push(new Date().getTimezoneOffset());
    
    // Language
    components.push(navigator.language);
    
    // Platform
    components.push(navigator.platform);
    
    // User agent
    components.push(navigator.userAgent);
    
    // Hardware concurrency (CPU cores)
    components.push(navigator.hardwareConcurrency || 'unknown');
    
    // Device memory (if available)
    components.push(navigator.deviceMemory || 'unknown');
    
    // Touch support
    components.push(navigator.maxTouchPoints || 0);
    
    // Canvas fingerprint
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillStyle = '#f60';
        ctx.fillRect(125, 1, 62, 20);
        ctx.fillStyle = '#069';
        ctx.fillText('Browser Fingerprint', 2, 15);
        components.push(canvas.toDataURL());
    } catch (e) {
        components.push('canvas-error');
    }
    
    // WebGL fingerprint
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (gl) {
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            if (debugInfo) {
                components.push(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL));
                components.push(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL));
            }
        }
    } catch (e) {
        components.push('webgl-error');
    }
    
    // Combine and hash
    const fingerprintString = components.join('|');
    const encoder = new TextEncoder();
    const data = encoder.encode(fingerprintString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return hashHex;
}

// Connect to chat server
async function initializeChat() {
    // Generate fingerprint first
    browserFingerprint = await generateFingerprint();
    console.log('Browser fingerprint generated:', browserFingerprint.substring(0, 16) + '...');
    
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
        
        // Send fingerprint to server
        if (browserFingerprint) {
            socket.emit('setFingerprint', browserFingerprint);
        }
        
        if (currentUser) {
            socket.emit('rejoin', currentUser);
        }
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected from chat server');
    });
    
    socket.on('userJoined', (data) => {
        showSystemMessage(`${data.nickname} joined the chat`, 'join');
        updateOnlineCount(data.onlineCount);
    });
    
    socket.on('userLeft', (data) => {
        if (data.banned) {
            showSystemMessage(`${data.nickname} banned from chat`, 'banned');
        } else {
            showSystemMessage(`${data.nickname} left the chat`, 'leave');
        }
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
        if (isAdmin && !data.isRejoin) {
            showSystemMessage('You are now the chat administrator! You can ban users.', 'admin');
        }
    });
    
    socket.on('savedIPData', (data) => {
        // Получены сохраненные данные по IP - используем их для автозаполнения
        console.log('Received saved IP data:', data);
        if (data && data.nickname && data.avatarHue !== undefined) {
            // Если есть сохраненные данные, сразу скрываем форму и показываем приветствие
            document.getElementById('nicknameInput').value = data.nickname;
            document.getElementById('nicknameSetup').classList.add('hidden');
            document.getElementById('chatWelcome').classList.remove('hidden');
            document.getElementById('welcomeNickname').textContent = data.nickname;
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
        // Немедленно и навсегда скрываем форму ввода никнейма
        const nicknameSetup = document.getElementById('nicknameSetup');
        nicknameSetup.style.display = 'none'; // Принудительное скрытие
        nicknameSetup.classList.add('hidden');
        
        const chatWelcome = document.getElementById('chatWelcome');
        chatWelcome.style.display = 'block'; // Принудительное показание
        chatWelcome.classList.remove('hidden');
        
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
    const nicknameSetup = document.getElementById('nicknameSetup');
    nicknameSetup.style.display = 'none !important'; // Принудительное скрытие навсегда
    nicknameSetup.classList.add('hidden');
    nicknameSetup.style.visibility = 'hidden';
    nicknameSetup.style.height = '0';
    nicknameSetup.style.overflow = 'hidden';
    
    const chatWelcome = document.getElementById('chatWelcome');
    chatWelcome.style.display = 'flex'; // Принудительное показание
    chatWelcome.style.visibility = 'visible';
    chatWelcome.classList.remove('hidden');
    
    document.getElementById('chatContainer').classList.remove('hidden');
}

function showError(message) {
    // Check if user is in chat (has nickname set)
    if (currentUser) {
        // Show error under chat input
        const chatErrorElement = document.getElementById('chatErrorMessage');
        chatErrorElement.textContent = message;
        chatErrorElement.classList.remove('hidden');
        setTimeout(() => {
            chatErrorElement.classList.add('hidden');
        }, 5000);
    } else {
        // Show error in nickname setup
        const errorElement = document.getElementById('nicknameError');
        errorElement.textContent = message;
        errorElement.style.display = 'block';
        setTimeout(() => {
            errorElement.style.display = 'none';
        }, 3000);
    }
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
        if (data.subType === 'join') {
            messageDiv.classList.add('system-join');
        } else if (data.subType === 'leave') {
            messageDiv.classList.add('system-leave');
        } else if (data.subType === 'banned') {
            messageDiv.classList.add('system-banned');
        }
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
        
        const isMefisto = data.nickname.toLowerCase() === 'mefisto';
        const avatarStyle = `filter: hue-rotate(${data.avatarHue}deg) saturate(1.5);`;
        
        // Для Mefisto используем видео аватар
        const avatarHTML = isMefisto 
            ? `<video src="mefistoavatar.mp4" class="chat-avatar-video" autoplay loop muted playsinline></video>`
            : `<img src="userschaticons.png" class="chat-avatar" style="${avatarStyle}" alt="${escapeHtml(data.nickname)}">`;
        
        messageDiv.innerHTML = `
            ${avatarHTML}
            <div class="message-content">
                <div class="message-header">
                    <span class="message-nickname">${escapeHtml(data.nickname)}${isMefisto ? '<span class="admin-crown">👑</span>' : ''}</span>
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
    const systemMsg = {
        id: Date.now() + Math.random(), // Уникальный ID
        type: 'system',
        subType: type,
        message: message,
        timestamp: Date.now()
    };
    
    // Добавляем в очередь
    systemMessageQueue.push(systemMsg);
    
    // Запускаем обработку очереди
    processSystemMessageQueue();
}

function processSystemMessageQueue() {
    // Если уже обрабатываем или достигли лимита - выходим
    if (isProcessingQueue || activeSystemMessages >= MAX_CONCURRENT_SYSTEM_MESSAGES) {
        return;
    }
    
    // Если очередь пуста - выходим
    if (systemMessageQueue.length === 0) {
        return;
    }
    
    isProcessingQueue = true;
    
    // Берем первое сообщение из очереди
    const message = systemMessageQueue.shift();
    
    // Увеличиваем счетчик активных сообщений
    activeSystemMessages++;
    
    // Отображаем сообщение
    displayMessage(message);
    
    // Через 3 секунды уменьшаем счетчик и обрабатываем следующее
    setTimeout(() => {
        activeSystemMessages--;
        isProcessingQueue = false;
        processSystemMessageQueue(); // Обрабатываем следующее сообщение
    }, 3100); // Чуть больше 3 секунд, чтобы сообщение успело исчезнуть
    
    isProcessingQueue = false;
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
    if (e.key === 'Enter' && (!messageCooldown || isAdmin)) {
        sendMessage();
    }
});

function sendMessage() {
    // Админ не имеет cooldown
    if (messageCooldown && !isAdmin) {
        return;
    }
    
    const messageInput = document.getElementById('messageInput');
    const message = messageInput.value.trim();
    
    if (!message || message.length > 100) {
        return;
    }
    
    socket.emit('message', message);
    messageInput.value = '';
    
    // Start cooldown только для обычных пользователей
    if (!isAdmin) {
        startCooldown();
    }
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
