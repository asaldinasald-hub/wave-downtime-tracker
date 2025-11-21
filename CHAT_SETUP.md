# Wave Downtime Tracker - Chat Setup Guide

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ installed
- Python 3.x (for API proxy)

### Installation

1. **Install Node.js dependencies:**
```bash
npm install
```

### Running Locally

**Option 1: Run both servers separately**

Terminal 1 - API Proxy Server:
```bash
npm run dev
# or
python proxy_server.py
```

Terminal 2 - Chat Server:
```bash
npm run chat
# or
node chat-server.js
```

**Option 2: Development mode (auto-restart on changes)**
```bash
npm run chat:dev
```

The chat server will run on `http://localhost:3000`

### Frontend Configuration

In `chat.js`, update the server URL:
```javascript
const serverUrl = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000'
    : 'https://your-backend-url.com'; // Replace with your deployed backend
```

## 🌐 Deployment

### Backend Deployment Options

#### Option 1: Render.com (Recommended - Free tier available)

1. Create account at [render.com](https://render.com)
2. Create new "Web Service"
3. Connect your GitHub repository
4. Configure:
   - **Build Command:** `npm install`
   - **Start Command:** `npm run chat`
   - **Environment:** Node
5. Deploy!

Your backend URL will be: `https://your-app-name.onrender.com`

#### Option 2: Railway.app

1. Create account at [railway.app](https://railway.app)
2. Create new project from GitHub
3. Railway auto-detects Node.js and deploys
4. Get your deployment URL

#### Option 3: Heroku

1. Create Heroku account
2. Install Heroku CLI
3. Commands:
```bash
heroku create your-chat-server
git push heroku main
```

#### Option 4: VPS (DigitalOcean, Linode, etc.)

1. SSH into your VPS
2. Install Node.js and PM2:
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2
```

3. Clone repository and install:
```bash
git clone https://github.com/asaldinasald-hub/wave-downtime-tracker.git
cd wave-downtime-tracker
npm install
```

4. Start with PM2:
```bash
pm2 start chat-server.js --name wave-chat
pm2 save
pm2 startup
```

5. Configure Nginx reverse proxy (optional but recommended)

### Frontend Deployment

Frontend remains on Vercel (already configured). After deploying backend:

1. Update `chat.js` with your backend URL
2. Commit and push to GitHub
3. Vercel auto-deploys

## 📋 Features

### Chat Features
- ✅ Real-time messaging with Socket.IO
- ✅ Unique nicknames (English only, 3-20 characters)
- ✅ Message cooldown (5 seconds between messages)
- ✅ Message limit (100 characters max)
- ✅ 24-hour message history
- ✅ Online user counter with pulsing indicator
- ✅ Unique avatar colors for each user
- ✅ Admin system (first user with nickname "mefisto")
- ✅ Ban functionality (admin only)
- ✅ Banned users' messages are deleted
- ✅ Persistent bans across sessions

### Admin Powers
First user to register with nickname **"mefisto"** becomes admin with:
- 🔨 Ban button visible next to each user's messages
- 🗑️ Ban removes ALL messages from that user
- 🚫 Banned users cannot rejoin

## 🔧 Environment Variables

For production, you can use environment variables:

```bash
PORT=3000  # Server port (default: 3000)
```

## 📊 Monitoring

Health check endpoint:
```
GET /health
```

Response:
```json
{
  "status": "ok",
  "onlineUsers": 5,
  "totalMessages": 42,
  "adminExists": true
}
```

## 🐛 Troubleshooting

### Chat not connecting
- Check if chat server is running on port 3000
- Verify CORS settings in `chat-server.js`
- Check browser console for WebSocket errors
- Ensure backend URL is correctly set in `chat.js`

### Messages not sending
- Check 5-second cooldown
- Verify message length (max 100 chars)
- Check if user is banned
- Verify Socket.IO connection in browser console

### Admin not working
- Admin is the FIRST user with nickname "mefisto" (case-insensitive)
- If someone else already registered "mefisto", restart server
- Check browser console for admin confirmation

## 🔐 Security Notes

- Nicknames are unique and validated
- Messages are sanitized (HTML escaped)
- Rate limiting via cooldown system
- Admin-only ban functionality
- In-memory storage (consider database for production)

## 📝 Database Migration (Optional)

For production, consider migrating from in-memory to database:

### MongoDB Example:
```javascript
const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  userId: String,
  nickname: String,
  message: String,
  timestamp: Date,
  avatarHue: Number
});

const Message = mongoose.model('Message', MessageSchema);
```

### PostgreSQL Example:
```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  nickname VARCHAR(20) NOT NULL,
  message VARCHAR(100) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  avatar_hue INT NOT NULL
);

CREATE TABLE banned_users (
  user_id UUID PRIMARY KEY,
  banned_at TIMESTAMPTZ NOT NULL
);
```

## 📚 Tech Stack

- **Frontend:** Vanilla JavaScript + Socket.IO Client
- **Backend:** Node.js + Express + Socket.IO
- **Storage:** In-memory (Map/Array) - migrable to DB
- **Deployment:** Vercel (frontend) + Your choice (backend)

## 🎨 Customization

### Change message retention time:
In `chat-server.js`:
```javascript
const MESSAGE_RETENTION_TIME = 24 * 60 * 60 * 1000; // 24 hours
```

### Change cooldown time:
In `chat.js`:
```javascript
let timeLeft = 5; // seconds
```

### Modify avatar colors:
In `chat-server.js`:
```javascript
function generateAvatarHue() {
    return Math.floor(Math.random() * 360); // 0-360 degrees
}
```

## 📞 Support

For issues or questions, check:
- Browser console for errors
- Server logs for backend issues
- Network tab for WebSocket connection status

---

Made with ❤️ for the Wave community
