# VedicAstro Backend

Backend API for the VedicAstro mobile applications.

## Tech Stack
- Node.js + Express + TypeScript
- MongoDB with Mongoose
- JWT Authentication

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file (copy from `.env.example`):
```bash
cp .env.example .env
```

3. Update `.env` with your values:
- `MONGO_URI`: Your MongoDB connection string
- `JWT_SECRET`: A strong secret key

4. Run development server:
```bash
npm run dev
```

## Deploy to Railway (Free Tier)

### Prerequisites
1. Create a [Railway](https://railway.app) account
2. Create a [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) free cluster

### Deployment Steps

1. **Push to GitHub**
   - Create a new GitHub repository
   - Push the BACKEND folder to GitHub

2. **Create Railway Project**
   - Go to [Railway Dashboard](https://railway.app/dashboard)
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your repository

3. **Set Environment Variables in Railway**
   Go to your service → Variables tab → Add:
   
   | Variable | Value |
   |----------|-------|
   | `MONGO_URI` | Your MongoDB Atlas connection string |
   | `JWT_SECRET` | A strong secret key (generate one) |
   | `NODE_ENV` | `production` |
   | `CORS_ORIGIN` | `*` (or specific origins) |

4. **Deploy**
   Railway will automatically:
   - Install dependencies
   - Run `npm run build` (via postinstall)
   - Start with `npm start`

5. **Get Your URL**
   - Go to Settings → Domains
   - Generate a Railway domain (e.g., `your-app.up.railway.app`)
   - Use this URL in your mobile apps

### Update Mobile Apps

After deployment, update the API URL in your apps:

**VedicAstroExpo** (`src/services/api.ts`):
```typescript
const BASE_URL = 'https://your-app.up.railway.app/api';
```

**VedicPannel** (`src/services/api.ts`):
```typescript
const BASE_URL = 'https://your-app.up.railway.app/api';
```

## API Endpoints

### Health Check
- `GET /api/health` - Server health status

### Authentication
- `POST /api/auth/check-user` - Check if user exists
- `POST /api/auth/send-otp` - Send OTP
- `POST /api/auth/verify-otp` - Verify OTP
- `POST /api/auth/signup` - Register new user
- `POST /api/auth/login` - Login user

### Astrologer
- `GET /api/astrologer/list` - Get approved astrologers

### Panel (Astrologer App)
- `POST /api/panel/check` - Check astrologer
- `POST /api/panel/verify-otp` - Login
- `GET /api/panel/profile` - Get profile
- `PUT /api/panel/rate` - Update chat rate

### Admin
- `GET /api/admin/dashboard` - Dashboard stats
- `GET /api/admin/astrologers` - List astrologers
- `PUT /api/admin/astrologers/:id` - Update astrologer
- `PUT /api/admin/astrologers/bulk` - Bulk update

## Free Tier Limits

Railway free tier includes:
- 500 hours of runtime/month
- $5 credit (enough for hobby projects)
- Automatic sleep after inactivity (wakes on request)

MongoDB Atlas free tier includes:
- 512 MB storage
- Shared cluster
- Perfect for development/small apps
