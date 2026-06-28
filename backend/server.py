from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from dotenv import load_dotenv
from pathlib import Path
import os
import psycopg2
import psycopg2.extras
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt
import logging
import secrets
import hashlib
import threading
import time
from collections import defaultdict

from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional, Literal

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

DATABASE_URL = os.environ.get('DATABASE_URL')

def get_db_connection(init=True):
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    if init:
        try:
            with conn.cursor() as cursor:
                cursor.execute("""
                    SELECT table_name 
                    FROM information_schema.tables 
                    WHERE table_schema = 'public' AND table_name = 'users'
                """)
                if not cursor.fetchone():
                    init_db()
        except Exception:
            pass
    return conn

app = FastAPI()
api_router = APIRouter(prefix="/api")

JWT_ALGORITHM = "HS256"

# ===== RATE LIMITING UTILITIES =====
class RateLimiter:
    def __init__(self):
        self.lock = threading.Lock()
        self.attempts = defaultdict(list)
        self.lockouts = {}
        
    def check_limit(self, key: str, limit: int, window_seconds: int, lockout_seconds: int = 0) -> bool:
        now = time.time()
        with self.lock:
            if lockout_seconds and key in self.lockouts:
                if now < self.lockouts[key]:
                    return False
                else:
                    del self.lockouts[key]
            
            cutoff = now - window_seconds
            self.attempts[key] = [t for t in self.attempts[key] if t > cutoff]
            
            if len(self.attempts[key]) >= limit:
                if lockout_seconds:
                    self.lockouts[key] = now + lockout_seconds
                return False
                
            self.attempts[key].append(now)
            return True

    def is_locked_out(self, key: str) -> bool:
        now = time.time()
        with self.lock:
            if key in self.lockouts:
                if now < self.lockouts[key]:
                    return True
                else:
                    del self.lockouts[key]
            return False
            
    def record_attempt(self, key: str, limit: int, window_seconds: int, lockout_seconds: int = 0):
        now = time.time()
        with self.lock:
            cutoff = now - window_seconds
            self.attempts[key] = [t for t in self.attempts[key] if t > cutoff]
            self.attempts[key].append(now)
            if len(self.attempts[key]) >= limit:
                if lockout_seconds:
                    self.lockouts[key] = now + lockout_seconds
                      
    def clear(self, key: str):
        with self.lock:
            self.attempts.pop(key, None)
            self.lockouts.pop(key, None)

# Global rate limiter instances
login_limiter = RateLimiter()
forgot_pw_limiter = RateLimiter()
verify_otp_limiter = RateLimiter()
reset_pw_limiter = RateLimiter()

# ===== NOTIFICATION UTILITIES =====
def dispatch_sms_whatsapp_alert(to_phone: str, message: str):
    logger.info(f"\n======================================================\n[SIMULATED SMS/WHATSAPP ALERT] Sent to {to_phone}:\n{message}\n======================================================\n")

LOW_STOCK_TEMPLATES = {
    "en": "Low Stock Alert: Product '{product_name}' has dropped to {total_stock} units (Threshold: {threshold} units) in your shop.",
    "hi": "कम स्टॉक चेतावनी: आपके स्टोर में उत्पाद '{product_name}' घटकर {total_stock} यूनिट रह गया है (सीमा: {threshold} यूनिट)।",
    "kn": "ಕಡಿಮೆ ಸ್ಟಾಕ್ ಎಚ್ಚರಿಕೆ: ನಿಮ್ಮ ಅಂಗಡಿಯಲ್ಲಿ '{product_name}' ಉತ್ಪನ್ನವು {total_stock} ಯುನಿಟ್‌ಗಳಿಗೆ ಇಳಿದಿದೆ (ಮಿತಿ: {threshold} ಯುನಿಟ್‌ಗಳು).",
    "ta": "குறைந்த இருப்பு எச்சரிக்கை: உங்கள் கடையில் '{product_name}' தயாரிப்பு {total_stock} அலகுகளாகக் குறைந்துள்ளது (வரம்பு: {threshold} அலகுகள்).",
    "te": "తక్కువ స్టాక్ హెచ్చరిక: మీ దుకాణంలో '{product_name}' ఉత్పత్తి {total_stock} యూనిట్లకు పడిపోయింది (పరిమిति: {threshold} యూనిట్లు).",
    "mr": "कमी स्टॉक अलर्ट: तुमच्या दुकानात '{product_name}' उत्पादन {total_stock} युनिट्सवर आले आहे (मर्यादा: {threshold} युनिट्स)."
}

def check_and_trigger_low_stock_alert(product_id: str, shop_id: str, cursor):
    # Check current stock
    cursor.execute("SELECT COALESCE(SUM(quantity_change), 0) as total FROM stock_ledger WHERE product_id = %s AND shop_id = %s", (product_id, shop_id))
    total_stock = float(cursor.fetchone()["total"])
    
    # Get product threshold
    cursor.execute("SELECT name, low_stock_threshold FROM products WHERE id = %s AND shop_id = %s", (product_id, shop_id))
    prod = cursor.fetchone()
    if not prod:
        return
        
    threshold = float(prod["low_stock_threshold"])
    
    if total_stock <= threshold:
        cursor.execute("SELECT phone, language_code FROM users WHERE shop_id = %s AND role = 'admin' LIMIT 1", (shop_id,))
        admin = cursor.fetchone()
        admin_phone = admin["phone"] if (admin and admin["phone"]) else "+919876543210"
        lang = admin["language_code"] if (admin and admin["language_code"]) else "en"
        
        template = LOW_STOCK_TEMPLATES.get(lang, LOW_STOCK_TEMPLATES["en"])
        msg = template.format(product_name=prod['name'], total_stock=total_stock, threshold=threshold)
        dispatch_sms_whatsapp_alert(admin_phone, msg)

# ===== AUTH UTILITIES =====
def get_jwt_secret() -> str:
    return os.environ.get("JWT_SECRET", "super-secret-key-for-dev")

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))

def create_access_token(user_id: str, email: str, session_id: Optional[str] = None) -> str:
    payload = {"sub": user_id, "email": email, "exp": datetime.now(timezone.utc) + timedelta(minutes=15), "type": "access"}
    if session_id:
        payload["session_id"] = session_id
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
        
        session_id = payload.get("session_id")
        if not session_id:
            raise HTTPException(status_code=401, detail="Session ID missing from token")
            
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM sessions WHERE id = %s AND user_id = %s", (session_id, payload["sub"]))
        session_row = cursor.fetchone()
        if not session_row:
            conn.close()
            raise HTTPException(status_code=401, detail="Session expired or logged out")
            
        cursor.execute("UPDATE sessions SET last_active = NOW() WHERE id = %s", (session_id,))
        conn.commit()
        
        cursor.execute("SELECT * FROM users WHERE id = %s", (payload["sub"],))
        user_row = cursor.fetchone()
        conn.close()
        
        if not user_row:
            raise HTTPException(status_code=401, detail="User not found")
        
        user = dict(user_row)
        user["_id"] = user.pop("id")
        user.pop("password_hash", None)
        user["session_id"] = session_id
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ===== MODELS =====
class UserRegister(BaseModel):
    email: str
    password: str
    name: str
    role: Literal["admin", "worker"] = "worker"
    shop_id: Optional[str] = None
    security_question: Optional[str] = "What is your shop name?"
    security_answer: Optional[str] = "default"
    phone: Optional[str] = None
    language_code: Optional[str] = "en"

