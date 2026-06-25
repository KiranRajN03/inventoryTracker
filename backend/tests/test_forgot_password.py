import requests
import uuid
import pytest

API = "http://127.0.0.1:8000/api"

def test_forgot_and_reset_password_flow():
    email = f"user_forgot_{uuid.uuid4().hex[:8]}@example.com"
    password = "InitialPassword@123"
    question = "What is the capital of France?"
    answer = "Paris"
    
    # 1. Register user with security question
    r = requests.post(f"{API}/auth/register", json={
        "email": email,
        "password": password,
        "name": "Forgot User",
        "role": "admin",
        "security_question": question,
        "security_answer": answer
    })
    assert r.status_code == 200, r.text
    
    # 2. Get security question
    r = requests.post(f"{API}/auth/forgot-password", json={"email": email})
    assert r.status_code == 200
    assert r.json()["security_question"] == question

    # 3. Try to reset with wrong answer
    r = requests.post(f"{API}/auth/reset-password", json={
        "email": email,
        "security_answer": "London",
        "new_password": "NewPassword@123"
    })
    assert r.status_code == 400
    assert r.json()["detail"] == "Incorrect security answer"

    # 4. Reset with correct answer
    r = requests.post(f"{API}/auth/reset-password", json={
        "email": email,
        "security_answer": answer,
        "new_password": "NewPassword@123"
    })
    assert r.status_code == 200
    assert r.json()["message"] == "Password reset successfully"

    # 5. Try login with old password (should fail)
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 401

    # 6. Login with new password (should succeed)
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": "NewPassword@123"})
    assert r.status_code == 200
    assert r.json()["email"] == email
