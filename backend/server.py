from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from dotenv import load_dotenv
from pathlib import Path
import os
import sqlite3
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt
import logging
import secrets

from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional, Literal

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# SQLite connection
# Use /tmp on Vercel as it's the only writable directory, otherwise local directory
DB_PATH = os.environ.get('SQLITE_DB_PATH', '/tmp/inventory.db' if 'VERCEL' in os.environ else str(ROOT_DIR / 'inventory.db'))

def get_db_connection():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

app = FastAPI()
api_router = APIRouter(prefix="/api")

JWT_ALGORITHM = "HS256"

# ===== AUTH UTILITIES =====
def get_jwt_secret() -> str:
    return os.environ.get("JWT_SECRET", "super-secret-key-for-dev")

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))

def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email, "exp": datetime.now(timezone.utc) + timedelta(minutes=15), "type": "access"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "refresh"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE id = ?", (payload["sub"],))
        user_row = cursor.fetchone()
        conn.close()
        
        if not user_row:
            raise HTTPException(status_code=401, detail="User not found")
        
        user = dict(user_row)
        user["_id"] = user.pop("id")
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ===== MODELS =====
class UserRegister(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: Literal["admin", "worker"] = "worker"

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(alias="_id")
    email: str
    name: str
    role: str
    created_at: datetime

class ProductCreate(BaseModel):
    sku: str
    name: str
    description: Optional[str] = None
    low_stock_threshold: int = 10
    unit: str = "units"

class ProductResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    sku: str
    name: str
    description: Optional[str] = None
    low_stock_threshold: int
    unit: str
    current_stock: int = 0
    created_at: datetime

class LocationCreate(BaseModel):
    warehouse_id: str
    zone: str
    aisle: str
    bin: str
    capacity: Optional[int] = None

class LocationResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    warehouse_id: str
    zone: str
    aisle: str
    bin: str
    capacity: Optional[int] = None
    created_at: datetime

class StockLedgerCreate(BaseModel):
    product_id: str
    location_id: str
    transaction_type: Literal["RECEIVE", "PICK", "TRANSFER", "AUDIT"]
    quantity_change: int
    reference_number: Optional[str] = None
    notes: Optional[str] = None

class StockLedgerResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    product_id: str
    location_id: str
    user_id: str
    transaction_type: str
    quantity_change: int
    reference_number: Optional[str] = None
    notes: Optional[str] = None
    timestamp: datetime

class DashboardStats(BaseModel):
    total_products: int
    total_locations: int
    total_stock: int
    low_stock_count: int
    recent_transactions: int

class LowStockAlert(BaseModel):
    product_id: str
    sku: str
    product_name: str
    current_stock: int
    threshold: int

class SyncPayload(BaseModel):
    transactions: List[StockLedgerCreate]

# ===== AUTH ENDPOINTS =====
@api_router.post("/auth/register", response_model=UserResponse)
def register(user: UserRegister, response: Response):
    email_lower = user.email.lower()
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM users WHERE email = ?", (email_lower,))
    existing = cursor.fetchone()
    if existing:
        conn.close()
        raise HTTPException(status_code=400, detail="Email already registered")
    
    password_hash = hash_password(user.password)
    user_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    
    cursor.execute(
        "INSERT INTO users (id, email, password_hash, name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (user_id, email_lower, password_hash, user.name, user.role, created_at)
    )
    conn.commit()
    conn.close()
    
    access_token = create_access_token(user_id, email_lower)
    refresh_token = create_refresh_token(user_id)
    
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=True, samesite="none", max_age=900, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=True, samesite="none", max_age=604800, path="/")
    
    return {"_id": user_id, "email": email_lower, "name": user.name, "role": user.role, "created_at": created_at, "access_token": access_token}

