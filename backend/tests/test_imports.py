#!/usr/bin/env python
"""Test script to verify all imports work correctly"""
import sys
import os

# Add the backend directory (parent of tests/) to Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    print("Testing imports...")
    
    # Test models
    from app.models.tenant import Tenant, SubscriptionPlan, TenantSubscription, Module, TenantModule
    print("✓ Tenant models imported successfully")
    
    # Test schemas
    from app.schemas.tenant import (
        TenantResponse, TenantDetailResponse, TenantModuleResponse,
        SubscriptionPlanResponse, SuperAdminResponse
    )
    print("✓ Tenant schemas imported successfully")
    
    # Test services
    from app.services.tenant_service import TenantService
    from app.services.subscription_service import SubscriptionService
    from app.services.superadmin_service import SuperAdminService
    print("✓ Services imported successfully")
    
    # Test routers
    from app.routers.superadmin import router as superadmin_router
    from app.routers.tenant_admin import router as tenant_router
    print("✓ Routers imported successfully")
    
    # Test core tenant context
    from app.core.tenant import TenantContext, SuperAdminContext
    print("✓ Tenant context imported successfully")
    
    print("\n✅ All imports successful! The multi-tenant setup is ready.")
    
except ImportError as e:
    print(f"\n❌ Import error: {e}")
    sys.exit(1)
except Exception as e:
    print(f"\n❌ Unexpected error: {e}")
    sys.exit(1)
