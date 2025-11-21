# Управление банами

## Где хранятся забаненные IP

Забаненные IP адреса хранятся в **памяти сервера** в структуре `bannedIPs` (JavaScript Set).

**Важно:** При перезапуске сервера все баны будут сброшены!

Для постоянного хранения нужно использовать базу данных (MongoDB, PostgreSQL и т.д.).

---

## API Endpoints

### 1. Просмотр списка забаненных IP

**GET** `/admin/banned-ips`

```bash
curl https://wave-chat-server.onrender.com/admin/banned-ips
```

**Ответ:**
```json
{
  "count": 3,
  "ips": [
    "192.168.1.100",
    "10.0.0.5",
    "172.16.0.1"
  ]
}
```

---

### 2. Очистить ВСЕ баны

**POST** `/admin/clear-bans`

```bash
curl -X POST https://wave-chat-server.onrender.com/admin/clear-bans \
  -H "Content-Type: application/json" \
  -d '{"adminKey": "mefisto_admin_2025"}'
```

**PowerShell:**
```powershell
$body = @{adminKey = "mefisto_admin_2025"} | ConvertTo-Json
Invoke-RestMethod -Uri "https://wave-chat-server.onrender.com/admin/clear-bans" -Method Post -Body $body -ContentType "application/json"
```

**Ответ:**
```json
{
  "success": true,
  "message": "All bans cleared",
  "stats": {
    "bannedIPsCleared": 3,
    "bannedUsersCleared": 2,
    "bannedNicknamesCleared": 2
  }
}
```

---

### 3. Разбанить конкретный IP

**POST** `/admin/unban-ip`

```bash
curl -X POST https://wave-chat-server.onrender.com/admin/unban-ip \
  -H "Content-Type: application/json" \
  -d '{"adminKey": "mefisto_admin_2025", "ip": "192.168.1.100"}'
```

**PowerShell:**
```powershell
$body = @{
    adminKey = "mefisto_admin_2025"
    ip = "192.168.1.100"
} | ConvertTo-Json
Invoke-RestMethod -Uri "https://wave-chat-server.onrender.com/admin/unban-ip" -Method Post -Body $body -ContentType "application/json"
```

**Ответ:**
```json
{
  "success": true,
  "message": "IP 192.168.1.100 unbanned"
}
```

---

## Быстрая очистка через браузер

### JavaScript Console (F12)

```javascript
// Просмотр списка
fetch('https://wave-chat-server.onrender.com/admin/banned-ips')
  .then(r => r.json())
  .then(console.log);

// Очистить все баны
fetch('https://wave-chat-server.onrender.com/admin/clear-bans', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({adminKey: 'mefisto_admin_2025'})
})
  .then(r => r.json())
  .then(console.log);

// Разбанить конкретный IP
fetch('https://wave-chat-server.onrender.com/admin/unban-ip', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    adminKey: 'mefisto_admin_2025',
    ip: '192.168.1.100'
  })
})
  .then(r => r.json())
  .then(console.log);
```

---

## Безопасность

⚠️ **Admin Key**: `mefisto_admin_2025` - это простой ключ для доступа к admin endpoints.

**Для production рекомендуется:**
1. Использовать переменную окружения: `process.env.ADMIN_KEY`
2. Добавить в Render.com: Environment Variables → `ADMIN_KEY=your_secure_key`
3. Использовать JWT токены или OAuth

---

## Автоматическая очистка при перезапуске

Чтобы баны НЕ сбрасывались, нужно:
1. Подключить базу данных (MongoDB Atlas бесплатно)
2. Сохранять `bannedIPs`, `bannedUsers`, `bannedNicknames` в БД
3. Загружать их при старте сервера

**Пример для MongoDB:**
```javascript
// При бане
await db.collection('bans').insertOne({ ip: targetUser.ip, bannedAt: new Date() });

// При старте
const bans = await db.collection('bans').find().toArray();
bans.forEach(ban => bannedIPs.add(ban.ip));
```
