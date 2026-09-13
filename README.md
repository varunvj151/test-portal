# Debugging Contest Platform

**Hindusthan Institute of Technology**
Department of Artificial Intelligence and Data Science

A production-ready online debugging contest platform supporting C, Java, and Python.

---

## Architecture

```
frontend/          React + Vite + TypeScript + Monaco Editor
backend/           Node.js + Express + TypeScript
database/          PostgreSQL (all migrations in backend/src/database/migrations/)
judge/             Judge0 CE (Docker) or Judge0 RapidAPI
```

## Tech Stack

| Layer       | Technology                          |
|-------------|-------------------------------------|
| Frontend    | React 18, Vite, TypeScript, Monaco  |
| Backend     | Node.js, Express, TypeScript        |
| Database    | PostgreSQL 13+                      |
| Auth        | JWT (HTTP-only cookies), bcrypt     |
| Judge       | Judge0 CE                           |
| Styling     | Vanilla CSS (professional white)    |

---

## Local Setup

### Prerequisites

- Node.js 18+
- PostgreSQL 13+
- Docker (for Judge0 sandbox) OR Judge0 RapidAPI account

### 1. Clone and configure

```bash
# Copy environment files
cp .env.example backend/.env
```

Edit `backend/.env`:

```
DATABASE_URL=postgresql://user:password@localhost:5432/debugcontest
JWT_SECRET=your-very-long-random-secret
ADMIN_SECRET=your-admin-password
JUDGE0_URL=http://localhost:2358
JUDGE0_API_KEY=          # leave empty for local Judge0
PORT=4000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
CONTEST_ID=              # leave empty to use first active contest
```

### 2. Database

```bash
# Create the database
createdb debugcontest

# Run migrations
cd backend
npm run migrate

# Seed demo data (contestants, questions, admin)
npm run seed
```

### 3. Judge0 (local Docker)

```bash
# Start Judge0 sandbox
docker-compose -f docker-compose.judge0.yml up -d

# Wait ~60 seconds for services to initialize
# Verify: curl http://localhost:2358/about
```

Alternatively, use [Judge0 on RapidAPI](https://rapidapi.com/judge0-official/api/judge0-ce):
- Set `JUDGE0_URL=https://judge0-ce.p.rapidapi.com`
- Set `JUDGE0_API_KEY=your-rapidapi-key`

### 4. Run Backend

```bash
cd backend
npm install
npm run dev
```

Server runs at: `http://localhost:4000`

### 5. Run Frontend

```bash
cd frontend
npm install
npm run dev
```

App runs at: `http://localhost:5173`

---

## Environment Variables

| Variable          | Required | Description                         |
|-------------------|----------|-------------------------------------|
| DATABASE_URL      | Yes      | PostgreSQL connection string        |
| JWT_SECRET        | Yes      | Secret for JWT signing (min 32 chars)|
| JUDGE0_URL        | Yes      | Judge0 base URL                     |
| JUDGE0_API_KEY    | No       | RapidAPI key (if using cloud Judge0)|
| PORT              | No       | Backend port (default: 4000)        |
| NODE_ENV          | No       | production / development            |
| FRONTEND_URL      | No       | Allowed CORS origin                 |
| CONTEST_ID        | No       | Specific contest UUID to use        |

---

## Database Setup

### Run Migrations

```bash
cd backend
npm run migrate
```

### Seed Demo Data

Creates:
- 3 demo contestants (reg numbers: 720824108119, 720824108120, 720824108121)
- Default passwords: `<reg_number>@hitech`
- 1 admin user: username=`admin`, password=`Admin@HiTech2024`
- 1 active contest: "Debugging Contest" (60 min, 3 max violations)
- 18 questions: 6 per language (C, Java, Python), 3 hidden test cases each

```bash
cd backend
npm run seed
```

---

## Testing

```bash
cd backend
npm test
```

Tests require a running PostgreSQL database with migrations and seed data applied.

Tests cover:
- Authentication (valid, invalid, unauthorized)
- Contest lifecycle (start, language selection, language locking)
- Attempt ownership enforcement
- One-attempt restriction
- Security event logging and debouncing
- Submission and duplicate submission rejection
- Admin authorization (contestants cannot access admin APIs)

---

## Deployment

### Frontend → Vercel

```bash
cd frontend
npm run build
# Deploy dist/ to Vercel
```

Set environment variable in Vercel:
- `VITE_API_URL` — not needed (Vite proxy handles it in dev; configure Vercel rewrites for prod)

### Backend → Railway / Render

1. Push to GitHub
2. Connect repo to Railway or Render
3. Set all environment variables
4. Set build command: `npm run build`
5. Set start command: `npm start`

### Database → Supabase

1. Create project at [supabase.com](https://supabase.com)
2. Copy connection string to `DATABASE_URL`
3. Run: `npm run migrate && npm run seed`

---

## Admin Setup

Default admin credentials (from seed):
- Username: `admin`
- Password: `Admin@HiTech2024`

**Change this immediately in production** by updating the admin table directly:

```sql
UPDATE admins SET password_hash = '<new bcrypt hash>' WHERE username = 'admin';
```

Access admin panel: `http://localhost:5173/admin`

---

## Adding Contestants

**Method 1: Admin UI**
1. Log in to admin panel
2. Go to "Contestants"
3. Add individual or bulk import

**Method 2: Direct seed**
Edit `backend/src/database/seed.ts` and re-run `npm run seed`.

**Method 3: API (admin authenticated)**
```
POST /api/admin/contestants/bulk
Body: { contestants: [{ registration_number, name, department }] }
```

---

## Contest Configuration

Questions are stored in the database. The seed creates 6 questions per language.

To modify questions:
1. Use the Admin UI (Questions section — edit existing or add new)
2. Or directly via the admin API

---

## Known Limitations

See [SECURITY.md](SECURITY.md) for detailed security analysis and known limitations.

1. **Judge0 dependency**: Code execution requires Judge0 to be running. If Judge0 is unavailable, `CHECK CODE` returns a service-unavailable error. Code is still saved.

2. **Fullscreen**: Browser fullscreen is requestable via JavaScript but cannot be forced indefinitely. If a user presses F11 or Esc, the browser handles it. We detect the exit and log a violation.

3. **Screenshots**: OS-level screenshots cannot be prevented by a web application. The platform logs `PrintScreen` key press attempts when detectable by the browser. This is a best-effort deterrent.

4. **AI Extensions**: Browser extensions operate outside the page sandbox. We implement clipboard protection and disable text selection, but cannot detect all AI assistant extensions.

5. **Tab switching via Alt+Tab**: Window blur events are monitored, but some OS actions (like dragging to another desktop) may not trigger window blur in all browsers.

**Recommendation for real contests**: Use a controlled computer lab environment with extensions disabled, no personal devices, and physical invigilation.

# 1. Create PostgreSQL database
createdb debugcontest

# 2. Backend setup
cd backend
# Edit .env — DATABASE_URL is pre-filled for local postgres:postgres
npm run migrate
npm run seed
npm run dev

# 3. Frontend (new terminal)
cd frontend
npm run dev

# Open: http://localhost:5173
# Admin: http://localhost:5173/admin  (admin / Admin@HiTech2024)
# Demo contestant: 720824108119 / 720824108119@hitech
