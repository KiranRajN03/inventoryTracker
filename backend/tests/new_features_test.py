import os
import uuid
import pytest
import requests
import psycopg2

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8000").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@inventory.com"
ADMIN_PASSWORD = "Admin@123"

@pytest.fixture(scope="module", autouse=True)
def clean_sessions_db():
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        from pathlib import Path
        from dotenv import load_dotenv
        backend_dir = Path(__file__).parent.parent
        load_dotenv(backend_dir / '.env')
        db_url = os.environ.get("DATABASE_URL")
    if db_url:
        conn = psycopg2.connect(db_url)
        cursor = conn.conn.cursor() if hasattr(conn, "conn") else conn.cursor()
        cursor.execute("TRUNCATE TABLE sessions, otp_store, suppliers CASCADE;")
        conn.commit()
        conn.close()

def test_session_limit():
    # Attempt 1
    s1 = requests.Session()
    r1 = s1.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD, "device_label": "Device 1"})
    assert r1.status_code == 200
    t1 = r1.json().get("access_token")
    
    # Attempt 2
    s2 = requests.Session()
    r2 = s2.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD, "device_label": "Device 2"})
    assert r2.status_code == 200
    t2 = r2.json().get("access_token")
    
    # Attempt 3 (should block with 409 Conflict)
    s3 = requests.Session()
    r3 = s3.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD, "device_label": "Device 3"})
    assert r3.status_code == 409
    
    # Check active sessions
    headers1 = {"Authorization": f"Bearer {t1}"}
    r_sessions = s1.get(f"{API}/auth/sessions", headers=headers1)
    assert r_sessions.status_code == 200
    sessions = r_sessions.json()
    assert len(sessions) == 2
    
    # Log out session 1
    r_logout = s1.post(f"{API}/auth/logout", headers=headers1)
    assert r_logout.status_code == 200
    
    # Attempt 3 again (should work now!)
    r3_again = s3.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD, "device_label": "Device 3"})
    assert r3_again.status_code == 200
    t3 = r3_again.json().get("access_token")
    
    # Clean up all sessions
    headers2 = {"Authorization": f"Bearer {t2}"}
    headers3 = {"Authorization": f"Bearer {t3}"}
    s2.post(f"{API}/auth/logout", headers=headers2)
    s3.post(f"{API}/auth/logout", headers=headers3)

def test_suppliers_crud():
    # Login admin
    s = requests.Session()
    r_login = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    token = r_login.json().get("access_token")
    headers = {"Authorization": f"Bearer {token}"}
    
    # 1. Create supplier
    supplier_payload = {
        "name": "Acme Corp",
        "phone": "9876543210",
        "email": "info@acme.com",
        "address": "123 Industrial Area"
    }
    r_create = s.post(f"{API}/suppliers", json=supplier_payload, headers=headers)
    assert r_create.status_code == 200
    sup = r_create.json()
    assert sup["name"] == "Acme Corp"
    assert "id" in sup
    
    # 2. Get suppliers
    r_get = s.get(f"{API}/suppliers", headers=headers)
    assert r_get.status_code == 200
    sups = r_get.json()
    assert len(sups) >= 1
    assert any(x["name"] == "Acme Corp" for x in sups)
    
    # 3. Update supplier
    r_update = s.put(f"{API}/suppliers/{sup['id']}", json={"name": "Acme Industries"}, headers=headers)
    assert r_update.status_code == 200
    assert r_update.json()["name"] == "Acme Industries"
    
    # 4. Soft delete supplier
    r_delete = s.delete(f"{API}/suppliers/{sup['id']}", headers=headers)
    assert r_delete.status_code == 200
    
    # Verify no longer returned in list
    r_get_after = s.get(f"{API}/suppliers", headers=headers)
    sups_after = r_get_after.json()
    assert not any(x["id"] == sup["id"] for x in sups_after)
    
    s.post(f"{API}/auth/logout", headers=headers)
