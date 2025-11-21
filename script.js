// Configuration
const API_URL = '/api/wave'; // Используем локальный прокси
const ROBLOX_API_URL = '/api/roblox'; // Roblox versions API
const CACHE_API_URL = 'https://wave-chat-server.onrender.com/api/wave-cache'; // MongoDB cache
const REFRESH_INTERVAL = 30000; // 30 seconds
const STORAGE_KEY = 'waveDowntimeData';

// State
let currentState = {
    isDown: false,
    version: null,
    lastKnownVersion: null,
    downSince: null,
    apiDownSince: null,
    lastDowntimeDuration: 0,
    longestDowntime: 0,
    apiAvailable: true
};

// Load saved data from localStorage and MongoDB
async function loadSavedData() {
    try {
        // Сначала пытаемся загрузить из MongoDB
        const dbCache = await loadCacheFromDB();
        
        if (dbCache) {
            // Используем данные из MongoDB
            if (dbCache.lastDowntimeDuration) {
                currentState.lastDowntimeDuration = dbCache.lastDowntimeDuration;
            }
            if (dbCache.longestDowntime) {
                currentState.longestDowntime = dbCache.longestDowntime;
            }
            if (dbCache.lastKnownVersion) {
                currentState.lastKnownVersion = dbCache.lastKnownVersion;
            }
            if (dbCache.isDown !== undefined) {
                currentState.isDown = dbCache.isDown;
            }
            if (dbCache.apiDownSince) {
                currentState.apiDownSince = dbCache.apiDownSince;
            }
            console.log('✅ Loaded data from MongoDB cache');
        } else {
            // Fallback на localStorage
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const data = JSON.parse(saved);
                if (data.lastDowntimeDuration) {
                    currentState.lastDowntimeDuration = data.lastDowntimeDuration;
                }
                if (data.longestDowntime) {
                    currentState.longestDowntime = data.longestDowntime;
                }
                if (data.lastKnownVersion) {
                    currentState.lastKnownVersion = data.lastKnownVersion;
                }
                if (data.isDown !== undefined) {
                    currentState.isDown = data.isDown;
                }
                if (data.apiDownSince) {
                    currentState.apiDownSince = data.apiDownSince;
                }
                console.log('✅ Loaded data from localStorage');
            }
        }
        
        updateStatsDisplay();
    } catch (e) {
        console.error('Error loading saved data:', e);
    }
}

// Save data to localStorage and MongoDB
async function saveData() {
    try {
        const dataToSave = {
            lastDowntimeDuration: currentState.lastDowntimeDuration,
            longestDowntime: currentState.longestDowntime,
            lastKnownVersion: currentState.lastKnownVersion,
            isDown: currentState.isDown,
            apiDownSince: currentState.apiDownSince
        };
        
        // Сохраняем в localStorage
        localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
        
        // Сохраняем в MongoDB через API
        try {
            await fetch(CACHE_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dataToSave)
            });
            console.log('📦 Cache saved to MongoDB');
        } catch (error) {
            console.warn('Failed to save cache to MongoDB:', error);
        }
    } catch (e) {
        console.error('Error saving data:', e);
    }
}

// Load cache from MongoDB
async function loadCacheFromDB() {
    try {
        const response = await fetch(CACHE_API_URL);
        if (response.ok) {
            const cache = await response.json();
            console.log('📥 Loaded cache from MongoDB:', cache);
            return cache;
        }
    } catch (error) {
        console.warn('Failed to load cache from MongoDB:', error);
    }
    return null;
}

// Fetch Roblox version info
async function fetchRobloxVersion() {
    try {
        const response = await fetch(ROBLOX_API_URL);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching Roblox version:', error);
        return null;
    }
}

// Fetch Wave status from API
async function fetchWaveStatus() {
    try {
        const response = await fetch(API_URL);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching Wave status:', error);
        return null;
    }
}

// Parse API date to timestamp
function parseApiDate(dateString) {
    // Format: "11/19/2025, 9:06:21 PM UTC"
    try {
        const cleanDate = dateString.replace(' UTC', '').replace(',', '');
        return new Date(cleanDate + ' UTC').getTime();
    } catch (e) {
        console.error('Error parsing date:', e);
        return null;
    }
}