class UserLogin(BaseModel):
    email: str
    password: str
    device_label: Optional[str] = "Web Browser"

class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(alias="_id")
    email: str
    name: str
    role: str
    shop_id: Optional[str] = None
    created_at: datetime

class ForgotPasswordRequest(BaseModel):
    email: str

class VerifyOTPRequest(BaseModel):
    email: str
    otp: str

class ResetPasswordOTPRequest(BaseModel):
    reset_token: str
    new_password: str

class SessionResponse(BaseModel):
    id: str
    device_label: Optional[str] = None
    last_active: datetime
    created_at: datetime

class ProductCreate(BaseModel):
    sku: str
    name: str
    description: Optional[str] = None
    low_stock_threshold: int = 10
    unit: str = "units"
    price: float = 0.0
    cost_price: float = 0.0
    selling_price: float = 0.0
    category: Optional[str] = None
    barcode: Optional[str] = None

class ProductResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    sku: str
    name: str
    description: Optional[str] = None
    low_stock_threshold: int
    unit: str
    current_stock: float = 0.0
    price: float = 0.0
    cost_price: float = 0.0
    selling_price: float = 0.0
    category: Optional[str] = None
    barcode: Optional[str] = None
    inventory_value: float = 0.0
    is_low_stock: bool = False
    is_archived: bool = False
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
    is_archived: bool = False
    created_at: datetime

class SupplierCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None

class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None

class SupplierResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    shop_id: str
    created_at: datetime

class StockLedgerCreate(BaseModel):
    product_id: str
    location_id: Optional[str] = None
    transaction_type: Literal["RECEIVE", "PICK", "TRANSFER", "AUDIT"]
    quantity_change: float
    reference_number: Optional[str] = None
    notes: Optional[str] = None
    origin_location_id: Optional[str] = None
    destination_location_id: Optional[str] = None
    supplier_id: Optional[str] = None
    batch_number: Optional[str] = None
    mfg_date: Optional[str] = None
    expiry_date: Optional[str] = None

class StockLedgerResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    product_id: str
    location_id: str
    user_id: str
    transaction_type: str
    quantity_change: float
    reference_number: Optional[str] = None
    notes: Optional[str] = None
    paired_transfer_id: Optional[str] = None
    supplier_id: Optional[str] = None
    batch_number: Optional[str] = None
    mfg_date: Optional[object] = None
    expiry_date: Optional[object] = None
    timestamp: datetime

class DashboardStats(BaseModel):
    total_products: int
    total_locations: int
    total_stock: float
    low_stock_count: int
    recent_transactions: int
    total_inventory_value: float = 0.0
    expiry_alert_count: int = 0

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
    
    cursor.execute("SELECT * FROM users WHERE email = %s", (email_lower,))
    existing = cursor.fetchone()
    if existing:
        conn.close()
        raise HTTPException(status_code=400, detail="Email already registered")
    
    password_hash = hash_password(user.password)
    user_id = str(uuid.uuid4())
    shop_id = user.shop_id
    if not shop_id:
        if user.role == "worker":
            shop_id = "default-shop-uuid"
        else:
            shop_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    
    cursor.execute(
        "INSERT INTO users (id, email, password_hash, name, role, shop_id, security_question, security_answer, created_at, phone, language_code) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
        (user_id, email_lower, password_hash, user.name, user.role, shop_id, user.security_question, user.security_answer, created_at, user.phone, user.language_code)
    )
    
    # Create auto-login session
    session_id = str(uuid.uuid4())
    cursor.execute(
        "INSERT INTO sessions (id, user_id, device_label) VALUES (%s, %s, %s)",
        (session_id, user_id, "Registered Device")
    )
    
    conn.commit()
    conn.close()
    
    access_token = create_access_token(user_id, email_lower, session_id)
    refresh_token = create_refresh_token(user_id)
    
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=True, samesite="none", max_age=900, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=True, samesite="none", max_age=604800, path="/")
    
    return {"_id": user_id, "email": email_lower, "name": user.name, "role": user.role, "shop_id": shop_id, "created_at": created_at, "access_token": access_token}

@api_router.post("/auth/forgot-password")
def forgot_password(req: ForgotPasswordRequest):
    email_lower = req.email.lower()
    
    # Check rate limit (3 attempts per hour)
    if not forgot_pw_limiter.check_limit(email_lower, limit=3, window_seconds=3600):
        logger.info(f"Forgot password rate limit exceeded for: {email_lower}. Ignoring request.")
        return {"message": "OTP sent"}
        
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM users WHERE email = %s", (email_lower,))
    user_row = cursor.fetchone()
    
    if not user_row:
        conn.close()
        logger.info(f"Forgot password requested for non-existent email: {email_lower}")
        return {"message": "OTP sent"}
        
    user_id = user_row["id"]
    
    # Generate 6-digit OTP
    otp = f"{secrets.randbelow(1000000):06d}"
    otp_hash = hashlib.sha256(otp.encode("utf-8")).hexdigest()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
    
    # Store OTP
    cursor.execute(
        "INSERT INTO otp_store (id, user_id, otp_hash, expires_at) VALUES (%s, %s, %s, %s)",
        (str(uuid.uuid4()), user_id, otp_hash, expires_at)
    )
    conn.commit()
    conn.close()
    
    # Simulate dispatch
    logger.info(f"\n======================================================\n[SIMULATED SMS/EMAIL] OTP Code for {email_lower}: {otp}\n======================================================\n")
    
    return {"message": "OTP sent"}

