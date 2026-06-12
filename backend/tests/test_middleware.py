#!/usr/bin/env python
"""Test script to verify middleware works correctly"""
import sys
import os

# Add the backend directory (parent of tests/) to Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    print("Testing middleware import...")
    
    # Test core tenant module
    from app.core.tenant import TenantMiddleware, TenantContext, SuperAdminContext
    print("✓ Tenant middleware imported successfully")
    
    # Test that middleware can be instantiated
    class MockApp:
        async def __call__(self, scope, receive, send):
            pass
    
    middleware = TenantMiddleware(MockApp())
    print("✓ TenantMiddleware instantiated successfully")
    
    print("\n✅ Middleware test successful!")
    
except ImportError as e:
    print(f"\n❌ Import error: {e}")
    sys.exit(1)
except Exception as e:
    print(f"\n❌ Unexpected error: {e}")
    sys.exit(1)