// Format time duration
function formatDuration(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
        return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
        return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    } else {
        return `${seconds}s`;
    }
}

// Format time for timer display
function formatTimer(milliseconds) {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Update timer display
function updateTimer() {
    const timerElement = document.getElementById('timer');
    
    if (currentState.isDown && currentState.apiDownSince) {
        const elapsed = Date.now() - currentState.apiDownSince;
        timerElement.textContent = formatTimer(elapsed);
        
        // Обновляем longest если текущий downtime больше
        if (elapsed > currentState.longestDowntime) {
            currentState.longestDowntime = elapsed;
        }
        
        // Обновляем статистику (включая Last Downtime если нет истории)
        updateStatsDisplay();
    }
}

// Update stats display
function updateStatsDisplay() {
    const lastDowntimeElement = document.getElementById('lastDowntime');
    const recordElement = document.getElementById('record');
    
    // Если есть сохранённый последний downtime - показываем его
    if (currentState.lastDowntimeDuration > 0) {
        lastDowntimeElement.textContent = formatDuration(currentState.lastDowntimeDuration);
    } 
    // Если нет истории, но Wave сейчас DOWN - копируем текущий таймер
    else if (currentState.isDown && currentState.apiDownSince) {
        const currentDowntime = Date.now() - currentState.apiDownSince;
        lastDowntimeElement.textContent = formatDuration(currentDowntime);
    } 
    else {
        lastDowntimeElement.textContent = 'No data yet';
    }
    
    if (currentState.longestDowntime > 0) {
        recordElement.textContent = formatDuration(currentState.longestDowntime);
    } else {
        recordElement.textContent = 'No data yet';
    }
}

// Update UI
async function updateUI(data) {
    const versionElement = document.getElementById('version');
    const statusTextElement = document.getElementById('statusText');
    const statusIndicatorElement = document.getElementById('statusIndicator');
    const timerSectionElement = document.getElementById('timerSection');
    const timerLabelElement = document.getElementById('timerLabel');
    
    const apiStatusSection = document.getElementById('apiStatusSection');
    const apiStatusMessage = document.getElementById('apiStatusMessage');
    
    if (!data) {
        // API недоступно - используем кешированные данные из MongoDB
        currentState.apiAvailable = false;
        
        // Показываем ошибку API в отдельной секции
        apiStatusSection.classList.remove('hidden');
        apiStatusMessage.textContent = '⚠️ WEAO API is currently unavailable - Using cached data from database';
        apiStatusMessage.className = 'api-status-message error';
        
        // Показываем закешированное состояние
        if (currentState.lastKnownVersion) {
            versionElement.textContent = currentState.lastKnownVersion;
        } else {
            versionElement.textContent = 'Unknown';
        }
        
        // Обновляем UI согласно закешированному состоянию
        if (currentState.isDown) {
            statusTextElement.textContent = 'WAVE IS DOWN!';
            statusTextElement.className = 'status-text status-down';
            timerSectionElement.classList.remove('hidden');
            timerLabelElement.textContent = 'Down for';
            
            // Продолжаем показывать таймер
            if (currentState.apiDownSince) {
                updateTimer();
            }
        } else {
            statusTextElement.textContent = 'WAVE IS UP!';
            statusTextElement.className = 'status-text status-up';
            
            if (currentState.lastDowntimeDuration > 0) {
                timerSectionElement.classList.remove('hidden');
                document.getElementById('timer').textContent = formatDuration(currentState.lastDowntimeDuration);
                timerLabelElement.textContent = 'Last downtime duration';
            } else {
                timerSectionElement.classList.add('hidden');
            }
        }
        
        updateStatsDisplay();
        return;
    }
    
    // API снова доступен
    if (!currentState.apiAvailable) {
        console.log('API reconnected! Syncing data...');
        // Показываем успешное подключение на 3 секунды
        apiStatusSection.classList.remove('hidden');
        apiStatusMessage.textContent = '✅ API reconnected successfully';
        apiStatusMessage.className = 'api-status-message success';
        setTimeout(() => {
            apiStatusSection.classList.add('hidden');
        }, 3000);
    } else {
        // API работает нормально - скрываем статус
        apiStatusSection.classList.add('hidden');
    }
    currentState.apiAvailable = true;
    console.log('Wave data:', data);
    
    // Сохраняем текущую версию как последнюю известную
    if (data.version) {
        const wasUpdated = currentState.lastKnownVersion && currentState.lastKnownVersion !== data.version;
        currentState.lastKnownVersion = data.version;
        versionElement.textContent = data.version;
        
        // Если версия изменилась (обновилась)
        if (wasUpdated && currentState.isDown) {
            // Wave обновился! Сохраняем результаты
            const finalDowntime = currentState.apiDownSince ? Date.now() - currentState.apiDownSince : 0;
            
            // Сохраняем как последний downtime
            currentState.lastDowntimeDuration = finalDowntime;
            
            // Обновляем рекорд если текущий downtime больше
            if (finalDowntime > currentState.longestDowntime) {
                currentState.longestDowntime = finalDowntime;
            }
            
            console.log('Version updated! Saved downtime:', formatDuration(finalDowntime));
            await saveData(); // Сохраняем в localStorage и MongoDB
        }
    } else {
        versionElement.textContent = currentState.lastKnownVersion || 'Unknown';
    }
    
    // Check if Wave is down (updateStatus: false means it's down)
    const isCurrentlyDown = data.updateStatus === false;
    
    console.log('Update Status:', data.updateStatus, 'Is Down:', isCurrentlyDown);
    
    // Получаем время обновления Roblox для Windows (только если API доступен)
    const robloxData = await fetchRobloxVersion();
    if (robloxData && robloxData.WindowsDate) {
        const robloxTimestamp = parseApiDate(robloxData.WindowsDate);
        if (robloxTimestamp) {
            // Обновляем apiDownSince только если оно ещё не установлено или изменилось
            if (!currentState.apiDownSince || currentState.apiDownSince !== robloxTimestamp) {
                currentState.apiDownSince = robloxTimestamp;
                console.log('Roblox Windows updated at:', robloxData.WindowsDate);
            }
        }
    } else if (!currentState.apiDownSince && currentState.isDown) {
        // Если нет данных Roblox но Wave DOWN, используем текущее время как fallback
        console.log('Roblox API unavailable, using current time as fallback');
    }
    
    // Handle state changes
    if (isCurrentlyDown && !currentState.isDown) {
        // Wave just went down
        currentState.isDown = true;
        currentState.downSince = Date.now();
        currentState.version = data.version;
    } else if (!isCurrentlyDown && currentState.isDown) {
        // Wave came back up (но результаты уже сохранены при смене версии)
        currentState.isDown = false;
        currentState.downSince = null;
        currentState.apiDownSince = null;
        await saveData(); // Сохраняем новое состояние
        updateStatsDisplay();
    }
    
    // Update UI based on status
    if (isCurrentlyDown) {
        statusTextElement.textContent = 'WAVE IS DOWN!';
        statusTextElement.className = 'status-text status-down';
        timerSectionElement.classList.remove('hidden');
        timerLabelElement.textContent = 'Down for';
        updateTimer();
    } else {
        statusTextElement.textContent = 'WAVE IS UP!';
        statusTextElement.className = 'status-text status-up';
        
        if (currentState.lastDowntimeDuration > 0) {
            timerSectionElement.classList.remove('hidden');
            document.getElementById('timer').textContent = formatDuration(currentState.lastDowntimeDuration);
            timerLabelElement.textContent = 'Last downtime duration';
        } else {
            timerSectionElement.classList.add('hidden');
        }
    }
}

// Initialize and start monitoring
async function init() {
    await loadSavedData();
    
    // Initial fetch
    const data = await fetchWaveStatus();
    await updateUI(data);
    
    // Set up refresh interval
    setInterval(async () => {
        const data = await fetchWaveStatus();
        await updateUI(data);
    }, REFRESH_INTERVAL);
    
    // Update timer every second when down
    setInterval(() => {
        if (currentState.isDown) {
            updateTimer();
        }
    }, 1000);
    
    // Периодически сохраняем состояние в кеш (каждые 2 минуты)
    setInterval(async () => {
        await saveData();
    }, 2 * 60 * 1000);
}

// Start the application
init();
