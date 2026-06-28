import requests
import uuid
import pytest
import psycopg2
import hashlib
import os

API = "http://127.0.0.1:8000/api"

def test_forgot_and_reset_password_flow():
    email = f"user_forgot_{uuid.uuid4().hex[:8]}@example.com"
    password = "InitialPassword@123"
    
    # 1. Register user
    r = requests.post(f"{API}/auth/register", json={
        "email": email,
        "password": password,
        "name": "Forgot User",
        "role": "admin"
    })
    assert r.status_code == 200, r.text
    
    # Clean up the register session so it doesn't pollute limits
    reg_data = r.json()
    token = reg_data.get("access_token")
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    requests.post(f"{API}/auth/logout", headers=headers)
    
    # 2. Trigger forgot password to generate OTP
    r = requests.post(f"{API}/auth/forgot-password", json={"email": email})
    assert r.status_code == 200
    assert r.json()["message"] == "OTP sent"
    
    # Get DB connection URL
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        from pathlib import Path
        from dotenv import load_dotenv
        backend_dir = Path(__file__).parent.parent
        load_dotenv(backend_dir / '.env')
        db_url = os.environ.get("DATABASE_URL")
        
    # 3. Update the OTP hash in the database to a known hash (for OTP "123456")
    known_otp = "123456"
    known_hash = hashlib.sha256(known_otp.encode("utf-8")).hexdigest()
    
    conn = psycopg2.connect(db_url)
    cursor = conn.cursor()
    cursor.execute("UPDATE otp_store SET otp_hash = %s WHERE user_id = (SELECT id FROM users WHERE email = %s)", (known_hash, email))
    conn.commit()
    conn.close()
    
    # 4. Verify OTP with incorrect code
    r = requests.post(f"{API}/auth/verify-otp", json={"email": email, "otp": "000000"})
    assert r.status_code == 400
    
    # 5. Verify OTP with correct code -> returns reset_token
    r = requests.post(f"{API}/auth/verify-otp", json={"email": email, "otp": known_otp})
    assert r.status_code == 200
    reset_token = r.json()["reset_token"]
    
    # 6. Reset password with new value
    r = requests.post(f"{API}/auth/reset-password", json={
        "reset_token": reset_token,
        "new_password": "NewPassword@123"
    })
    assert r.status_code == 200
    assert r.json()["message"] == "Password reset successfully"
    
    # 7. Try login with old password (should fail)
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 401
    
    # 8. Login with new password (should succeed)
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": "NewPassword@123"})
    assert r.status_code == 200
    assert r.json()["email"] == email
    
    # Clean up session
    login_token = r.json().get("access_token")
    login_headers = {"Authorization": f"Bearer {login_token}"} if login_token else {}
    s.post(f"{API}/auth/logout", headers=login_headers)
