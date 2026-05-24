from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt
from bson import ObjectId
import logging
import secrets

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

JWT_ALGORITHM = "HS256"

# ===== AUTH UTILITIES =====
def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]

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

async def get_current_user(request: Request) -> dict:
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
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user["_id"] = str(user["_id"])
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
async def register(user: UserRegister, response: Response):
    email_lower = user.email.lower()
    existing = await db.users.find_one({"email": email_lower})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    password_hash = hash_password(user.password)
    user_doc = {
        "email": email_lower,
        "password_hash": password_hash,
        "name": user.name,
        "role": user.role,
        "created_at": datetime.now(timezone.utc)
    }
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)
    
    access_token = create_access_token(user_id, email_lower)
    refresh_token = create_refresh_token(user_id)
    
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=True, samesite="none", max_age=900, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=True, samesite="none", max_age=604800, path="/")
    
    user_doc.pop("_id", None)
    user_doc.pop("password_hash", None)
    return {"_id": user_id, "access_token": access_token, **user_doc}

@api_router.post("/auth/login")
async def login(credentials: UserLogin, response: Response):
    email_lower = credentials.email.lower()
    user = await db.users.find_one({"email": email_lower})
    if not user or not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    user_id = str(user["_id"])
    access_token = create_access_token(user_id, email_lower)
    refresh_token = create_refresh_token(user_id)
    
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=True, samesite="none", max_age=900, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=True, samesite="none", max_age=604800, path="/")
    
    user["_id"] = user_id
    user.pop("password_hash", None)
    user["access_token"] = access_token
    return user

@api_router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return current_user

@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")
    return {"message": "Logged out successfully"}

