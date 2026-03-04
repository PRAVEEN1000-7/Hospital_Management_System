#!/usr/bin/env python3
"""Generate bcrypt hashes for default passwords"""
import bcrypt

passwords = {
    "superadmin": "superadmin123",
    "admin": "admin123",
    "doctor1": "doctor123",
    "nurse1": "nurse123"
}

print("Generated Password Hashes for Seed Data\n")
print("=" * 80)

for username, password in passwords.items():
    hash_value = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt(rounds=12)).decode('utf-8')
    print(f"\nUsername: {username}")
    print(f"Password: {password}")
    print(f"Hash: {hash_value}")
    print("-" * 80)

print("\n✅ Use these hashes in seed_data.sql")