@api_router.post("/auth/login")
def login(credentials: UserLogin, response: Response):
    email_lower = credentials.email.lower()
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE email = ?", (email_lower,))
    user_row = cursor.fetchone()
    conn.close()
    
    if not user_row or not verify_password(credentials.password, user_row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    user_id = user_row["id"]
    access_token = create_access_token(user_id, email_lower)
    refresh_token = create_refresh_token(user_id)
    
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=True, samesite="none", max_age=900, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=True, samesite="none", max_age=604800, path="/")
    
    user = dict(user_row)
    user["_id"] = user.pop("id")
    user.pop("password_hash", None)
    user["access_token"] = access_token
    return user

@api_router.get("/auth/me")
def get_me(current_user: dict = Depends(get_current_user)):
    return current_user

@api_router.post("/auth/logout")
def logout(response: Response):
    cookie_kwargs = {"path": "/", "secure": True, "samesite": "none", "httponly": True}
    response.delete_cookie("access_token", **cookie_kwargs)
    response.delete_cookie("refresh_token", **cookie_kwargs)
    return {"message": "Logged out successfully"}

# ===== PRODUCTS ENDPOINTS =====
@api_router.post("/products", response_model=ProductResponse)
def create_product(product: ProductCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM products WHERE sku = ?", (product.sku,))
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="SKU already exists")
    
    product_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    
    cursor.execute(
        "INSERT INTO products (id, sku, name, description, low_stock_threshold, unit, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (product_id, product.sku, product.name, product.description, product.low_stock_threshold, product.unit, created_at)
    )
    conn.commit()
    conn.close()
    
    return {
        "id": product_id,
        "sku": product.sku,
        "name": product.name,
        "description": product.description,
        "low_stock_threshold": product.low_stock_threshold,
        "unit": product.unit,
        "created_at": created_at,
        "current_stock": 0
    }

