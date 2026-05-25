# Inventory Tracker

Full-stack inventory app (React + FastAPI).

## Local development

**Backend**

```bash
cd backend
cp env.example .env
python3 -m uvicorn server:app --reload --host 127.0.0.1 --port 8000
```

**Frontend**

```bash
cd frontend
cp env.example .env.local
npm install
npm start
```

## Deploy to Vercel

Use **two Vercel projects** (root directories `backend` and `frontend`).

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for:

- Required environment variables (backend + frontend)
- Project settings
- Deploy order and production notes
