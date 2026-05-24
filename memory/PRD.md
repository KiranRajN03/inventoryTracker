# Inventory Management Platform - PRD

## Original Problem Statement
Build a full-stack inventory management platform with a React Web dashboard for admins and a React Native (Expo) mobile app for floor workers.

**Data Architecture**: Immutable StockLedger table. All stock changes (Receive, Pick, Transfer, Audit) inserted as transactional records linked to a User, Location, and Product. Current stock levels dynamically calculated from this ledger.

**Web App Features**: Secure authentication with Role-Based Access Control (Admin vs. Worker). Data tables for SKU management, location mapping, and central dashboard visualizing stock velocity and low-inventory alerts.

**Mobile App Features**: Barcode scanning using device camera (+ keyboard input). Streamlined large-target UI flows for Receiving, Picking, and Cycle Counting. Offline-first caching with SQLite for intermittent network connectivity.

## Architecture

### Backend (FastAPI + MongoDB)
- **Framework**: FastAPI with Motor (async MongoDB driver)
- **Auth**: JWT (httpOnly cookies + Bearer header fallback), bcrypt password hashing
- **Database**: MongoDB collections: `users`, `products`, `locations`, `stock_ledger`
- **Immutable Ledger Pattern**: `current_stock` is computed via MongoDB aggregation (sum of `quantity_change` from `stock_ledger`), never stored on the product document
- **Server**: `/app/backend/server.py`

### Frontend (React)
- **Routing**: react-router-dom with role-based protected routes
- **State**: AuthContext for user session
- **UI**: shadcn/ui components + lucide-react icons + Tailwind
- **Design**: Swiss high-contrast (monochrome base, `#002FA7` primary, sharp 1px borders, no shadows)

### Mobile (React Native / Expo) — Placeholder
- **Location**: `/app/mobile/` with README and package.json scaffold
- **Tech stack documented**: Expo, expo-camera, expo-sqlite, axios
- **Reason for placeholder**: React Native cannot run in the current FastAPI/React preview environment; web `/worker` route provides interim access

## User Personas
1. **Admin** (`admin@inventory.com` / `Admin@123`) — Full access to dashboard, products, locations, and stock ledger
2. **Worker** — Authenticated user with `role: "worker"`; can create stock transactions and sync from mobile

## Core Requirements (Static)
- Immutable stock ledger (insert-only, no update/delete)
- Role-based access control (Admin vs Worker)
- Configurable low-stock threshold per product
- Dashboard stats: total products, locations, stock, low-stock alerts, recent transactions
- Mobile sync endpoints (`/api/sync/push`, `/api/sync/pull`)

## What's Been Implemented (May 24, 2026)
- ✅ JWT auth (login, register, me, logout) with admin seeding
- ✅ Role-based access control middleware
- ✅ Products CRUD with immutable-ledger-derived `current_stock`
- ✅ Locations CRUD
- ✅ Stock Ledger transaction endpoint (RECEIVE / PICK / TRANSFER / AUDIT)
- ✅ Dashboard stats + low-stock alerts (configurable per-product threshold)
- ✅ Mobile sync endpoints (push/pull)
- ✅ Admin web dashboard with sidebar navigation
- ✅ Products management page with create/edit/delete dialogs
- ✅ Locations management page with create/edit/delete dialogs
- ✅ Stock Ledger viewer with transaction recording dialog
- ✅ Worker landing page (mobile-app placeholder)
- ✅ Swiss high-contrast design system (Cabinet Grotesk / IBM Plex Sans / JetBrains Mono)
- ✅ Full backend pytest suite (35/35 passing)

## Prioritized Backlog
### P0 (Blocking next phase)
- Build React Native Expo mobile app with full barcode scanning, offline SQLite cache, and sync queue
- Implement worker-facing receive/pick/cycle-count flows on mobile

### P1
- Stock velocity chart on dashboard (Recharts time-series of transactions)
- Per-product stock detail page with transaction history
- Export ledger to CSV
- Bulk SKU import (CSV upload)

### P2
- Brute-force lockout (5-fail / 15-min) on `/api/auth/login`
- Configurable cookie `secure=True` for production
- Standardize `/api/auth/login` response shape via `UserResponse`
- Switch low-stock comparison from `<` to `<=` (currently excludes exact-match)
- Add `DialogDescription` to all dialogs for a11y
- Refactor server.py into routers (`auth.py`, `products.py`, `stock.py`)
- Extract duplicated `current_stock` aggregation pipeline into helper

## Next Tasks
1. Initialize Expo project under `/app/mobile/InventoryMobile`
2. Implement BarcodeScanner component (camera + manual entry)
3. SQLite schema for `products_cache`, `locations_cache`, `pending_transactions`
4. Sync queue background worker
5. Stock velocity Recharts visualization on web dashboard
