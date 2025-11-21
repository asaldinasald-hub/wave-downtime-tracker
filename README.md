# Wave Downtime Tracker 🌊

Real-time downtime monitoring for Wave exploit with live statistics and history tracking.

## 🌐 Live Demo
[wave-downtime.vercel.app](https://your-domain.vercel.app) _(после деплоя)_

## ✨ Features

- 📊 **Real-time status** - Shows current Wave version and update status
- ⏱️ **Live downtime timer** - Counts how long Wave has been down
- 📈 **Statistics tracking** - Records last downtime duration and all-time record
- 🎨 **Beautiful UI** - Styled to match Wave's official website design
- 💾 **Persistent data** - Statistics saved in browser localStorage

## 🚀 Local Development

### Using Python (Local)
```powershell
python proxy_server.py
```
Open `http://localhost:8000`

### Deploy to Vercel
1. Push to GitHub
2. Import project on [vercel.com](https://vercel.com)
3. Deploy automatically!

## 📡 API

The site fetches Wave status from WEAO API:
- Endpoint: `https://weao.xyz/api/status/exploits/wave`
- Required header: `User-Agent: WEAO-3PService`
- Updates every 30 seconds

## 🛠️ Tech Stack

- Pure HTML/CSS/JavaScript
- Python proxy server (local dev)
- Vercel Serverless Functions (production)
- WEAO API integration

## 📝 License

MIT
