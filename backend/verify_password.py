#!/usr/bin/env python3
"""Utility to verify and generate password hashes"""
import bcrypt

# Test password
password = "superadmin123"

# Hash from seed_data.sql for superadmin
stored_hash = "$2b$12$eXcJvdukvD3awfuhvmX0zuCdjxUhryfOw8rKiFWrX0bTYU8D7da.y"

# Verify if the hash matches the password
try:
    matches = bcrypt.checkpw(password.encode('utf-8'), stored_hash.encode('utf-8'))
    print(f"Password: {password}")
    print(f"Stored hash: {stored_hash}")
    print(f"Match: {matches}")
    print()
    
    if not matches:
        print("❌ HASH DOES NOT MATCH!")
        print("\nGenerating correct hash for 'superadmin123':")
        correct_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt(rounds=12)).decode('utf-8')
        print(f"Correct hash: {correct_hash}")
    else:
        print("✅ Hash matches!")
        
except Exception as e:
    print(f"Error: {e}")
