# 🥩 FreshMeat Shop Manager

A **full-stack MERN application** for a Mutton & Chicken shop owner to automate WhatsApp marketing, take orders, and manage delivery — completely **free & open-source**.

---

## 📁 Project Structure

```
w_m/
├── backend/                    ← Node.js + Express API
│   ├── models/
│   │   ├── Campaign.js         ← Campaign schema
│   │   ├── Contact.js          ← Customer contacts
│   │   ├── Menu.js             ← Menu items
│   │   └── Order.js            ← Orders
│   ├── routes/
│   │   ├── whatsapp.js         ← WhatsApp connect/status/SSE
│   │   ├── contacts.js         ← Excel upload + contact CRUD
│   │   ├── campaign.js         ← Send campaigns
│   │   ├── menu.js             ← Menu CRUD + seed
│   │   └── orders.js           ← Order management + stats
│   ├── utils/
│   │   ├── whatsappService.js  ← WPPConnect session manager
│   │   └── conversationFlow.js ← WhatsApp bot conversation logic
│   ├── uploads/                ← Campaign images (auto-created)
│   ├── tokens/                 ← WPP session tokens (auto-created)
│   ├── .env                    ← Environment variables
│   ├── package.json
│   └── server.js               ← Express app entry point
│
└── frontend/                   ← React 18 app
    ├── public/index.html
    └── src/
        ├── components/
        │   ├── Layout.js        ← Sidebar + topbar shell
        │   └── Layout.css
        ├── pages/
        │   ├── Dashboard.js     ← Stats + WhatsApp QR connection
        │   ├── Contacts.js      ← Excel upload + manual entry
        │   ├── Campaign.js      ← Send campaigns with image
        │   ├── Orders.js        ← Order list + status updates
        │   └── Menu.js          ← Menu CRUD
        ├── App.js
        ├── App.css
        ├── index.css            ← CSS variables + global styles
        └── index.js
```

---

## ⚙️ Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | ≥ 18 | https://nodejs.org |
| MongoDB | ≥ 6 | https://www.mongodb.com/try/download/community |
| npm | ≥ 9 | Comes with Node.js |
| Google Chrome | Latest | For WPPConnect headless |

---

## 🚀 Setup & Run

### 1. Install MongoDB
```bash
# Ubuntu/Debian
sudo apt install -y mongodb
sudo systemctl start mongodb

# OR use MongoDB Atlas (free cloud): https://www.mongodb.com/atlas
```

### 2. Backend Setup
```bash
cd w_m/backend
npm install
```

Edit `.env` if needed:
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/mutton_chicken_shop
SESSION_NAME=mutton-shop
```

Start backend:
```bash
npm run dev       # development (auto-restart)
# OR
npm start         # production
```

### 3. Frontend Setup
```bash
cd w_m/frontend
npm install
npm start         # opens http://localhost:3000
```

### 4. Seed Default Menu (first time)
Go to **Menu page → Load Defaults** button to populate sample items.

---

## 📱 WhatsApp Connection

1. Open Dashboard → Click **"Connect WhatsApp"**
2. Wait for QR code (~10 seconds)
3. On your phone: **WhatsApp → ⋮ → Linked Devices → Link a Device**
4. Scan the QR code
5. Status turns **"Connected"** ✅

> ⚠️ Keep the server running — WhatsApp session is maintained as long as the process runs.

---

## 🔄 Complete WhatsApp Flow

```
Owner sends Campaign
        ↓
Customer receives: [Image] + [Message] + Options
  → Reply 1 (Yes, Interested)
  → Reply 2 (No, Not Interested)
        ↓
  If "1" → Bot sends Menu
           Customer selects items (e.g. "1,3")
           Bot asks quantity per item
           Order confirmed → Unique Order ID sent
           
  If "2" → Thank you message sent
        ↓
Owner marks order "Out for Delivery"
  → Customer gets delivery notification
        ↓
Owner marks "Delivered"
  → Thank you + "Order Again" message sent automatically
```

---

## 🌐 Pages

| Page | URL | Purpose |
|------|-----|---------|
| Dashboard | `/dashboard` | Stats, WhatsApp QR, recent orders |
| Contacts | `/contacts` | Upload Excel, add manually |
| Campaign | `/campaign` | Send WhatsApp campaigns with image |
| Orders | `/orders` | View + update order status |
| Menu | `/menu` | Add/edit/delete menu items |

---

## 🔌 API Endpoints

### WhatsApp
- `GET /api/whatsapp/status` — current connection status
- `GET /api/whatsapp/status/stream` — SSE real-time stream
- `POST /api/whatsapp/connect` — start WPP session
- `POST /api/whatsapp/disconnect` — end session

### Contacts
- `POST /api/contacts/upload-excel` — extract phones from Excel
- `POST /api/contacts/save` — save phone list
- `GET /api/contacts` — list all contacts
- `DELETE /api/contacts/:id` — delete

### Campaign
- `POST /api/campaign/send` — send campaign (multipart: image + message + phones)
- `GET /api/campaign` — list campaigns

### Menu
- `GET /api/menu` — list items
- `POST /api/menu` — add item
- `PUT /api/menu/:id` — update item
- `DELETE /api/menu/:id` — delete item
- `POST /api/menu/seed` — load default menu

### Orders
- `GET /api/orders` — list (filter: `?status=confirmed&date=2024-01-01`)
- `GET /api/orders/stats/summary` — dashboard stats
- `GET /api/orders/:id` — single order
- `PUT /api/orders/:id/status` — update status

---

## 🛠 Troubleshooting

**WhatsApp not connecting?**
- Ensure Google Chrome is installed
- Try: `sudo apt install -y chromium-browser`
- Add to `.env`: `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser`

**MongoDB connection error?**
- Confirm MongoDB is running: `sudo systemctl status mongodb`
- Check the URI in `.env`

**Port 5000 in use?**
- Change `PORT=5001` in `.env`

**Sessions lost after restart?**
- Tokens are saved in `backend/tokens/` — keep this folder
- You may need to re-scan QR after a server restart

---

## 📦 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, React Router 6, Axios, Lucide Icons, Recharts |
| Backend | Node.js, Express 4, Mongoose 7 |
| Database | MongoDB |
| WhatsApp | WPPConnect (open source) |
| Excel | SheetJS (xlsx) |
| File Upload | Multer |

---

## 🆓 100% Free & Open Source

No paid APIs. No subscriptions. Everything self-hosted.

---

*Built for small business owners. Made with ❤️*
