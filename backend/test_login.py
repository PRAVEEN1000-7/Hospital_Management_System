import requests
import json

# Test login endpoint
url = "http://localhost:8000/api/v1/auth/login"
credentials = {
    "username": "superadmin",
    "password": "superadmin123"
}

print("Testing login endpoint...")
print(f"URL: {url}")
print(f"Credentials: {credentials}")
print()

try:
    response = requests.post(url, json=credentials)
    print(f"Status Code: {response.status_code}")
    print(f"Response Headers:")
    for key, value in response.headers.items():
        print(f"  {key}: {value}")
    print()
    print(f"Response Body:")
    print(json.dumps(response.json(), indent=2))
    
    if response.status_code == 200:
        print("\n✅ LOGIN SUCCESSFUL!")
    else:
        print(f"\n❌ LOGIN FAILED: {response.status_code}")
except Exception as e:
    print(f"❌ ERROR: {e}")
