#!/usr/bin/env python3
"""Comprehensive login verification script"""
import requests
import json
from datetime import datetime

print("=" * 80)
print("🏥 HOSPITAL MANAGEMENT SYSTEM - LOGIN VERIFICATION")
print("=" * 80)
print(f"Test Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print()

# Test credentials
test_users = [
    {"username": "superadmin", "password": "superadmin123", "role": "super_admin"},
    {"username": "admin", "password": "admin123", "role": "admin"},
    {"username": "doctor1", "password": "doctor123", "role": "doctor"},
    {"username": "nurse1", "password": "nurse123", "role": "nurse"},
]

base_url = "http://localhost:8000/api/v1"
login_url = f"{base_url}/auth/login"

print("🔍 TESTING BACKEND ENDPOINTS")
print("-" * 80)

# Test 1: Backend Health
try:
    response = requests.get(f"{base_url}/auth/login", timeout=2)
    print(f"✅ Backend API is reachable")
except Exception as e:
    print(f"❌ Backend API is NOT reachable: {e}")
    exit(1)

print()
print("🔐 TESTING USER LOGIN")
print("-" * 80)

success_count = 0
fail_count = 0

for user in test_users:
    try:
        response = requests.post(login_url, json={
            "username": user["username"],
            "password": user["password"]
        }, timeout=5)
        
        if response.status_code == 200:
            data = response.json()
            if data.get('access_token') and data.get('user', {}).get('role') == user['role']:
                print(f"✅ {user['username']:12} - Login successful - Role: {user['role']}")
                success_count += 1
            else:
                print(f"⚠️  {user['username']:12} - Login returned incomplete data")
                fail_count += 1
        else:
            print(f"❌ {user['username']:12} - Login failed - Status: {response.status_code}")
            print(f"   Error: {response.text}")
            fail_count += 1
            
    except Exception as e:
        print(f"❌ {user['username']:12} - Error: {e}")
        fail_count += 1

print()
print("=" * 80)
print("📊 TEST SUMMARY")
print("-" * 80)
print(f"Total Tests:  {len(test_users)}")
print(f"✅ Passed:    {success_count}")
print(f"❌ Failed:    {fail_count}")
print()

if fail_count == 0:
    print("🎉 ALL TESTS PASSED! Login system is working correctly.")
    print()
    print("🌐 APPLICATION URLS:")
    print("   Frontend:  http://localhost:3000")
    print("   Backend:   http://localhost:8000")
    print("   API Docs:  http://localhost:8000/api/docs")
    print()
    print("👤 LOGIN CREDENTIALS:")
    for user in test_users:
        print(f"   {user['username']:12} / {user['password']}")
else:
    print("⚠️  SOME TESTS FAILED! Please check the errors above.")

print("=" * 80)
