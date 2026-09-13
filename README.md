# Debugging Contest Platform

**Hindusthan Institute of Technology**  
Department of Artificial Intelligence and Data Science  

A production-ready online debugging contest platform supporting C, Java, and Python. Designed for unified single-URL deployment on **Vercel** with **Supabase PostgreSQL** and an **External Sandboxed Code Judge**.

---

## 1. Architecture Overview

Students and administrators access the platform via a single website URL (e.g. `https://debugging-contest.vercel.app`):

```
                               ┌────────────────────────────────────────┐
                               │       Vercel (Single Project URL)      │
                               └──────────────────┬─────────────────────┘
                                                  │
                  ┌───────────────────────────────┴──────────────────────────────┐
                  ▼                                                              ▼
    ┌───────────────────────────┐                                 ┌───────────────────────────┐
    │  Vercel Frontend (SPA)    │                                 │ Vercel Functions (/api/*) │
    │  React 18 + Vite + Monaco │                                 │ Node.js Serverless Lambdas│
    │  /login, /admin, /contest │                                 │ Auth, Contest, Admin APIs │
    └───────────────────────────┘                                 └─────────────┬─────────────┘
                                                                                │
                                           ┌────────────────────────────────────┴──────────────────────────────┐
                                           ▼                                                                   ▼
                            ┌─────────────────────────────┐                                     ┌─────────────────────────────┐
                            │     Supabase PostgreSQL     │                                     │    External Judge Service   │
                            │  Pooled Database (pg-pool)  │                                     │ Judge0 CE / RapidAPI Cloud  │
                            │   Timer, Attempts, Answers  │                                     │  Sandboxed C / Java / Python│
                            └─────────────────────────────┘                                     └─────────────────────────────┘
```

| Layer | Production Architecture | Local Development Architecture |
|---|---|---|
| **Frontend** | Vercel Static Hosting (SPA) | Vite Dev Server (`localhost:5173`) |
| **Backend APIs** | Vercel Serverless Functions (`api/index.ts`) | Express Server (`localhost:4000`) |
| **Database** | Supabase Managed PostgreSQL (SSL) | Local PostgreSQL or Supabase |
| **Code Judge** | External Sandboxed Judge0 (Cloud / Self-Hosted) | Local Docker Judge0 or RapidAPI |
| **Styling** | Vanilla CSS (Professional White Theme) | Vanilla CSS |
| **Auth** | HTTP-only Cookies + Signed JWT | HTTP-only Cookies + Signed JWT |

---

## 2. Repository Structure

```
test-portal/
├── api/
│   └── index.ts               # Vercel Serverless Function entrypoint
├── backend/
│   ├── src/
│   │   ├── app.ts             # Reusable Express application (no listen call)
│   │   ├── index.ts           # Standalone local server listener
│   │   ├── database/
│   │   │   ├── connection.ts  # Serverless-safe Supabase connection pool
│   │   │   ├── migrate.ts     # SQL migration runner
│   │   │   ├── seed.ts        # Database seed (10 questions/lang, admin, contestants)
│   │   │   └── migrations/    # Versioned SQL migration files
│   │   ├── middleware/        # JWT auth, role guards, rate limiting
│   │   ├── routes/            # auth, contest, questions, answers, security, admin
│   │   ├── services/
│   │   │   ├── contestService.ts # Server-authoritative timer, auto-submit, scoring
│   │   │   └── judgeService.ts   # Clean external sandboxed judge abstraction
│   │   └── __tests__/         # Jest integration test suite
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx            # SPA client router (/login, /admin, /contest, etc.)
│   │   ├── pages/             # LoginPage, AdminLoginPage, ContestPage, etc.
│   │   ├── services/api.ts    # Centralized Axios client (/api/*)
│   │   └── styles/            # CSS theme variables and components
│   ├── package.json
│   └── vite.config.ts
├── .env.example               # Documentation of all environment variables
├── .gitignore                 # Strict ignore rules for .env, builds, logs
├── docker-compose.db.yml      # Local dev database container
├── docker-compose.judge0.yml  # Local dev Judge0 container
├── judge0.conf                # Local Judge0 configuration
├── package.json               # Root workspaces configuration & unified scripts
├── tsconfig.json              # Root TypeScript project references
└── vercel.json                # Vercel build & single-URL routing rewrites
```

