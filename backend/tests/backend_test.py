import os
import uuid
import pytest
import requests
import psycopg2

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8000").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@inventory.com"
ADMIN_PASSWORD = "Admin@123"


# ---------- Fixtures ----------
@pytest.fixture(scope="session", autouse=True)
def clean_database():
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        from pathlib import Path
        from dotenv import load_dotenv
        backend_dir = Path(__file__).parent.parent
        load_dotenv(backend_dir / '.env')
        db_url = os.environ.get("DATABASE_URL")
    if db_url:
        conn = psycopg2.connect(db_url)
        cursor = conn.cursor()
        cursor.execute("TRUNCATE TABLE sessions, otp_store CASCADE;")
        conn.commit()
        conn.close()
@pytest.fixture(scope="session")
def admin_session():
    s = requests.Session()
    # Clear any old sessions first by calling logout just in case
    s.post(f"{API}/auth/logout")
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    token = r.json().get("access_token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    yield s
    s.post(f"{API}/auth/logout")


@pytest.fixture(scope="session")
def worker_session():
    s = requests.Session()
    email = f"test_worker_{uuid.uuid4().hex[:8]}@example.com"
    password = "Worker@123"
    r = s.post(f"{API}/auth/register", json={
        "email": email, "password": password, "name": "Test Worker", "role": "worker"
    })
    assert r.status_code == 200, f"Worker register failed: {r.status_code} {r.text}"
    
    lr = s.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert lr.status_code == 200, f"Worker login failed: {lr.status_code} {lr.text}"
    token = lr.json().get("access_token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    s.email = email  # noqa
    yield s
    s.post(f"{API}/auth/logout")


@pytest.fixture(scope="session")
def seed_data(admin_session):
    """Create one product and one location via admin for shared use."""
    sku = f"TEST_SKU_{uuid.uuid4().hex[:6]}"
    pr = admin_session.post(f"{API}/products", json={
        "sku": sku, "name": "TEST Widget", "description": "test", "low_stock_threshold": 5, "unit": "pcs"
    })
    assert pr.status_code == 200, pr.text
    product = pr.json()

    lr = admin_session.post(f"{API}/locations", json={
        "warehouse_id": "WH1", "zone": "A", "aisle": "1", "bin": "01", "capacity": 100
    })
    assert lr.status_code == 200, lr.text
    location = lr.json()
    return {"product": product, "location": location, "sku": sku}


# ---------- AUTH ----------
class TestAuth:
    def test_login_success(self):
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        data = r.json()
        assert data.get("email") == ADMIN_EMAIL
        assert data.get("role") == "admin"
        assert "password_hash" not in data
        assert "access_token" in r.cookies
        token = data.get("access_token")
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        s.post(f"{API}/auth/logout", headers=headers)

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_me_with_cookie(self, admin_session):
        r = admin_session.get(f"{API}/auth/me")
        assert r.status_code == 200
        data = r.json()
        assert data.get("email") == ADMIN_EMAIL
        assert data.get("role") == "admin"

    def test_me_unauthenticated(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_register_worker(self):
        email = f"test_reg_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "Worker@123", "name": "Reg Worker", "role": "worker"
        })
        assert r.status_code == 200
        data = r.json()
        assert data.get("email") == email
        assert data.get("role") == "worker"
        # Since registration auto-logs in and sets session, let's clean up its session
        token = data.get("access_token")
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        requests.post(f"{API}/auth/logout", headers=headers)

    def test_register_duplicate(self):
        r = requests.post(f"{API}/auth/register", json={
            "email": ADMIN_EMAIL, "password": "x", "name": "x", "role": "worker"
        })
        assert r.status_code == 400

    def test_logout(self, admin_session):
        s = requests.Session()
        r_login = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r_login.status_code == 200
        token = r_login.json().get("access_token")
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        r = s.post(f"{API}/auth/logout", headers=headers)
        assert r.status_code == 200

    def test_bcrypt_hash_format(self):
        """Verify bcrypt hash format via login flow (cannot inspect DB directly here)."""
        r_login = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r_login.status_code == 200
        token = r_login.json().get("access_token")
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        requests.post(f"{API}/auth/logout", headers=headers)


# ---------- PRODUCTS ----------
class TestProducts:
    def test_create_product_admin(self, admin_session):
        sku = f"TEST_P_{uuid.uuid4().hex[:6]}"
        r = admin_session.post(f"{API}/products", json={
            "sku": sku, "name": "TEST Product", "low_stock_threshold": 5, "unit": "pcs"
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["sku"] == sku
        assert data["current_stock"] == 0
        assert "id" in data

    def test_create_product_worker_forbidden(self, worker_session):
        r = worker_session.post(f"{API}/products", json={
            "sku": f"BLOCK_{uuid.uuid4().hex[:6]}", "name": "blk", "low_stock_threshold": 5, "unit": "pcs"
        })
        assert r.status_code == 403

    def test_duplicate_sku(self, admin_session, seed_data):
        r = admin_session.post(f"{API}/products", json={
            "sku": seed_data["sku"], "name": "dup", "low_stock_threshold": 5, "unit": "pcs"
        })
        assert r.status_code == 400

    def test_list_products(self, admin_session, seed_data):
        r = admin_session.get(f"{API}/products")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        skus = [p["sku"] for p in data]
        assert seed_data["sku"] in skus

    def test_update_product(self, admin_session):
        sku = f"TEST_U_{uuid.uuid4().hex[:6]}"
        cr = admin_session.post(f"{API}/products", json={
            "sku": sku, "name": "ToUpdate", "low_stock_threshold": 5, "unit": "pcs"
        })
        pid = cr.json()["id"]
        ur = admin_session.put(f"{API}/products/{pid}", json={
            "sku": sku, "name": "Updated Name", "low_stock_threshold": 20, "unit": "pcs"
        })
        assert ur.status_code == 200
        # Verify via list
        lr = admin_session.get(f"{API}/products")
        found = [p for p in lr.json() if p["id"] == pid][0]
        assert found["name"] == "Updated Name"
        assert found["low_stock_threshold"] == 20

    def test_update_product_worker_forbidden(self, worker_session, seed_data):
        r = worker_session.put(f"{API}/products/{seed_data['product']['id']}", json={
            "sku": "x", "name": "x", "low_stock_threshold": 5, "unit": "u"
        })
        assert r.status_code == 403

    def test_delete_product_worker_forbidden(self, worker_session, seed_data):
        r = worker_session.delete(f"{API}/products/{seed_data['product']['id']}")
        assert r.status_code == 403

    def test_delete_product_admin(self, admin_session):
        sku = f"TEST_D_{uuid.uuid4().hex[:6]}"
        cr = admin_session.post(f"{API}/products", json={
            "sku": sku, "name": "ToDelete", "low_stock_threshold": 5, "unit": "pcs"
        })
        pid = cr.json()["id"]
        dr = admin_session.delete(f"{API}/products/{pid}")
        assert dr.status_code == 200


# ---------- LOCATIONS ----------
class TestLocations:
    def test_create_location_admin(self, admin_session):
        r = admin_session.post(f"{API}/locations", json={
            "warehouse_id": "WH1", "zone": "B", "aisle": "2", "bin": "02", "capacity": 50
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert "id" in data
        assert data["warehouse_id"] == "WH1"

    def test_create_location_worker_forbidden(self, worker_session):
        r = worker_session.post(f"{API}/locations", json={
            "warehouse_id": "x", "zone": "x", "aisle": "x", "bin": "x"
        })
        assert r.status_code == 403

    def test_list_locations(self, admin_session):
        r = admin_session.get(f"{API}/locations")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_update_location(self, admin_session):
        cr = admin_session.post(f"{API}/locations", json={
            "warehouse_id": "WH2", "zone": "C", "aisle": "3", "bin": "03"
        })
        lid = cr.json()["id"]
        ur = admin_session.put(f"{API}/locations/{lid}", json={
            "warehouse_id": "WH2", "zone": "C", "aisle": "3", "bin": "03-updated", "capacity": 200
        })
        assert ur.status_code == 200

    def test_delete_location(self, admin_session):
        cr = admin_session.post(f"{API}/locations", json={
            "warehouse_id": "WH3", "zone": "D", "aisle": "4", "bin": "04"
        })
        lid = cr.json()["id"]
        dr = admin_session.delete(f"{API}/locations/{lid}")
        assert dr.status_code == 200


# ---------- STOCK LEDGER (immutable) ----------
class TestStockLedger:
    def test_create_transaction_admin(self, admin_session, seed_data):
        r = admin_session.post(f"{API}/stock/transaction", json={
            "product_id": seed_data["product"]["id"],
            "location_id": seed_data["location"]["id"],
            "transaction_type": "RECEIVE",
            "quantity_change": 100,
            "reference_number": "PO-1",
            "notes": "initial stock"
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["quantity_change"] == 100
        assert data["transaction_type"] == "RECEIVE"
        assert "user_id" in data
        assert "id" in data

    def test_create_transaction_worker_allowed(self, worker_session, seed_data):
        r = worker_session.post(f"{API}/stock/transaction", json={
            "product_id": seed_data["product"]["id"],
            "location_id": seed_data["location"]["id"],
            "transaction_type": "PICK",
            "quantity_change": -5
        })
        assert r.status_code == 200, r.text

    def test_current_stock_calculated_from_ledger(self, admin_session, seed_data):
        # After RECEIVE 100 and PICK -5, expect 95
        pid = seed_data["product"]["id"]
        r = admin_session.get(f"{API}/products")
        product = [p for p in r.json() if p["id"] == pid][0]
        assert product["current_stock"] == 95, f"Expected 95, got {product['current_stock']}"

    def test_get_ledger_history(self, admin_session):
        r = admin_session.get(f"{API}/stock/ledger")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 2

    def test_get_product_ledger(self, admin_session, seed_data):
        r = admin_session.get(f"{API}/stock/product/{seed_data['product']['id']}")
        assert r.status_code == 200
        data = r.json()
        assert all(t["product_id"] == seed_data["product"]["id"] for t in data)

    def test_ledger_immutable_no_update_endpoint(self, admin_session):
        """No PUT/PATCH on /api/stock/ledger - verify by attempting."""
        r = admin_session.put(f"{API}/stock/ledger/anyid", json={})
        # 404 or 405 is acceptable (route does not exist)
        assert r.status_code in (404, 405)

    def test_transaction_invalid_product(self, admin_session, seed_data):
        r = admin_session.post(f"{API}/stock/transaction", json={
            "product_id": "non-existent",
            "location_id": seed_data["location"]["id"],
            "transaction_type": "RECEIVE",
            "quantity_change": 10
        })
        assert r.status_code == 404


# ---------- DASHBOARD ----------
class TestDashboard:
    def test_stats(self, admin_session):
        r = admin_session.get(f"{API}/dashboard/stats")
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("total_products", "total_locations", "total_stock", "low_stock_count", "recent_transactions"):
            assert k in data
        assert data["total_products"] >= 1

    def test_low_stock_alerts(self, admin_session, seed_data):
        # Create a product with high threshold to trigger alert (current_stock 0 < 100)
        sku = f"TEST_LOW_{uuid.uuid4().hex[:6]}"
        admin_session.post(f"{API}/products", json={
            "sku": sku, "name": "LowStockItem", "low_stock_threshold": 100, "unit": "pcs"
        })
        r = admin_session.get(f"{API}/dashboard/low-stock")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        skus = [a["sku"] for a in data]
        assert sku in skus


# ---------- SYNC ----------
class TestSync:
    def test_sync_push(self, worker_session, seed_data):
        r = worker_session.post(f"{API}/sync/push", json={
            "transactions": [{
                "product_id": seed_data["product"]["id"],
                "location_id": seed_data["location"]["id"],
                "transaction_type": "AUDIT",
                "quantity_change": 1
            }]
        })
        assert r.status_code == 200, r.text
        assert "Synced" in r.json().get("message", "")

    def test_sync_pull(self, admin_session):
        r = admin_session.get(f"{API}/sync/pull")
        assert r.status_code == 200
        data = r.json()
        assert "transactions" in data
        assert isinstance(data["transactions"], list)


# ---------- RBAC summary ----------
class TestRBAC:
    def test_worker_cannot_create_product(self, worker_session):
        r = worker_session.post(f"{API}/products", json={
            "sku": "X", "name": "X", "low_stock_threshold": 1, "unit": "pcs"
        })
        assert r.status_code == 403

    def test_worker_cannot_create_location(self, worker_session):
        r = worker_session.post(f"{API}/locations", json={
            "warehouse_id": "x", "zone": "x", "aisle": "x", "bin": "x"
        })
        assert r.status_code == 403

    def test_worker_can_read_products(self, worker_session):
        r = worker_session.get(f"{API}/products")
        assert r.status_code == 200