@api_router.post("/auth/verify-otp")
def verify_otp(req: VerifyOTPRequest):
    email_lower = req.email.lower()
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM users WHERE email = %s", (email_lower,))
    user_row = cursor.fetchone()
    if not user_row:
        conn.close()
        raise HTTPException(status_code=400, detail="Invalid email or OTP")
        
    user_id = user_row["id"]
    
    cursor.execute(
        "SELECT * FROM otp_store WHERE user_id = %s AND used = FALSE AND expires_at > %s ORDER BY created_at DESC LIMIT 1",
        (user_id, datetime.now(timezone.utc))
    )
    otp_record = cursor.fetchone()
    if not otp_record:
        conn.close()
        raise HTTPException(status_code=400, detail="OTP expired, used, or not found")
        
    otp_record_id = otp_record["id"]
    
    # Check rate limit (5 attempts)
    if verify_otp_limiter.is_locked_out(otp_record_id):
        cursor.execute("UPDATE otp_store SET used = TRUE WHERE id = %s", (otp_record_id,))
        conn.commit()
        conn.close()
        raise HTTPException(status_code=429, detail="Too many failed OTP attempts. This OTP has been invalidated.")
        
    submitted_otp_hash = hashlib.sha256(req.otp.strip().encode("utf-8")).hexdigest()
    if otp_record["otp_hash"] != submitted_otp_hash:
        verify_otp_limiter.record_attempt(otp_record_id, limit=5, window_seconds=3600, lockout_seconds=3600)
        if verify_otp_limiter.is_locked_out(otp_record_id):
            cursor.execute("UPDATE otp_store SET used = TRUE WHERE id = %s", (otp_record_id,))
            conn.commit()
            conn.close()
            raise HTTPException(status_code=400, detail="Incorrect OTP. Too many failed attempts, OTP has been invalidated.")
        conn.close()
        raise HTTPException(status_code=400, detail="Invalid OTP")
        
    verify_otp_limiter.clear(otp_record_id)
    reset_token = str(uuid.uuid4())
    token_expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    
    cursor.execute(
        "UPDATE otp_store SET used = TRUE, reset_token = %s, expires_at = %s WHERE id = %s",
        (reset_token, token_expires_at, otp_record_id)
    )
    conn.commit()
    conn.close()
    
    return {"reset_token": reset_token}

@api_router.post("/auth/reset-password")
def reset_password(req: ResetPasswordOTPRequest):
    reset_token = req.reset_token.strip()
    
    if reset_pw_limiter.is_locked_out(reset_token):
        raise HTTPException(status_code=429, detail="Reset token invalidated due to too many attempts.")
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute(
        "SELECT * FROM otp_store WHERE reset_token = %s AND expires_at > %s",
        (reset_token, datetime.now(timezone.utc))
    )
    otp_record = cursor.fetchone()
    if not otp_record:
        reset_pw_limiter.record_attempt(reset_token, limit=3, window_seconds=600, lockout_seconds=600)
        if reset_pw_limiter.is_locked_out(reset_token):
            cursor.execute("UPDATE otp_store SET expires_at = %s WHERE reset_token = %s", (datetime.now(timezone.utc) - timedelta(seconds=1), reset_token))
            conn.commit()
        conn.close()
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
        
    hashed = hash_password(req.new_password)
    cursor.execute("UPDATE users SET password_hash = %s WHERE id = %s", (hashed, otp_record["user_id"]))
    cursor.execute("UPDATE otp_store SET expires_at = %s WHERE id = %s", (datetime.now(timezone.utc) - timedelta(seconds=1), otp_record["id"]))
    conn.commit()
    conn.close()
    
    reset_pw_limiter.clear(reset_token)
    return {"message": "Password reset successfully"}
 
