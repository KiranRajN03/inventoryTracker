# Deploying to Vercel

This app uses **two separate Vercel projects** (backend and frontend). Deploy the **backend first**, copy its URL, then configure and deploy the frontend.

## 1. Backend project

| Setting | Value |
|--------|--------|
| **Root Directory** | `backend` (**required** — do not use the repo root) |
| **Framework Preset** | FastAPI (or Other) |
| **Build Command** | *(leave empty — Python is detected automatically)* |
| **Output Directory** | *(leave empty)* |
| **Install Command** | *(default)* |

The backend entrypoint is `server.py` (see `pyproject.toml`). Do not add a legacy `functions` block for `api/index.py` in `vercel.json`.

### Troubleshooting: `functions` / `api/index.py` build error

If you see:

`The pattern "api/index.py" defined in functions doesn't match any Serverless Functions`

1. Confirm **Root Directory** is `backend`, not the monorepo root.
2. Use the current minimal `backend/vercel.json` (no `functions` or `builds` section).
3. Redeploy after pulling the latest changes.

### Backend environment variables (Vercel → Settings → Environment Variables)

| Variable | Required | Example | Notes |
|----------|----------|---------|--------|
| `JWT_SECRET` | **Yes** (production) | `openssl rand -hex 32` | Long random string. Never use the dev default in production. |
| `CORS_ORIGINS` | **Yes** | `https://your-frontend.vercel.app` | Exact frontend URL(s), comma-separated. Include preview URLs if you use branch deploys, e.g. `https://app.vercel.app,https://app-git-main-user.vercel.app` |
| `ADMIN_EMAIL` | Recommended | `admin@yourcompany.com` | Seeded admin account on first startup |
| `ADMIN_PASSWORD` | Recommended | *(strong password)* | Change from default `Admin@123` |
| `SQLITE_DB_PATH` | No | `/tmp/inventory.db` | Default on Vercel is `/tmp` (see limitation below) |

Vercel sets `VERCEL` automatically — do not add it manually.

### Backend URL

After deploy, your API base URL is something like:

`https://inventory-api-xyz.vercel.app`

Use this **without a trailing slash** for the frontend variable below.

---

## 2. Frontend project

| Setting | Value |
|--------|--------|
| **Root Directory** | `frontend` |
| **Framework Preset** | Create React App (or Other) |
| **Build Command** | `npm run build` |
| **Output Directory** | `build` |
| **Install Command** | `npm install` |

`frontend/vercel.json` already sets build output, SPA rewrites, and `CI=false` for CRA.

### Frontend environment variables

| Variable | Required | Example | Notes |
|----------|----------|---------|--------|
| `REACT_APP_BACKEND_URL` | **Yes** | `https://inventory-api-xyz.vercel.app` | Backend base URL, **no trailing slash**. Baked in at **build time** — redeploy frontend after changing it. |

Apply to **Production** (and **Preview** if you use preview deployments with a real backend URL).

---

## 3. Deploy order checklist

1. Deploy **backend** (`backend` root).
2. Set backend env vars (`JWT_SECRET`, `CORS_ORIGINS`, `ADMIN_*`).
3. Copy backend deployment URL.
4. Create **frontend** project (`frontend` root).
5. Set `REACT_APP_BACKEND_URL` to the backend URL.
6. Deploy frontend.
7. Update backend `CORS_ORIGINS` if the frontend URL changed (preview/prod domains).
8. Redeploy backend if you changed `CORS_ORIGINS`.

---

## 4. Quick reference

```
Frontend  REACT_APP_BACKEND_URL  →  https://<backend-project>.vercel.app
Backend   CORS_ORIGINS           →  https://<frontend-project>.vercel.app
Backend   JWT_SECRET             →  (random secret)
```

---

## 5. Important limitations

### SQLite on Vercel serverless

The backend uses SQLite stored under `/tmp`. On Vercel serverless:

- Data may **not persist** reliably across deployments or cold starts.
- For a real production database, migrate to **Vercel Postgres**, **Turso**, **Neon**, or similar and update `server.py` accordingly.

### HTTPS and cookies

Auth cookies use `Secure` + `SameSite=None` (required for cross-origin frontend ↔ API). Both sites must be served over **HTTPS** (Vercel provides this).

### Auth without cookies

The frontend also stores `access_token` in `localStorage` and sends `Authorization: Bearer`, so login works even if third-party cookies are blocked.

---

## 6. Local vs Vercel env files

| File | Used on |
|------|---------|
| `backend/.env` | Local uvicorn only |
| `frontend/.env.local` | Local `npm start` only |

Do not commit secrets. Set production values only in the Vercel dashboard.