@api_router.get("/products", response_model=List[ProductResponse])
def get_products(current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = """
    SELECT p.*, COALESCE(SUM(s.quantity_change), 0) as current_stock
    FROM products p
    LEFT JOIN stock_ledger s ON p.id = s.product_id
    GROUP BY p.id
    """
    cursor.execute(query)
    products = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return products

@api_router.put("/products/{product_id}")
def update_product(product_id: str, product: ProductCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE products SET sku=?, name=?, description=?, low_stock_threshold=?, unit=? WHERE id=?",
        (product.sku, product.name, product.description, product.low_stock_threshold, product.unit, product_id)
    )
    if cursor.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Product not found")
    
    conn.commit()
    conn.close()
    return {"message": "Product updated"}

@api_router.delete("/products/{product_id}")
def delete_product(product_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM products WHERE id=?", (product_id,))
    if cursor.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Product not found")
    
    conn.commit()
    conn.close()
    return {"message": "Product deleted"}

# ===== LOCATIONS ENDPOINTS =====
@api_router.post("/locations", response_model=LocationResponse)
def create_location(location: LocationCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    location_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO locations (id, warehouse_id, zone, aisle, bin, capacity, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (location_id, location.warehouse_id, location.zone, location.aisle, location.bin, location.capacity, created_at)
    )
    conn.commit()
    conn.close()
    
    return {
        "id": location_id,
        "warehouse_id": location.warehouse_id,
        "zone": location.zone,
        "aisle": location.aisle,
        "bin": location.bin,
        "capacity": location.capacity,
        "created_at": created_at
    }

@api_router.get("/locations", response_model=List[LocationResponse])
def get_locations(current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM locations")
    locations = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return locations

@api_router.put("/locations/{location_id}")
def update_location(location_id: str, location: LocationCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE locations SET warehouse_id=?, zone=?, aisle=?, bin=?, capacity=? WHERE id=?",
        (location.warehouse_id, location.zone, location.aisle, location.bin, location.capacity, location_id)
    )
    if cursor.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Location not found")
    
    conn.commit()
    conn.close()
    return {"message": "Location updated"}

@api_router.delete("/locations/{location_id}")
def delete_location(location_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM locations WHERE id=?", (location_id,))
    if cursor.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Location not found")
    
    conn.commit()
    conn.close()
    return {"message": "Location deleted"}

# ===== STOCK LEDGER ENDPOINTS =====
@api_router.post("/stock/transaction", response_model=StockLedgerResponse)
def create_stock_transaction(transaction: StockLedgerCreate, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id FROM products WHERE id=?", (transaction.product_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Product not found")
    
    cursor.execute("SELECT id FROM locations WHERE id=?", (transaction.location_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Location not found")
    
    ledger_id = str(uuid.uuid4())
    timestamp = datetime.now(timezone.utc).isoformat()
    
    cursor.execute(
        "INSERT INTO stock_ledger (id, product_id, location_id, user_id, transaction_type, quantity_change, reference_number, notes, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (ledger_id, transaction.product_id, transaction.location_id, current_user["_id"], transaction.transaction_type, transaction.quantity_change, transaction.reference_number, transaction.notes, timestamp)
    )
    conn.commit()
    conn.close()
    
    return {
        "id": ledger_id,
        "product_id": transaction.product_id,
        "location_id": transaction.location_id,
        "user_id": current_user["_id"],
        "transaction_type": transaction.transaction_type,
        "quantity_change": transaction.quantity_change,
        "reference_number": transaction.reference_number,
        "notes": transaction.notes,
        "timestamp": timestamp
    }

@api_router.get("/stock/ledger", response_model=List[StockLedgerResponse])
def get_stock_ledger(current_user: dict = Depends(get_current_user), limit: int = 100):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM stock_ledger ORDER BY timestamp DESC LIMIT ?", (limit,))
    ledger = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return ledger

@api_router.get("/stock/product/{product_id}", response_model=List[StockLedgerResponse])
def get_product_stock_ledger(product_id: str, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM stock_ledger WHERE product_id=? ORDER BY timestamp DESC LIMIT 1000", (product_id,))
    ledger = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return ledger

# ===== DASHBOARD ENDPOINTS =====
@api_router.get("/dashboard/stats", response_model=DashboardStats)
def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT COUNT(*) FROM products")
    total_products = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM locations")
    total_locations = cursor.fetchone()[0]
    
    cursor.execute("SELECT COALESCE(SUM(quantity_change), 0) FROM stock_ledger")
    total_stock = cursor.fetchone()[0]
    
    query = """
    SELECT p.id
    FROM products p
    LEFT JOIN stock_ledger s ON p.id = s.product_id
    GROUP BY p.id
    HAVING COALESCE(SUM(s.quantity_change), 0) < p.low_stock_threshold
    """
    cursor.execute(query)
    low_stock_count = len(cursor.fetchall())
    
    seven_days_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    cursor.execute("SELECT COUNT(*) FROM stock_ledger WHERE timestamp >= ?", (seven_days_ago,))
    recent_transactions = cursor.fetchone()[0]
    
    conn.close()
    
    return {
        "total_products": total_products,
        "total_locations": total_locations,
        "total_stock": total_stock,
        "low_stock_count": low_stock_count,
        "recent_transactions": recent_transactions
    }

@api_router.get("/dashboard/low-stock", response_model=List[LowStockAlert])
def get_low_stock_alerts(current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = """
    SELECT p.id as product_id, p.sku, p.name as product_name, p.low_stock_threshold as threshold,
           COALESCE(SUM(s.quantity_change), 0) as current_stock
    FROM products p
    LEFT JOIN stock_ledger s ON p.id = s.product_id
    GROUP BY p.id
    HAVING COALESCE(SUM(s.quantity_change), 0) < p.low_stock_threshold
    """
    cursor.execute(query)
    alerts = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return alerts

# ===== MOBILE SYNC ENDPOINTS =====
@api_router.post("/sync/push")
def sync_push(payload: SyncPayload, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    synced_count = 0
    for transaction in payload.transactions:
        cursor.execute("SELECT id FROM products WHERE id=?", (transaction.product_id,))
        if not cursor.fetchone():
            continue
        
        cursor.execute("SELECT id FROM locations WHERE id=?", (transaction.location_id,))
        if not cursor.fetchone():
            continue
        
        ledger_id = str(uuid.uuid4())
        timestamp = datetime.now(timezone.utc).isoformat()
        
        cursor.execute(
            "INSERT INTO stock_ledger (id, product_id, location_id, user_id, transaction_type, quantity_change, reference_number, notes, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (ledger_id, transaction.product_id, transaction.location_id, current_user["_id"], transaction.transaction_type, transaction.quantity_change, transaction.reference_number, transaction.notes, timestamp)
        )
        synced_count += 1
        
    conn.commit()
    conn.close()
    return {"message": f"Synced {synced_count} transactions"}

@api_router.get("/sync/pull")
def sync_pull(current_user: dict = Depends(get_current_user), last_sync: Optional[str] = None):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if last_sync:
        cursor.execute("SELECT * FROM stock_ledger WHERE timestamp > ? LIMIT 500", (last_sync,))
    else:
        cursor.execute("SELECT * FROM stock_ledger LIMIT 500")
        
    transactions = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return {"transactions": transactions}

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        password_hash TEXT,
        name TEXT,
        role TEXT,
        created_at TEXT
    )
    """)
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        sku TEXT UNIQUE,
        name TEXT,
        description TEXT,
        low_stock_threshold INTEGER,
        unit TEXT,
        created_at TEXT
    )
    """)
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS locations (
        id TEXT PRIMARY KEY,
        warehouse_id TEXT,
        zone TEXT,
        aisle TEXT,
        bin TEXT,
        capacity INTEGER,
        created_at TEXT
    )
    """)
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS stock_ledger (
        id TEXT PRIMARY KEY,
        product_id TEXT,
        location_id TEXT,
        user_id TEXT,
        transaction_type TEXT,
        quantity_change INTEGER,
        reference_number TEXT,
        notes TEXT,
        timestamp TEXT
    )
    """)
    
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_stock_product ON stock_ledger (product_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_stock_timestamp ON stock_ledger (timestamp)")
    
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@inventory.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "Admin@123")
    
    cursor.execute("SELECT * FROM users WHERE email = ?", (admin_email,))
    existing = cursor.fetchone()
    if existing is None:
        hashed = hash_password(admin_password)
        cursor.execute(
            "INSERT INTO users (id, email, password_hash, name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (str(uuid.uuid4()), admin_email, hashed, "Admin", "admin", datetime.now(timezone.utc).isoformat())
        )
        conn.commit()
        logger.info(f"Admin user created: {admin_email}")
    elif not verify_password(admin_password, existing["password_hash"]):
        hashed = hash_password(admin_password)
        cursor.execute("UPDATE users SET password_hash = ? WHERE email = ?", (hashed, admin_email))
        conn.commit()
        logger.info(f"Admin password updated: {admin_email}")
        
    conn.close()

@app.on_event("startup")
async def startup_event():
    if os.environ.get("VERCEL") and get_jwt_secret() == "super-secret-key-for-dev":
        logger.warning("JWT_SECRET is not set in Vercel — using an insecure default. Set JWT_SECRET in project env vars.")
    init_db()

    try:
        memory_dir = Path("/app/memory")
        memory_dir.mkdir(exist_ok=True, parents=True)
        with open(memory_dir / "test_credentials.md", "w") as f:
            admin_email = os.environ.get("ADMIN_EMAIL", "admin@inventory.com")
            admin_password = os.environ.get("ADMIN_PASSWORD", "Admin@123")
            f.write(f"# Test Credentials\n\n")
            f.write(f"## Admin Account\n")
            f.write(f"- Email: {admin_email}\n")
            f.write(f"- Password: {admin_password}\n")
            f.write(f"- Role: admin\n\n")
            f.write(f"## Auth Endpoints\n")
            f.write(f"- POST /api/auth/login\n")
            f.write(f"- POST /api/auth/register\n")
            f.write(f"- GET /api/auth/me\n")
            f.write(f"- POST /api/auth/logout\n")
    except Exception as e:
        logger.warning(f"Could not write test_credentials.md: {e}")

@app.on_event("shutdown")
async def shutdown_event():
    pass