@api_router.post("/auth/login")
def login(credentials: UserLogin, response: Response):
    email_lower = credentials.email.lower()
    
    if login_limiter.is_locked_out(email_lower):
        raise HTTPException(status_code=429, detail="Too many failed login attempts. Please try again after 15 minutes.")
        
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE email = %s", (email_lower,))
    user_row = cursor.fetchone()
    
    if not user_row or not verify_password(credentials.password, user_row["password_hash"]):
        conn.close()
        login_limiter.record_attempt(email_lower, limit=5, window_seconds=900, lockout_seconds=900)
        raise HTTPException(status_code=401, detail="Invalid email or password")
        
    login_limiter.clear(email_lower)
    
    user_id = user_row["id"]
    
    # Enforce max 2 sessions
    cursor.execute("SELECT COUNT(*) as count FROM sessions WHERE user_id = %s", (user_id,))
    session_count = cursor.fetchone()["count"]
    if session_count >= 2:
        conn.close()
        raise HTTPException(status_code=409, detail="Maximum active sessions reached. Please log out from another device first.")
        
    session_id = str(uuid.uuid4())
    cursor.execute(
        "INSERT INTO sessions (id, user_id, device_label) VALUES (%s, %s, %s)",
        (session_id, user_id, credentials.device_label)
    )
    conn.commit()
    conn.close()
    
    access_token = create_access_token(user_id, email_lower, session_id)
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
def logout(response: Response, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM sessions WHERE id = %s", (current_user["session_id"],))
    conn.commit()
    conn.close()
    
    cookie_kwargs = {"path": "/", "secure": True, "samesite": "none", "httponly": True}
    response.delete_cookie("access_token", **cookie_kwargs)
    response.delete_cookie("refresh_token", **cookie_kwargs)
    return {"message": "Logged out successfully"}

@api_router.get("/auth/sessions", response_model=List[SessionResponse])
def get_active_sessions(current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, device_label, last_active, created_at FROM sessions WHERE user_id = %s ORDER BY last_active DESC", (current_user["_id"],))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

@api_router.delete("/auth/sessions/{session_id}")
def delete_active_session(session_id: str, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT user_id FROM sessions WHERE id = %s", (session_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Session not found")
        
    if current_user["role"] != "admin" and row["user_id"] != current_user["_id"]:
        conn.close()
        raise HTTPException(status_code=403, detail="Forbidden: Cannot revoke other users' sessions unless Admin")
        
    cursor.execute("DELETE FROM sessions WHERE id = %s", (session_id,))
    conn.commit()
    conn.close()
    return {"message": "Session revoked successfully"}

# ===== PRODUCTS ENDPOINTS =====
@api_router.post("/products", response_model=ProductResponse)
def create_product(product: ProductCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM products WHERE sku = %s AND shop_id = %s", (product.sku, current_user["shop_id"]))
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="SKU already exists")
        
    if product.barcode:
        cursor.execute("SELECT * FROM products WHERE barcode = %s AND shop_id = %s", (product.barcode, current_user["shop_id"]))
        if cursor.fetchone():
            conn.close()
            raise HTTPException(status_code=400, detail="Barcode already exists in this shop")
    
    product_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    
    cursor.execute(
        "INSERT INTO products (id, sku, name, description, low_stock_threshold, unit, price, shop_id, created_at, cost_price, selling_price, category, barcode) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
        (product_id, product.sku, product.name, product.description, product.low_stock_threshold, product.unit, product.price, current_user["shop_id"], created_at, product.cost_price, product.selling_price, product.category, product.barcode)
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
        "price": product.price,
        "cost_price": product.cost_price,
        "selling_price": product.selling_price,
        "category": product.category,
        "barcode": product.barcode,
        "created_at": created_at,
        "current_stock": 0.0,
        "inventory_value": 0.0,
        "is_low_stock": 0.0 <= product.low_stock_threshold,
        "is_archived": False
    }

@api_router.get("/products", response_model=List[ProductResponse])
def get_products(include_archived: bool = False, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    archive_filter = "" if include_archived else "AND p.is_archived = FALSE"
    
    query = f"""
    SELECT p.*, COALESCE(SUM(s.quantity_change), 0) as current_stock
    FROM products p
    LEFT JOIN stock_ledger s ON p.id = s.product_id AND s.shop_id = %s
    WHERE p.shop_id = %s {archive_filter}
    GROUP BY p.id
    """
    cursor.execute(query, (current_user["shop_id"], current_user["shop_id"]))
    rows = cursor.fetchall()
    conn.close()
    
    products = []
    for row in rows:
        p = dict(row)
        current_stock = float(p["current_stock"])
        cost_price = float(p.get("cost_price") or 0.0)
        p["current_stock"] = current_stock
        p["inventory_value"] = current_stock * cost_price
        p["is_low_stock"] = current_stock <= (p.get("low_stock_threshold") or 10)
        products.append(p)
        
    return products

@api_router.put("/products/{product_id}")
def update_product(product_id: str, product: ProductCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id FROM products WHERE id=%s AND shop_id=%s", (product_id, current_user["shop_id"]))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Product not found")
        
    if product.barcode:
        cursor.execute("SELECT * FROM products WHERE barcode = %s AND shop_id = %s AND id != %s", (product.barcode, current_user["shop_id"], product_id))
        if cursor.fetchone():
            conn.close()
            raise HTTPException(status_code=400, detail="Barcode already exists in this shop")
            
    cursor.execute(
        "UPDATE products SET sku=%s, name=%s, description=%s, low_stock_threshold=%s, unit=%s, price=%s, cost_price=%s, selling_price=%s, category=%s, barcode=%s WHERE id=%s AND shop_id=%s",
        (product.sku, product.name, product.description, product.low_stock_threshold, product.unit, product.price, product.cost_price, product.selling_price, product.category, product.barcode, product_id, current_user["shop_id"])
    )
    conn.commit()
    conn.close()
    return {"message": "Product updated"}

@api_router.delete("/products/{product_id}")
def delete_product(product_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id FROM products WHERE id=%s AND shop_id=%s AND is_archived = FALSE", (product_id, current_user["shop_id"]))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Product not found")
        
    cursor.execute("UPDATE products SET is_archived = TRUE WHERE id=%s AND shop_id=%s", (product_id, current_user["shop_id"]))
    conn.commit()
    conn.close()
    return {"message": "Product archived successfully"}

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
        "INSERT INTO locations (id, warehouse_id, zone, aisle, bin, capacity, shop_id, created_at) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
        (location_id, location.warehouse_id, location.zone, location.aisle, location.bin, location.capacity, current_user["shop_id"], created_at)
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
def get_locations(include_archived: bool = False, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    archive_filter = "" if include_archived else "AND is_archived = FALSE"
    cursor.execute(f"SELECT * FROM locations WHERE shop_id = %s {archive_filter}", (current_user["shop_id"],))
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
        "UPDATE locations SET warehouse_id=%s, zone=%s, aisle=%s, bin=%s, capacity=%s WHERE id=%s AND shop_id=%s",
        (location.warehouse_id, location.zone, location.aisle, location.bin, location.capacity, location_id, current_user["shop_id"])
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
    
    # Check if location exists
    cursor.execute("SELECT id FROM locations WHERE id=%s AND shop_id=%s AND is_archived = FALSE", (location_id, current_user["shop_id"]))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Location not found")
        
    cursor.execute("UPDATE locations SET is_archived = TRUE WHERE id=%s AND shop_id=%s", (location_id, current_user["shop_id"]))
    conn.commit()
    conn.close()
    return {"message": "Location archived successfully"}

# ===== SUPPLIERS ENDPOINTS =====
@api_router.get("/suppliers", response_model=List[SupplierResponse])
def get_suppliers(current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM suppliers WHERE shop_id = %s AND is_archived = FALSE ORDER BY name ASC", (current_user["shop_id"],))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

@api_router.post("/suppliers", response_model=SupplierResponse)
def create_supplier(supplier: SupplierCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    supplier_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    
    cursor.execute(
        "INSERT INTO suppliers (id, name, phone, email, address, shop_id, created_at) VALUES (%s, %s, %s, %s, %s, %s, %s)",
        (supplier_id, supplier.name, supplier.phone, supplier.email, supplier.address, current_user["shop_id"], created_at)
    )
    conn.commit()
    conn.close()
    
    return {
        "id": supplier_id,
        "name": supplier.name,
        "phone": supplier.phone,
        "email": supplier.email,
        "address": supplier.address,
        "shop_id": current_user["shop_id"],
        "created_at": created_at
    }

@api_router.put("/suppliers/{supplier_id}", response_model=SupplierResponse)
def update_supplier(supplier_id: str, supplier: SupplierUpdate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM suppliers WHERE id = %s AND shop_id = %s AND is_archived = FALSE", (supplier_id, current_user["shop_id"]))
    existing = cursor.fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Supplier not found")
        
    updates = []
    params = []
    
    for field in ["name", "phone", "email", "address"]:
        val = getattr(supplier, field)
        if val is not None:
            updates.append(f"{field} = %s")
            params.append(val)
            
    if updates:
        params.append(supplier_id)
        params.append(current_user["shop_id"])
        cursor.execute(
            f"UPDATE suppliers SET {', '.join(updates)} WHERE id = %s AND shop_id = %s",
            tuple(params)
        )
        conn.commit()
        
    cursor.execute("SELECT * FROM suppliers WHERE id = %s", (supplier_id,))
    updated_row = cursor.fetchone()
    conn.close()
    
    return dict(updated_row)

@api_router.delete("/suppliers/{supplier_id}")
def delete_supplier(supplier_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM suppliers WHERE id = %s AND shop_id = %s AND is_archived = FALSE", (supplier_id, current_user["shop_id"]))
    existing = cursor.fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Supplier not found")
        
    cursor.execute("UPDATE suppliers SET is_archived = TRUE WHERE id = %s AND shop_id = %s", (supplier_id, current_user["shop_id"]))
    conn.commit()
    conn.close()
    
    return {"message": "Supplier soft-deleted successfully"}

# ===== STOCK LEDGER ENDPOINTS =====
@api_router.post("/stock/transaction", response_model=StockLedgerResponse)
def create_stock_transaction(transaction: StockLedgerCreate, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check if product belongs to user's shop
    cursor.execute("SELECT id FROM products WHERE id=%s AND shop_id=%s", (transaction.product_id, current_user["shop_id"]))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Product not found")
        
    # Validation for dates
    if transaction.mfg_date and transaction.expiry_date:
        try:
            mfg = datetime.strptime(transaction.mfg_date[:10], "%Y-%m-%d").date()
            exp = datetime.strptime(transaction.expiry_date[:10], "%Y-%m-%d").date()
            if exp <= mfg:
                conn.close()
                raise HTTPException(status_code=400, detail="Expiry date must be after manufacturing date")
        except ValueError:
            conn.close()
            raise HTTPException(status_code=400, detail="Invalid date format, use YYYY-MM-DD")

    if transaction.batch_number and len(transaction.batch_number) > 100:
        conn.close()
        raise HTTPException(status_code=400, detail="Batch number too long")

    # If it is a TRANSFER
    if transaction.transaction_type == "TRANSFER":
        if not transaction.origin_location_id or not transaction.destination_location_id:
            conn.close()
            raise HTTPException(status_code=400, detail="Origin and destination locations are required for TRANSFER")
            
        # Verify locations
        cursor.execute("SELECT id FROM locations WHERE id=%s AND shop_id=%s", (transaction.origin_location_id, current_user["shop_id"]))
        if not cursor.fetchone():
            conn.close()
            raise HTTPException(status_code=404, detail="Origin location not found")
            
        cursor.execute("SELECT id FROM locations WHERE id=%s AND shop_id=%s", (transaction.destination_location_id, current_user["shop_id"]))
        if not cursor.fetchone():
            conn.close()
            raise HTTPException(status_code=404, detail="Destination location not found")
            
        transfer_leg_1_id = str(uuid.uuid4())
        transfer_leg_2_id = str(uuid.uuid4())
        timestamp = datetime.now(timezone.utc).isoformat()
        
        try:
            # Debit origin
            cursor.execute(
                "INSERT INTO stock_ledger (id, product_id, location_id, user_id, transaction_type, quantity_change, reference_number, notes, shop_id, timestamp, paired_transfer_id, batch_number, mfg_date, expiry_date) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (transfer_leg_1_id, transaction.product_id, transaction.origin_location_id, current_user["_id"], "TRANSFER", -abs(transaction.quantity_change), transaction.reference_number, transaction.notes, current_user["shop_id"], timestamp, transfer_leg_2_id, transaction.batch_number, transaction.mfg_date, transaction.expiry_date)
            )
            # Credit destination
            cursor.execute(
                "INSERT INTO stock_ledger (id, product_id, location_id, user_id, transaction_type, quantity_change, reference_number, notes, shop_id, timestamp, paired_transfer_id, batch_number, mfg_date, expiry_date) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (transfer_leg_2_id, transaction.product_id, transaction.destination_location_id, current_user["_id"], "TRANSFER", abs(transaction.quantity_change), transaction.reference_number, transaction.notes, current_user["shop_id"], timestamp, transfer_leg_1_id, transaction.batch_number, transaction.mfg_date, transaction.expiry_date)
            )
            conn.commit()
            
            try:
                check_and_trigger_low_stock_alert(transaction.product_id, current_user["shop_id"], cursor)
            except Exception as ae:
                logger.error(f"Error checking low stock alert: {ae}")
        except Exception as e:
            conn.rollback()
            conn.close()
            raise HTTPException(status_code=500, detail=f"Database error during atomic transfer: {e}")
            
        conn.close()
        
        return {
            "id": transfer_leg_1_id,
            "product_id": transaction.product_id,
            "location_id": transaction.origin_location_id,
            "user_id": current_user["_id"],
            "transaction_type": "TRANSFER",
            "quantity_change": -abs(transaction.quantity_change),
            "reference_number": transaction.reference_number,
            "notes": transaction.notes,
            "paired_transfer_id": transfer_leg_2_id,
            "batch_number": transaction.batch_number,
            "mfg_date": transaction.mfg_date,
            "expiry_date": transaction.expiry_date,
            "timestamp": timestamp
        }

    # If it is NOT a TRANSFER (RECEIVE, PICK, AUDIT)
    if not transaction.location_id:
        conn.close()
        raise HTTPException(status_code=400, detail="location_id is required")
        
    # Check if location belongs to user's shop
    cursor.execute("SELECT id FROM locations WHERE id=%s AND shop_id=%s", (transaction.location_id, current_user["shop_id"]))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Location not found")
        
    supplier_id_to_save = None
    if transaction.transaction_type == "RECEIVE" and transaction.supplier_id:
        cursor.execute("SELECT id FROM suppliers WHERE id=%s AND shop_id=%s AND is_archived = FALSE", (transaction.supplier_id, current_user["shop_id"]))
        if not cursor.fetchone():
            conn.close()
            raise HTTPException(status_code=400, detail="Supplier not found or archived")
        supplier_id_to_save = transaction.supplier_id
        
    ledger_id = str(uuid.uuid4())
    timestamp = datetime.now(timezone.utc).isoformat()
    
    cursor.execute(
        "INSERT INTO stock_ledger (id, product_id, location_id, user_id, transaction_type, quantity_change, reference_number, notes, shop_id, timestamp, supplier_id, batch_number, mfg_date, expiry_date) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
        (ledger_id, transaction.product_id, transaction.location_id, current_user["_id"], transaction.transaction_type, transaction.quantity_change, transaction.reference_number, transaction.notes, current_user["shop_id"], timestamp, supplier_id_to_save, transaction.batch_number, transaction.mfg_date, transaction.expiry_date)
    )
    conn.commit()
    
    try:
        check_and_trigger_low_stock_alert(transaction.product_id, current_user["shop_id"], cursor)
    except Exception as ae:
        logger.error(f"Error checking low stock alert: {ae}")
        
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
        "supplier_id": supplier_id_to_save,
        "batch_number": transaction.batch_number,
        "mfg_date": transaction.mfg_date,
        "expiry_date": transaction.expiry_date,
        "timestamp": timestamp
    }

@api_router.get("/stock/ledger", response_model=List[StockLedgerResponse])
def get_stock_ledger(current_user: dict = Depends(get_current_user), limit: int = 100):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM stock_ledger WHERE shop_id=%s ORDER BY timestamp DESC LIMIT %s", (current_user["shop_id"], limit))
    ledger = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return ledger

@api_router.get("/stock/product/{product_id}", response_model=List[StockLedgerResponse])
def get_product_stock_ledger(product_id: str, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM stock_ledger WHERE product_id=%s AND shop_id=%s ORDER BY timestamp DESC LIMIT 1000", (product_id, current_user["shop_id"]))
    ledger = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return ledger

@api_router.get("/products/{product_id}/ledger")
def get_product_ledger(
    product_id: str,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id FROM products WHERE id = %s AND shop_id = %s", (product_id, current_user["shop_id"]))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Product not found")
        
    where_clauses = ["s.product_id = %s", "s.shop_id = %s"]
    params = [product_id, current_user["shop_id"]]
    
    if from_date:
        where_clauses.append("s.timestamp >= %s")
        params.append(from_date)
    if to_date:
        where_clauses.append("s.timestamp <= %s")
        params.append(to_date)
        
    where_sql = " AND ".join(where_clauses)
    
    count_query = f"SELECT COUNT(*) as count FROM stock_ledger s WHERE {where_sql}"
    cursor.execute(count_query, tuple(params))
    total = cursor.fetchone()["count"]
    
    offset = (page - 1) * limit
    items_query = f"""
    SELECT s.*, u.name as user_name,
           'Warehouse: ' || l.warehouse_id || ', Zone: ' || l.zone || ', Aisle: ' || l.aisle || ', Bin: ' || l.bin as location_path
    FROM stock_ledger s
    JOIN users u ON s.user_id = u.id
    JOIN locations l ON s.location_id = l.id
    WHERE {where_sql}
    ORDER BY s.timestamp DESC
    LIMIT %s OFFSET %s
    """
    cursor.execute(items_query, tuple(params + [limit, offset]))
    rows = cursor.fetchall()
    conn.close()
    
    items = []
    for r in rows:
        item = dict(r)
        item["quantity_change"] = float(item["quantity_change"])
        items.append(item)
        
    return {
        "total": total,
        "page": page,
        "limit": limit,
        "items": items
    }

@api_router.get("/reports/movement")
def get_stock_movement_report(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    product_id: Optional[str] = None,
    transaction_type: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if not from_date:
        from_date = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    if not to_date:
        to_date = datetime.now(timezone.utc).isoformat()
        
    prod_query = "SELECT id, sku, name, unit FROM products WHERE shop_id = %s AND is_archived = FALSE"
    prod_params = [current_user["shop_id"]]
    if product_id:
        prod_query += " AND id = %s"
        prod_params.append(product_id)
    cursor.execute(prod_query, tuple(prod_params))
    products = cursor.fetchall()
    
    product_map = {p["id"]: {
        "product_id": p["id"],
        "sku": p["sku"],
        "name": p["name"],
        "unit": p["unit"],
        "opening_stock": 0.0,
        "received": 0.0,
        "picked": 0.0,
        "transferred": 0.0,
        "closing_stock": 0.0
    } for p in products}
    
    if not product_map:
        conn.close()
        return {"from_date": from_date, "to_date": to_date, "items": []}
        
    # Opening Stock
    open_query = """
        SELECT product_id, COALESCE(SUM(quantity_change), 0) as opening
        FROM stock_ledger
        WHERE shop_id = %s AND timestamp < %s
        GROUP BY product_id
    """
    cursor.execute(open_query, (current_user["shop_id"], from_date))
    for r in cursor.fetchall():
        if r["product_id"] in product_map:
            product_map[r["product_id"]]["opening_stock"] = float(r["opening"])
            
    # Window Transactions
    ledger_query = """
        SELECT product_id, transaction_type, COALESCE(SUM(quantity_change), 0) as total
        FROM stock_ledger
        WHERE shop_id = %s AND timestamp >= %s AND timestamp <= %s
        GROUP BY product_id, transaction_type
    """
    cursor.execute(ledger_query, (current_user["shop_id"], from_date, to_date))
    for r in cursor.fetchall():
        p_id = r["product_id"]
        if p_id in product_map:
            ttype = r["transaction_type"]
            val = float(r["total"])
            
            if transaction_type and ttype != transaction_type:
                continue
                
            if ttype == "RECEIVE":
                product_map[p_id]["received"] += val
            elif ttype == "PICK":
                product_map[p_id]["picked"] += val
            elif ttype == "TRANSFER":
                product_map[p_id]["transferred"] += val
            
    # Closing Stock
    close_query = """
        SELECT product_id, COALESCE(SUM(quantity_change), 0) as closing
        FROM stock_ledger
        WHERE shop_id = %s AND timestamp <= %s
        GROUP BY product_id
    """
    cursor.execute(close_query, (current_user["shop_id"], to_date))
    for r in cursor.fetchall():
        if r["product_id"] in product_map:
            product_map[r["product_id"]]["closing_stock"] = float(r["closing"])
            
    items = list(product_map.values())
    if transaction_type:
        if transaction_type == "RECEIVE":
            items = [it for it in items if it["received"] != 0]
        elif transaction_type == "PICK":
            items = [it for it in items if it["picked"] != 0]
        elif transaction_type == "TRANSFER":
            items = [it for it in items if it["transferred"] != 0]
            
    conn.close()
    return {
        "from_date": from_date,
        "to_date": to_date,
        "items": items
    }

@api_router.get("/reports/expiry-alerts")
def get_expiry_alerts_report(days_ahead: int = 30, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = """
        SELECT s.product_id, p.sku, p.name, s.batch_number, s.expiry_date,
               COALESCE(SUM(s.quantity_change), 0) as current_stock,
               'Warehouse: ' || l.warehouse_id || ', Zone: ' || l.zone || ', Aisle: ' || l.aisle || ', Bin: ' || l.bin as location_path
        FROM stock_ledger s
        JOIN products p ON s.product_id = p.id
        JOIN locations l ON s.location_id = l.id
        WHERE p.shop_id = %s AND p.is_archived = FALSE 
          AND s.expiry_date IS NOT NULL 
          AND s.expiry_date <= CURRENT_DATE + CAST(%s || ' days' AS INTERVAL)
          AND s.expiry_date >= CURRENT_DATE
        GROUP BY s.product_id, p.sku, p.name, s.batch_number, s.expiry_date, l.warehouse_id, l.zone, l.aisle, l.bin
        HAVING COALESCE(SUM(s.quantity_change), 0) > 0
        ORDER BY s.expiry_date ASC
    """
    cursor.execute(query, (current_user["shop_id"], str(days_ahead)))
    rows = cursor.fetchall()
    conn.close()
    
    items = []
    for r in rows:
        item = dict(r)
        item["current_stock"] = float(item["current_stock"])
        items.append(item)
        
    return items

# ===== DASHBOARD ENDPOINTS =====
@api_router.get("/dashboard/stats", response_model=DashboardStats)
def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT COUNT(*) as count FROM products WHERE shop_id = %s AND is_archived = FALSE", (current_user["shop_id"],))
    total_products = cursor.fetchone()["count"]
    
    cursor.execute("SELECT COUNT(*) as count FROM locations WHERE shop_id = %s AND is_archived = FALSE", (current_user["shop_id"],))
    total_locations = cursor.fetchone()["count"]
    
    cursor.execute("SELECT COALESCE(SUM(quantity_change), 0) as total_stock FROM stock_ledger WHERE shop_id = %s", (current_user["shop_id"],))
    total_stock = float(cursor.fetchone()["total_stock"])
    
    # Low stock count
    query = """
    SELECT p.id
    FROM products p
    LEFT JOIN stock_ledger s ON p.id = s.product_id AND s.shop_id = %s
    WHERE p.shop_id = %s AND p.is_archived = FALSE
    GROUP BY p.id, p.low_stock_threshold
    HAVING COALESCE(SUM(s.quantity_change), 0) <= p.low_stock_threshold
    """
    cursor.execute(query, (current_user["shop_id"], current_user["shop_id"]))
    low_stock_count = len(cursor.fetchall())
    
    # Recent transactions (7 days)
    seven_days_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    cursor.execute("SELECT COUNT(*) as count FROM stock_ledger WHERE timestamp >= %s AND shop_id = %s", (seven_days_ago, current_user["shop_id"]))
    recent_transactions = cursor.fetchone()["count"]
    
    # Total inventory value
    cursor.execute("""
        SELECT p.cost_price, COALESCE(SUM(s.quantity_change), 0) as current_stock
        FROM products p
        LEFT JOIN stock_ledger s ON p.id = s.product_id AND s.shop_id = %s
        WHERE p.shop_id = %s AND p.is_archived = FALSE
        GROUP BY p.id, p.cost_price
    """, (current_user["shop_id"], current_user["shop_id"]))
    value_rows = cursor.fetchall()
    total_inventory_value = sum(float(r["current_stock"]) * float(r["cost_price"] or 0.0) for r in value_rows)
    
    # Expiry alert count
    cursor.execute("""
        SELECT p.id
        FROM products p
        JOIN stock_ledger s ON p.id = s.product_id
        WHERE p.shop_id = %s AND p.is_archived = FALSE AND s.expiry_date IS NOT NULL 
          AND s.expiry_date <= CURRENT_DATE + INTERVAL '30 days' AND s.expiry_date >= CURRENT_DATE
        GROUP BY p.id
        HAVING COALESCE(SUM(s.quantity_change), 0) > 0
    """, (current_user["shop_id"],))
    expiry_alert_count = len(cursor.fetchall())
    
    conn.close()
    
    return {
        "total_products": total_products,
        "total_locations": total_locations,
        "total_stock": total_stock,
        "low_stock_count": low_stock_count,
        "recent_transactions": recent_transactions,
        "total_inventory_value": total_inventory_value,
        "expiry_alert_count": expiry_alert_count
    }
 
@api_router.get("/dashboard/low-stock", response_model=List[LowStockAlert])
def get_low_stock_alerts(current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = """
    SELECT p.id as product_id, p.sku, p.name as product_name, p.low_stock_threshold as threshold,
           COALESCE(SUM(s.quantity_change), 0) as current_stock
    FROM products p
    LEFT JOIN stock_ledger s ON p.id = s.product_id AND s.shop_id = %s
    WHERE p.shop_id = %s AND p.is_archived = FALSE
    GROUP BY p.id, p.sku, p.name, p.low_stock_threshold
    HAVING COALESCE(SUM(s.quantity_change), 0) <= p.low_stock_threshold
    """
    cursor.execute(query, (current_user["shop_id"], current_user["shop_id"]))
    alerts = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    for a in alerts:
        a["current_stock"] = float(a["current_stock"])
        
    return alerts

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    language_code: Optional[str] = None

@api_router.put("/me/profile")
def update_profile(profile: ProfileUpdate, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    updates = []
    params = []
    if profile.name is not None:
        updates.append("name = %s")
        params.append(profile.name)
    if profile.phone is not None:
        updates.append("phone = %s")
        params.append(profile.phone)
    if profile.language_code is not None:
        updates.append("language_code = %s")
        params.append(profile.language_code)
        
    if updates:
        params.append(current_user["_id"])
        query = f"UPDATE users SET {', '.join(updates)} WHERE id = %s"
        cursor.execute(query, tuple(params))
        conn.commit()
        
    conn.close()
    return {"message": "Profile updated successfully"}

@api_router.get("/me/activity")
def get_my_activity(
    page: int = 1,
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    where_clauses = ["s.shop_id = %s"]
    params = [current_user["shop_id"]]
    
    if current_user["role"] != "admin":
        where_clauses.append("s.user_id = %s")
        params.append(current_user["_id"])
        
    where_sql = " AND ".join(where_clauses)
    
    count_query = f"SELECT COUNT(*) as count FROM stock_ledger s WHERE {where_sql}"
    cursor.execute(count_query, tuple(params))
    total = cursor.fetchone()["count"]
    
    offset = (page - 1) * limit
    items_query = f"""
    SELECT s.*, p.name as product_name, p.sku as product_sku, u.name as user_name,
           'Warehouse: ' || l.warehouse_id || ', Zone: ' || l.zone || ', Aisle: ' || l.aisle || ', Bin: ' || l.bin as location_path
    FROM stock_ledger s
    JOIN products p ON s.product_id = p.id
    JOIN users u ON s.user_id = u.id
    JOIN locations l ON s.location_id = l.id
    WHERE {where_sql}
    ORDER BY s.timestamp DESC
    LIMIT %s OFFSET %s
    """
    cursor.execute(items_query, tuple(params + [limit, offset]))
    rows = cursor.fetchall()
    conn.close()
    
    items = []
    for r in rows:
        item = dict(r)
        item["quantity_change"] = float(item["quantity_change"])
        items.append(item)
        
    return {
        "total": total,
        "page": page,
        "limit": limit,
        "items": items
    }
 
# ===== MOBILE SYNC ENDPOINTS =====
@api_router.post("/sync/push")
def sync_push(payload: SyncPayload, current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    synced_count = 0
    conflicts = []
    projected_stock = {}
    unique_products_synced = set()
    
    for transaction in payload.transactions:
        # Check if product exists and is active
        cursor.execute("SELECT id FROM products WHERE id=%s AND shop_id=%s AND is_archived = FALSE", (transaction.product_id, current_user["shop_id"]))
        if not cursor.fetchone():
            continue
        
        # Check if location exists and is active
        cursor.execute("SELECT id FROM locations WHERE id=%s AND shop_id=%s AND is_archived = FALSE", (transaction.location_id, current_user["shop_id"]))
        if not cursor.fetchone():
            continue
            
        key = (transaction.product_id, transaction.location_id)
        if key not in projected_stock:
            cursor.execute(
                "SELECT COALESCE(SUM(quantity_change), 0) as total FROM stock_ledger WHERE product_id = %s AND location_id = %s",
                (transaction.product_id, transaction.location_id)
            )
            projected_stock[key] = float(cursor.fetchone()["total"])
            
        curr = projected_stock[key]
        change = float(transaction.quantity_change)
        if transaction.transaction_type == "PICK" and change > 0:
            change = -change
            
        new_projected = curr + change
        
        if transaction.transaction_type == "PICK" and new_projected < 0:
            conflicts.append({
                "product_id": transaction.product_id,
                "location_id": transaction.location_id,
                "transaction_type": transaction.transaction_type,
                "quantity_change": transaction.quantity_change,
                "reference_number": transaction.reference_number,
                "notes": transaction.notes,
                "current_projected_stock": curr
            })
            continue
            
        ledger_id = str(uuid.uuid4())
        timestamp = datetime.now(timezone.utc).isoformat()
        
        cursor.execute(
            "INSERT INTO stock_ledger (id, product_id, location_id, user_id, transaction_type, quantity_change, reference_number, notes, shop_id, timestamp) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
            (ledger_id, transaction.product_id, transaction.location_id, current_user["_id"], transaction.transaction_type, change, transaction.reference_number, transaction.notes, current_user["shop_id"], timestamp)
        )
        
        unique_products_synced.add(transaction.product_id)
        projected_stock[key] = new_projected
        synced_count += 1
        
    conn.commit()
    
    for pid in unique_products_synced:
        try:
            check_and_trigger_low_stock_alert(pid, current_user["shop_id"], cursor)
        except Exception as ae:
            logger.error(f"Error checking low stock alert in sync_push: {ae}")
            
    conn.close()
    return {
        "message": f"Synced {synced_count} transactions",
        "synced_count": synced_count,
        "conflicts": conflicts
    }
 
@api_router.get("/sync/pull")
def sync_pull(current_user: dict = Depends(get_current_user), last_sync: Optional[str] = None):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if last_sync:
        cursor.execute("SELECT * FROM stock_ledger WHERE timestamp > %s AND shop_id=%s LIMIT 500", (last_sync, current_user["shop_id"]))
    else:
        cursor.execute("SELECT * FROM stock_ledger WHERE shop_id=%s LIMIT 500", (current_user["shop_id"],))
        
    transactions = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return {"transactions": transactions}

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000,https://inventory-tracker-ecru-mu.vercel.app").split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def init_db():
    conn = get_db_connection(init=False)
    cursor = conn.cursor()
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        password_hash TEXT,
        name TEXT,
        role TEXT,
        shop_id TEXT,
        security_question TEXT,
        security_answer TEXT,
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
        shop_id TEXT,
        created_at TEXT
    )
    """)

    cursor.execute("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='products' AND column_name='price'
    """)
    if not cursor.fetchone():
        cursor.execute("ALTER TABLE products ADD COLUMN price NUMERIC DEFAULT 0.00")
        conn.commit()
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS locations (
        id TEXT PRIMARY KEY,
        warehouse_id TEXT,
        zone TEXT,
        aisle TEXT,
        bin TEXT,
        capacity INTEGER,
        shop_id TEXT,
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
        shop_id TEXT,
        timestamp TEXT
    )
    """)
    
    # Run migrations to ensure columns exist for existing databases
    for col, col_type in [("shop_id", "TEXT"), ("security_question", "TEXT"), ("security_answer", "TEXT")]:
        cursor.execute(f"""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='users' AND column_name='{col}'
        """)
        if not cursor.fetchone():
            cursor.execute(f"ALTER TABLE users ADD COLUMN {col} {col_type}")
            conn.commit()

    for table in ["products", "locations", "stock_ledger"]:
        cursor.execute(f"""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='{table}' AND column_name='shop_id'
        """)
        if not cursor.fetchone():
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN shop_id TEXT")
            conn.commit()

    # Backfill default values
    default_shop_id = "default-shop-uuid"
    cursor.execute("UPDATE users SET shop_id = %s WHERE shop_id IS NULL", (default_shop_id,))
    cursor.execute("UPDATE users SET security_question = 'What is your shop name?', security_answer = 'default' WHERE security_question IS NULL")
    cursor.execute("UPDATE products SET shop_id = %s WHERE shop_id IS NULL", (default_shop_id,))
    cursor.execute("UPDATE locations SET shop_id = %s WHERE shop_id IS NULL", (default_shop_id,))
    cursor.execute("UPDATE stock_ledger SET shop_id = %s WHERE shop_id IS NULL", (default_shop_id,))
    conn.commit()

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_stock_product ON stock_ledger (product_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_stock_timestamp ON stock_ledger (timestamp)")
    
    admin_email = os.environ.get("ADMIN_EMAIL", "admin")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    
    cursor.execute("SELECT * FROM users WHERE email = %s", (admin_email,))
    existing = cursor.fetchone()
    if existing is None:
        hashed = hash_password(admin_password)
        cursor.execute(
            "INSERT INTO users (id, email, password_hash, name, role, shop_id, security_question, security_answer, created_at) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
            (str(uuid.uuid4()), admin_email, hashed, "Admin", "admin", default_shop_id, "What is your shop name?", "admin", datetime.now(timezone.utc).isoformat())
        )
        conn.commit()
        logger.info(f"Admin user created: {admin_email}")
    else:
        updates = []
        params = []
        if existing.get("role") != "admin":
            updates.append("role = %s")
            params.append("admin")
        if not verify_password(admin_password, existing.get("password_hash") or ""):
            hashed = hash_password(admin_password)
            updates.append("password_hash = %s")
            params.append(hashed)
        if not existing.get("security_question") or not existing.get("security_answer"):
            updates.append("security_question = %s, security_answer = %s")
            params.extend(["What is your shop name?", "admin"])
        if updates:
            params.append(admin_email)
            cursor.execute(f"UPDATE users SET {', '.join(updates)} WHERE email = %s", tuple(params))
            conn.commit()
            logger.info(f"Admin role/password/security details updated/enforced for: {admin_email}")
        
    # Execute migration.sql additions and corrections
    migration_path = ROOT_DIR / "migration.sql"
    if migration_path.exists():
        try:
            with open(migration_path, "r") as f:
                migration_sql = f.read()
            with conn.cursor() as mig_cursor:
                mig_cursor.execute(migration_sql)
            conn.commit()
            logger.info("Database migrations executed successfully from migration.sql")
        except Exception as e:
            conn.rollback()
            logger.error(f"Failed to execute database migrations: {e}")
        
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
            admin_email = os.environ.get("ADMIN_EMAIL", "admin")
            admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
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