---

## 3. Frontend & API Routing

### Student Routes
- `/` &rarr; Redirects to `/login`
- `/login` &rarr; Student Registration Number & Password Login
- `/home` &rarr; Student Welcome & Instructions
- `/rules` &rarr; Contest Rules & Proctoring Policies
- `/language` &rarr; Language Selection (C, Java, Python)
- `/contest` &rarr; Full-screen Protected Contest Interface

### Admin Routes
- `/admin` &rarr; Admin Login Portal
- `/admin/dashboard` &rarr; Live Contestant Monitoring, Leaderboard, Violations & Results

### Vercel Serverless API Endpoints
All backend endpoints are routed through `/api/*` without conflicting with frontend routes:
- **Authentication**:
  - `POST /api/auth/login` (Contestant login)
  - `POST /api/auth/logout` (Contestant logout)
  - `GET /api/auth/me` (Session validation)
  - `POST /api/admin/login` (Admin login)
  - `POST /api/admin/logout` (Admin logout)
- **Contest**:
  - `GET /api/contest` (Get contest metadata & current attempt)
  - `POST /api/contest/start` (Start or resume attempt)
  - `POST /api/contest/language` (Select language & randomize question order)
  - `POST /api/contest/heartbeat` (Server-side timer validation & sync)
  - `GET /api/contest/attempt` (Retrieve attempt state)
  - `GET /api/contest/questions` (Retrieve shuffled questions for active attempt)
  - `POST /api/contest/questions/:id/save` (Debounced autosave)
  - `POST /api/contest/questions/:id/check` (Compile and check code against test cases)
  - `POST /api/contest/security-event` (Report proctoring security violation)
  - `POST /api/contest/submit` (Final submission & server-side scoring)
- **Admin**:
  - `GET /api/admin/dashboard` (Live stats)
  - `GET /api/admin/contestants` (List all contestants)
  - `POST /api/admin/contestants` (Add contestant, default password `regno@hitech`)
  - `POST /api/admin/contestants/reset-by-regno` (Grant reattempt access)
  - `DELETE /api/admin/contestants/:id` (Remove contestant)
  - `GET /api/admin/attempts` (All attempt logs)
  - `GET /api/admin/leaderboard` (Live ranked leaderboard)
  - `GET /api/admin/violations` (Audit trail of security events)
  - `GET /api/admin/results` (Detailed question-by-question marks)
- **Health**:
  - `GET /api/health` (System status & timestamp)

---

## 4. Environment Variables

Create your local `.env` or set these in your Vercel Project Settings:

| Variable | Required | Description | Example |
|---|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string | `postgresql://postgres:Admin123%40hitech@db.cyrcwbmrvzsqscrqhrvo.supabase.co:5432/postgres` |
| `JWT_SECRET` | Yes | Secret key for signing JWT tokens | `min-32-chars-long-random-string` |
| `JWT_EXPIRES_IN`| No | Token expiry duration (default: `8h`) | `8h` |
| `JUDGE_URL` | Yes | External Judge0 URL | `https://judge0-ce.p.rapidapi.com` or `http://your-judge:2358` |
| `JUDGE_API_KEY` | Conditional | API key if using RapidAPI Judge0 | `your-rapidapi-key-here` |
| `JUDGE_HOST` | No | RapidAPI host header (default: `judge0-ce.p.rapidapi.com`) | `judge0-ce.p.rapidapi.com` |
| `NODE_ENV` | Yes | Environment mode | `production` |
| `FRONTEND_URL` | No | CORS allowed origin | `https://your-contest.vercel.app` |
| `PG_MAX_POOL` | No | Serverless pool connection limit | `2` (default for serverless) |
| `CONTEST_ID` | No | Target specific contest UUID | *(leave blank for latest active contest)* |

