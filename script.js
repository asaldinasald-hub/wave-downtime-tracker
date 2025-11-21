// Configuration
const API_URL = '/api/wave'; // Используем локальный прокси
const ROBLOX_API_URL = '/api/roblox'; // Roblox versions API
const REFRESH_INTERVAL = 30000; // 30 seconds
const STORAGE_KEY = 'waveDowntimeData';

// State
let currentState = {
    isDown: false,
    version: null,
    downSince: null,
    apiDownSince: null,
    lastDowntimeDuration: 0,
    longestDowntime: 0
};

// Load saved data from localStorage
function loadSavedData() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const data = JSON.parse(saved);
            if (data.lastDowntimeDuration) {
                currentState.lastDowntimeDuration = data.lastDowntimeDuration;
            }
            if (data.longestDowntime) {
                currentState.longestDowntime = data.longestDowntime;
            }
            updateStatsDisplay();
        }
    } catch (e) {
        console.error('Error loading saved data:', e);
    }
}

// Save data to localStorage
function saveData() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            lastDowntimeDuration: currentState.lastDowntimeDuration,
            longestDowntime: currentState.longestDowntime
        }));
    } catch (e) {
        console.error('Error saving data:', e);
    }
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
    
    if (!data) {
        statusTextElement.textContent = 'Unable to fetch status';
        versionElement.textContent = 'Error';
        return;
    }
    
    console.log('Wave data:', data);
    
    // Update version
    versionElement.textContent = data.version || 'Unknown';
    
    // Check if Wave is down (updateStatus: false means it's down)
    const isCurrentlyDown = data.updateStatus === false;
    
    console.log('Update Status:', data.updateStatus, 'Is Down:', isCurrentlyDown);
    
    // Получаем время обновления Roblox для Windows
    const robloxData = await fetchRobloxVersion();
    if (robloxData && robloxData.WindowsDate) {
        const robloxTimestamp = parseApiDate(robloxData.WindowsDate);
        if (robloxTimestamp) {
            currentState.apiDownSince = robloxTimestamp;
            console.log('Roblox Windows updated at:', robloxData.WindowsDate);
        }
    }
    
    // Handle state changes
    if (isCurrentlyDown && !currentState.isDown) {
        // Wave just went down
        currentState.isDown = true;
        currentState.downSince = Date.now();
        currentState.version = data.version;
    } else if (!isCurrentlyDown && currentState.isDown) {
        // Wave just came back up
        const downDuration = currentState.apiDownSince ? Date.now() - currentState.apiDownSince : 0;
        currentState.lastDowntimeDuration = downDuration;
        
        // Update record if this was longer
        if (downDuration > currentState.longestDowntime) {
            currentState.longestDowntime = downDuration;
        }
        
        currentState.isDown = false;
        currentState.downSince = null;
        currentState.apiDownSince = null;
        
        saveData();
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
    loadSavedData();
    
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
}

// Start the application
init();