# ===== PRODUCTS ENDPOINTS =====
@api_router.post("/products", response_model=ProductResponse)
async def create_product(product: ProductCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    existing = await db.products.find_one({"sku": product.sku})
    if existing:
        raise HTTPException(status_code=400, detail="SKU already exists")
    
    product_doc = {
        "id": str(uuid.uuid4()),
        **product.model_dump(),
        "created_at": datetime.now(timezone.utc)
    }
    await db.products.insert_one(product_doc)
    
    pipeline = [
        {"$match": {"id": product_doc["id"]}},
        {"$lookup": {
            "from": "stock_ledger",
            "localField": "id",
            "foreignField": "product_id",
            "as": "ledger"
        }},
        {"$addFields": {
            "current_stock": {"$sum": "$ledger.quantity_change"}
        }},
        {"$project": {"_id": 0, "ledger": 0}}
    ]
    result = await db.products.aggregate(pipeline).to_list(1)
    return result[0]

@api_router.get("/products", response_model=List[ProductResponse])
async def get_products(current_user: dict = Depends(get_current_user)):
    pipeline = [
        {"$lookup": {
            "from": "stock_ledger",
            "localField": "id",
            "foreignField": "product_id",
            "as": "ledger"
        }},
        {"$addFields": {
            "current_stock": {"$sum": "$ledger.quantity_change"}
        }},
        {"$project": {"_id": 0, "ledger": 0}}
    ]
    products = await db.products.aggregate(pipeline).to_list(1000)
    return products

@api_router.put("/products/{product_id}")
async def update_product(product_id: str, product: ProductCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    result = await db.products.update_one(
        {"id": product_id},
        {"$set": product.model_dump()}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"message": "Product updated"}

@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    result = await db.products.delete_one({"id": product_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"message": "Product deleted"}

# ===== LOCATIONS ENDPOINTS =====
@api_router.post("/locations", response_model=LocationResponse)
async def create_location(location: LocationCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    location_doc = {
        "id": str(uuid.uuid4()),
        **location.model_dump(),
        "created_at": datetime.now(timezone.utc)
    }
    await db.locations.insert_one(location_doc)
    location_doc.pop("_id", None)
    return location_doc

@api_router.get("/locations", response_model=List[LocationResponse])
async def get_locations(current_user: dict = Depends(get_current_user)):
    locations = await db.locations.find({}, {"_id": 0}).to_list(1000)
    return locations

@api_router.put("/locations/{location_id}")
async def update_location(location_id: str, location: LocationCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    result = await db.locations.update_one(
        {"id": location_id},
        {"$set": location.model_dump()}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Location not found")
    return {"message": "Location updated"}

@api_router.delete("/locations/{location_id}")
async def delete_location(location_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    result = await db.locations.delete_one({"id": location_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Location not found")
    return {"message": "Location deleted"}

# ===== STOCK LEDGER ENDPOINTS =====
@api_router.post("/stock/transaction", response_model=StockLedgerResponse)
async def create_stock_transaction(transaction: StockLedgerCreate, current_user: dict = Depends(get_current_user)):
    product = await db.products.find_one({"id": transaction.product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    location = await db.locations.find_one({"id": transaction.location_id}, {"_id": 0})
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    
    ledger_doc = {
        "id": str(uuid.uuid4()),
        **transaction.model_dump(),
        "user_id": current_user["_id"],
        "timestamp": datetime.now(timezone.utc)
    }
    await db.stock_ledger.insert_one(ledger_doc)
    ledger_doc.pop("_id", None)
    return ledger_doc

@api_router.get("/stock/ledger", response_model=List[StockLedgerResponse])
async def get_stock_ledger(current_user: dict = Depends(get_current_user), limit: int = 100):
    ledger = await db.stock_ledger.find({}, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)
    return ledger

@api_router.get("/stock/product/{product_id}", response_model=List[StockLedgerResponse])
async def get_product_stock_ledger(product_id: str, current_user: dict = Depends(get_current_user)):
    ledger = await db.stock_ledger.find({"product_id": product_id}, {"_id": 0}).sort("timestamp", -1).to_list(1000)
    return ledger

# ===== DASHBOARD ENDPOINTS =====
@api_router.get("/dashboard/stats", response_model=DashboardStats)
async def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    total_products = await db.products.count_documents({})
    total_locations = await db.locations.count_documents({})
    
    pipeline = [
        {"$group": {"_id": None, "total": {"$sum": "$quantity_change"}}}
    ]
    result = await db.stock_ledger.aggregate(pipeline).to_list(1)
    total_stock = result[0]["total"] if result else 0
    
    products_pipeline = [
        {"$lookup": {
            "from": "stock_ledger",
            "localField": "id",
            "foreignField": "product_id",
            "as": "ledger"
        }},
        {"$addFields": {
            "current_stock": {"$sum": "$ledger.quantity_change"}
        }},
        {"$match": {
            "$expr": {"$lt": ["$current_stock", "$low_stock_threshold"]}
        }}
    ]
    low_stock_products = await db.products.aggregate(products_pipeline).to_list(1000)
    low_stock_count = len(low_stock_products)
    
    recent_transactions = await db.stock_ledger.count_documents({
        "timestamp": {"$gte": datetime.now(timezone.utc) - timedelta(days=7)}
    })
    
    return {
        "total_products": total_products,
        "total_locations": total_locations,
        "total_stock": total_stock,
        "low_stock_count": low_stock_count,
        "recent_transactions": recent_transactions
    }

@api_router.get("/dashboard/low-stock", response_model=List[LowStockAlert])
async def get_low_stock_alerts(current_user: dict = Depends(get_current_user)):
    pipeline = [
        {"$lookup": {
            "from": "stock_ledger",
            "localField": "id",
            "foreignField": "product_id",
            "as": "ledger"
        }},
        {"$addFields": {
            "current_stock": {"$sum": "$ledger.quantity_change"}
        }},
        {"$match": {
            "$expr": {"$lt": ["$current_stock", "$low_stock_threshold"]}
        }},
        {"$project": {
            "_id": 0,
            "product_id": "$id",
            "sku": 1,
            "product_name": "$name",
            "current_stock": 1,
            "threshold": "$low_stock_threshold"
        }}
    ]
    alerts = await db.products.aggregate(pipeline).to_list(1000)
    return alerts

# ===== MOBILE SYNC ENDPOINTS =====
@api_router.post("/sync/push")
async def sync_push(payload: SyncPayload, current_user: dict = Depends(get_current_user)):
    for transaction in payload.transactions:
        product = await db.products.find_one({"id": transaction.product_id}, {"_id": 0})
        if not product:
            continue
        
        location = await db.locations.find_one({"id": transaction.location_id}, {"_id": 0})
        if not location:
            continue
        
        ledger_doc = {
            "id": str(uuid.uuid4()),
            **transaction.model_dump(),
            "user_id": current_user["_id"],
            "timestamp": datetime.now(timezone.utc)
        }
        await db.stock_ledger.insert_one(ledger_doc)
    
    return {"message": f"Synced {len(payload.transactions)} transactions"}

@api_router.get("/sync/pull")
async def sync_pull(current_user: dict = Depends(get_current_user), last_sync: Optional[str] = None):
    query = {}
    if last_sync:
        query["timestamp"] = {"$gt": datetime.fromisoformat(last_sync)}
    
    transactions = await db.stock_ledger.find(query, {"_id": 0}).limit(500).to_list(500)
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

@app.on_event("startup")
async def startup_event():
    await db.users.create_index("email", unique=True)
    await db.products.create_index("sku", unique=True)
    await db.products.create_index("id", unique=True)
    await db.locations.create_index("id", unique=True)
    await db.stock_ledger.create_index("product_id")
    await db.stock_ledger.create_index("timestamp")
    
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@inventory.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "Admin@123")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        hashed = hash_password(admin_password)
        await db.users.insert_one({
            "email": admin_email,
            "password_hash": hashed,
            "name": "Admin",
            "role": "admin",
            "created_at": datetime.now(timezone.utc)
        })
        logger.info(f"Admin user created: {admin_email}")
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})
        logger.info(f"Admin password updated: {admin_email}")
    
    Path("/app/memory").mkdir(exist_ok=True)
    with open("/app/memory/test_credentials.md", "w") as f:
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

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