> **Note on Special Characters in Database Password**: If your database password contains special characters like `@` (e.g. `Admin123@hitech`), `connection.ts` automatically parses and URL-encodes it (`Admin123%40hitech`) to prevent connection parsing errors.

---

## 5. Local Setup & Development

### 1. Install all dependencies from root
```bash
npm install
```

### 2. Configure Environment
Copy `.env.example` to `backend/.env`:
```bash
cp .env.example backend/.env
```
Ensure `DATABASE_URL` and `JWT_SECRET` are set.

### 3. Run Database Migrations & Seed
Run migrations and populate questions against your database:
```bash
npm run migrate
npm run seed
```

### 4. Run Development Servers
Start both backend (port 4000) and frontend (port 5173) simultaneously:
```bash
npm run dev
```
Visit `http://localhost:5173` to test.

### 5. Run Test Suite
```bash
npm test
```

### 6. Test Production Build Locally
```bash
npm run build
```

---

## 6. Manual Vercel Deployment Guide

Deploying to Vercel requires zero CLI commands. Follow these exact steps:

### Step 1: Commit and Push to GitHub
```bash
git add .
git commit -m "Prepare repository for Vercel deployment with Supabase and External Judge"
git push origin main
```

### Step 2: Import into Vercel
1. Log in to [vercel.com](https://vercel.com).
2. Click **Add New...** &rarr; **Project**.
3. Select your repository (`varunvj151/test-portal`) and click **Import**.

### Step 3: Configure Project Settings in Vercel
- **Framework Preset**: `Vite` (or `Other`)
- **Root Directory**: `./` (leave at repository root)
- **Build Command**: `npm run build` *(auto-configured via vercel.json)*
- **Output Directory**: `frontend/dist` *(auto-configured via vercel.json)*
- **Install Command**: `npm install`

### Step 4: Add Environment Variables in Vercel
In the **Environment Variables** section, add:
1. `DATABASE_URL`: `postgresql://postgres:Admin123%40hitech@db.cyrcwbmrvzsqscrqhrvo.supabase.co:5432/postgres`
2. `JWT_SECRET`: *(A secure 32+ character random string)*
3. `JUDGE_URL`: Your external Judge0 endpoint (e.g. `https://judge0-ce.p.rapidapi.com` or self-hosted Judge0 instance)
4. `JUDGE_API_KEY`: *(Your RapidAPI key if using RapidAPI, otherwise leave blank)*
5. `NODE_ENV`: `production`

### Step 5: Deploy
Click **Deploy**. Vercel will build the backend TypeScript, compile the React frontend into `frontend/dist`, and mount the Serverless Function at `/api`.

---

## 7. Code Judge Configuration Options

Contestant code is **never** executed inside Vercel Functions (`child_process`, `spawn`, `eval` are strictly forbidden). All code evaluation calls the isolated external judge service:

### Option A: RapidAPI Judge0 Cloud
1. Subscribe to [Judge0 CE on RapidAPI](https://rapidapi.com/judge0-official/api/judge0-ce).
2. Set in Vercel:
   ```
   JUDGE_URL=https://judge0-ce.p.rapidapi.com
   JUDGE_API_KEY=<your-rapidapi-key>
   JUDGE_HOST=judge0-ce.p.rapidapi.com
   ```

### Option B: Self-Hosted Remote Judge0 (Docker)
1. Deploy Judge0 on any VPS (DigitalOcean, AWS EC2, Hetzner) using `docker-compose.judge0.yml`.
2. Set in Vercel:
   ```
   JUDGE_URL=http://<vps-ip-or-domain>:2358
   JUDGE_API_KEY=
   ```

---

## 8. Credentials & Access

### Default Admin Credentials
- **URL**: `/admin`
- **Username**: `admin`
- **Password**: `Admin@HiTech2024`

### Default Contestant Credentials (from seed)
- **URL**: `/login`
- **Registration Number**: `720824108119`
- **Password**: `720824108119@hitech`
- *(Additional seeded accounts: `720824108120`, `720824108121`)*

### Adding New Contestants
Administrators can add contestants in the Admin Dashboard (`/admin/dashboard`). Passwords are automatically generated using the formula `<regno>@hitech`.
