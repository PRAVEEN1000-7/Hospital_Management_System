"""
Tenant management service for multi-tenant operations.
"""
import uuid
import logging
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from math import ceil

from sqlalchemy.orm import Session
from sqlalchemy import or_, func

from ..models.tenant import (
    Tenant, SubscriptionPlan, TenantSubscription, Module,
    TenantModule, UsageTracking, AuditLog
)
from ..models.user import Hospital, User, Role, UserRole
from ..core.tenant import TenantContext, generate_tenant_slug, generate_tenant_code
from ..services.patient_id_service import generate_staff_id
from ..utils.security import get_password_hash

logger = logging.getLogger(__name__)


class TenantService:
    """Service for tenant lifecycle management"""
    
    @staticmethod
    def get_by_id(db: Session, tenant_id: uuid.UUID) -> Optional[Tenant]:
        """Get tenant by ID"""
        return db.query(Tenant).filter(Tenant.id == tenant_id).first()
    
    @staticmethod
    def get_by_slug(db: Session, slug: str) -> Optional[Tenant]:
        """Get tenant by slug"""
        return db.query(Tenant).filter(Tenant.slug == slug).first()
    
    @staticmethod
    def get_by_code(db: Session, code: str) -> Optional[Tenant]:
        """Get tenant by code"""
        return db.query(Tenant).filter(Tenant.code == code).first()
    
    @staticmethod
    def list_tenants(
        db: Session,
        page: int = 1,
        limit: int = 10,
        status: Optional[str] = None,
        search: Optional[str] = None,
        plan_code: Optional[str] = None
    ) -> Dict[str, Any]:
        """List tenants with pagination and filters"""
        from ..models.tenant import SubscriptionPlan
        
        query = db.query(Tenant)
        
        # Apply filters
        if status:
            query = query.filter(Tenant.status == status)
        
        if search:
            search_term = f"%{search.strip()}%"
            query = query.filter(
                or_(
                    Tenant.name.ilike(search_term),
                    Tenant.email.ilike(search_term),
                    Tenant.slug.ilike(search_term),
                    Tenant.code.ilike(search_term)
                )
            )
        
        # Join with subscription if plan filter
        if plan_code:
            query = query.join(
                TenantSubscription,
                Tenant.id == TenantSubscription.tenant_id
            ).join(
                SubscriptionPlan,
                TenantSubscription.plan_id == SubscriptionPlan.id
            ).filter(
                SubscriptionPlan.code == plan_code,
                TenantSubscription.status.in_(['trialing', 'active', 'past_due'])
            )
        
        # Count total
        total = query.count()
        
        # Pagination
        offset = (page - 1) * limit
        tenants = query.order_by(Tenant.created_at.desc()).offset(offset).limit(limit).all()
        
        # Enrich with subscription info without failing the whole request if a
        # single tenant has incomplete data or a broken relationship.
        for tenant in tenants:
            try:
                sub = tenant.active_subscription
                if sub:
                    tenant.subscription_status = sub.status
                    tenant.plan_name = sub.plan.name if sub.plan else None
                    tenant.plan_code = sub.plan.code if sub.plan else None
                    tenant.current_period_end = sub.current_period_end
            except Exception as exc:
                logger.warning("Skipping subscription enrichment for tenant %s: %s", getattr(tenant, "id", None), exc)
        
        return {
            "total": total,
            "page": page,
            "limit": limit,
            "total_pages": ceil(total / limit) if limit > 0 else 0,
            "data": tenants
        }
    
    @staticmethod
    def create_tenant(
        db: Session,
        name: str,
        email: str,
        admin_user_data: Dict[str, str],
        plan_id: Optional[uuid.UUID] = None,
        created_by_admin_id: Optional[uuid.UUID] = None,
        **kwargs
    ) -> Tenant:
        """Create a new tenant with initial setup"""
        # Generate unique slug and code
        base_slug = generate_tenant_slug(name)
        slug = base_slug
        counter = 1
        while db.query(Tenant).filter(Tenant.slug == slug).first():
            slug = f"{base_slug}-{counter}"
            counter += 1
        
        # Generate unique 2-char code
        code = generate_tenant_code()
        while db.query(Tenant).filter(Tenant.code == code).first():
            code = generate_tenant_code()
        
        # Create tenant
        tenant_data = kwargs.copy()
        trial_days = tenant_data.pop('trial_days', 14)
        
        tenant = Tenant(
            name=name,
            slug=slug,
            code=code,
            email=email,
            status='pending',
            is_verified=True, # Auto-verify
            verified_at=datetime.utcnow(),
            onboarding_completed=False,
            onboarding_step='plan',
            **tenant_data
        )
        db.add(tenant)
        db.flush()  # Get ID without committing
        
        # 1. Create Hospital Record linked by code
        hospital = Hospital(
            name=name,
            code=code,
            tenant_id=tenant.id,
            email=email,
            phone=tenant_data.get('phone'),
            city=tenant_data.get('city'),
            country=tenant_data.get('country', 'USA'),
            is_active=True
        )
        db.add(hospital)
        db.flush()
        
        # 2. Create Hospital Admin User
        admin_password = admin_user_data.get('password')
        if not admin_password:
            raise ValueError("Admin password is required")

        reference_number = generate_staff_id(db, hospital.id, 'admin')
            
        admin_user = User(
            hospital_id=hospital.id,
            email=admin_user_data.get('email'),
            username=f"{admin_user_data.get('email').split('@')[0]}_{code.lower()}",  # unique username using code
            password_hash=get_password_hash(admin_password),
            first_name=admin_user_data.get('first_name'),
            last_name=admin_user_data.get('last_name'),
            reference_number=reference_number,
            is_active=True
        )
        db.add(admin_user)
        db.flush()
        
        # 3. Assign Role to Admin User
        role = db.query(Role).filter(Role.name == "admin").first()
        if not role:
            # Create system admin role if it doesn't exist
            role = Role(name="admin", display_name="Administrator", is_system=True)
            db.add(role)
            db.flush()
            
        user_role = UserRole(user_id=admin_user.id, role_id=role.id)
        db.add(user_role)
        
        # 4. Link back to Tenant
        tenant.admin_user_id = admin_user.id
        
        # Log audit
        audit = AuditLog(
            tenant_id=tenant.id,
            action='tenant_created_pending_plan',
            entity_type='Tenant',
            entity_id=tenant.id,
            entity_name=name,
            new_values={'trial_days': trial_days, 'status': 'pending'}
        )
        db.add(audit)

        if plan_id:
            TenantService.assign_plan_to_tenant(
                db=db,
                hospital_code=code,
                plan_id=plan_id,
                modules=None,
                admin_id=created_by_admin_id or admin_user.id,
            )

        
        db.commit()
        logger.info(f"Created tenant {tenant.id} (pending plan)")
        
        return tenant
    
    @staticmethod
    def assign_plan_to_tenant(
        db: Session,
        hospital_code: str,
        plan_id: uuid.UUID,
        modules: Optional[Dict[str, bool]],
        admin_id: uuid.UUID
    ) -> TenantSubscription:
        """Assign a subscription plan to a tenant based on hospital code"""
        tenant = db.query(Tenant).filter(Tenant.code == hospital_code).first()
        if not tenant:
            raise ValueError(f"No hospital found with code {hospital_code}")
            
        plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == plan_id).first()
        if not plan:
            raise ValueError(f"Plan {plan_id} not found")
            
        # Check if already has a subscription
        existing_sub = db.query(TenantSubscription).filter(
            TenantSubscription.tenant_id == tenant.id,
            TenantSubscription.status.in_(['trialing', 'active', 'past_due'])
        ).first()
        
        if existing_sub:
            raise ValueError("Hospital already has an active subscription. Use change-plan instead.")
            
        # Create subscription
        subscription = TenantSubscription(
            tenant_id=tenant.id,
            plan_id=plan_id,
            status='trialing',
            trial_ends_at=datetime.utcnow() + timedelta(days=14),  # Default 14 days trial
            current_period_start=datetime.utcnow(),
            current_period_end=datetime.utcnow() + timedelta(days=30)
        )
        db.add(subscription)
        
        # Enable modules based on plan defaults (includes core modules)
        TenantService._enable_modules_for_plan(db, tenant.id, plan)
        
        # Apply specific module overrides if provided
        if modules:
            TenantService.configure_modules(db, tenant.id, modules, admin_id)
            
        # Update tenant status
        tenant.status = 'active'
        tenant.updated_at = datetime.utcnow()
        
        # Log audit
        audit = AuditLog(
            tenant_id=tenant.id,
            action='plan_assigned',
            entity_type='Tenant',
            entity_id=tenant.id,
            entity_name=tenant.name,
            new_values={'plan_id': str(plan_id), 'status': 'active'}
        )
        db.add(audit)
        
        db.commit()
        db.refresh(subscription)
        
        logger.info(f"Assigned plan {plan.code} to tenant {tenant.id} (Code: {hospital_code})")
        return subscription
    
    @staticmethod
    def _enable_modules_for_plan(db: Session, tenant_id: uuid.UUID, plan: SubscriptionPlan):
        """Enable modules based on plan configuration"""
        # Get all modules
        all_modules = db.query(Module).filter(Module.is_active == True).all()
        
        # Get plan-included module IDs
        included_ids = set(plan.modules_included or [])
        
        for module in all_modules:
            # Core modules are always enabled
            is_enabled = module.is_core or module.id in included_ids
            
            tenant_module = TenantModule(
                tenant_id=tenant_id,
                module_id=module.id,
                is_enabled=is_enabled,
                enabled_at=datetime.utcnow() if is_enabled else None
            )
            db.add(tenant_module)
            
            # Resolve dependencies
            if is_enabled:
                TenantService._resolve_module_dependencies(db, tenant_id, module)
    
    @staticmethod
    def _resolve_module_dependencies(db: Session, tenant_id: uuid.UUID, module: Module):
        """Auto-enable required modules"""
        if not module.required_modules:
            return
        
        for req_code in module.required_modules:
            req_module = db.query(Module).filter(Module.code == req_code).first()
            if not req_module:
                continue
            
            # Check if already enabled
            existing = db.query(TenantModule).filter(
                TenantModule.tenant_id == tenant_id,
                TenantModule.module_id == req_module.id
            ).first()
            
            if existing and not existing.is_enabled:
                existing.is_enabled = True
                existing.enabled_at = datetime.utcnow()
            elif not existing:
                tenant_module = TenantModule(
                    tenant_id=tenant_id,
                    module_id=req_module.id,
                    is_enabled=True,
                    enabled_at=datetime.utcnow()
                )
                db.add(tenant_module)
            
            # Recursive dependency resolution
            TenantService._resolve_module_dependencies(db, tenant_id, req_module)
    
    @staticmethod
    def update_tenant(
        db: Session,
        tenant_id: uuid.UUID,
        **updates
    ) -> Optional[Tenant]:
        """Update tenant details"""
        tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
        if not tenant:
            return None
        
        # Track changes for audit
        old_values = {}
        
        for key, value in updates.items():
            if hasattr(tenant, key) and value is not None:
                old_values[key] = getattr(tenant, key)
                setattr(tenant, key, value)
        
        tenant.updated_at = datetime.utcnow()
        
        # Log audit
        if old_values:
            audit = AuditLog(
                tenant_id=tenant_id,
                action='tenant_updated',
                entity_type='Tenant',
                entity_id=tenant_id,
                entity_name=tenant.name,
                old_values=old_values,
                new_values=updates
            )
            db.add(audit)
        
        db.commit()
        return tenant
    
    @staticmethod
    def get_tenant_modules(db: Session, tenant_id: uuid.UUID) -> List[Dict[str, Any]]:
        """Get all modules with their status for a tenant"""
        from sqlalchemy.orm import joinedload
        
        tenant_modules = db.query(TenantModule).options(
            joinedload(TenantModule.module)
        ).filter(
            TenantModule.tenant_id == tenant_id
        ).all()
        
        result = []
        for tm in tenant_modules:
            result.append({
                'id': tm.id,
                'module_id': tm.module_id,
                'code': tm.module.code,
                'name': tm.module.name,
                'description': tm.module.description,
                'category': tm.module.category,
                'is_enabled': tm.is_enabled,
                'is_core': tm.module.is_core,
                'icon': tm.module.icon,
                'enabled_at': tm.enabled_at,
                'feature_config': tm.feature_config,
                'required_modules': tm.module.required_modules
            })
        
        return result
    
    @staticmethod
    def configure_modules(
        db: Session,
        tenant_id: uuid.UUID,
        module_configs: Dict[str, bool],
        changed_by: uuid.UUID
    ) -> List[TenantModule]:
        """Configure modules for a tenant"""
        results = []
        
        for module_code, is_enabled in module_configs.items():
            module = db.query(Module).filter(Module.code == module_code).first()
            if not module:
                continue
            
            tenant_module = db.query(TenantModule).filter(
                TenantModule.tenant_id == tenant_id,
                TenantModule.module_id == module.id
            ).first()
            
            if not tenant_module:
                # Force core modules to be enabled
                if module.is_core and not is_enabled:
                    is_enabled = True
                    
                tenant_module = TenantModule(
                    tenant_id=tenant_id,
                    module_id=module.id,
                    is_enabled=is_enabled,
                    enabled_by=changed_by if is_enabled else None,
                    enabled_at=datetime.utcnow() if is_enabled else None
                )
                db.add(tenant_module)
            else:
                # Prevent disabling core modules
                if module.is_core and not is_enabled:
                    is_enabled = True
                    
                tenant_module.is_enabled = is_enabled
                if is_enabled and not tenant_module.enabled_at:
                    tenant_module.enabled_at = datetime.utcnow()
                    tenant_module.enabled_by = changed_by
            
            # Resolve dependencies when enabling
            if is_enabled:
                TenantService._resolve_module_dependencies(db, tenant_id, module)
            
            results.append(tenant_module)
            
            # Log audit
            audit = AuditLog(
                tenant_id=tenant_id,
                user_id=changed_by,
                action='module_' + ('enabled' if is_enabled else 'disabled'),
                entity_type='Module',
                entity_id=module.id,
                entity_name=module.name
            )
            db.add(audit)
        
        db.commit()
        return results
    
    @staticmethod
    def get_dashboard_stats(db: Session) -> Dict[str, Any]:
        """Get dashboard statistics for super admin"""
        total = db.query(Tenant).count()
        active = db.query(Tenant).filter(Tenant.status == 'active').count()
        pending = db.query(Tenant).filter(Tenant.status == 'pending').count()
        suspended = db.query(Tenant).filter(Tenant.status == 'suspended').count()
        
        # Subscription stats
        trial_count = db.query(TenantSubscription).filter(
            TenantSubscription.status == 'trialing'
        ).count()
        
        past_due = db.query(TenantSubscription).filter(
            TenantSubscription.status == 'past_due'
        ).count()
        
        # MRR calculation
        from sqlalchemy import func
        mrr = db.query(
            func.sum(SubscriptionPlan.base_price)
        ).join(
            TenantSubscription,
            SubscriptionPlan.id == TenantSubscription.plan_id
        ).filter(
            TenantSubscription.status == 'active'
        ).scalar() or 0
        
        # Plan distribution
        plan_dist = {}
        plan_query = db.query(
            SubscriptionPlan.code,
            func.count(TenantSubscription.id)
        ).join(
            TenantSubscription,
            SubscriptionPlan.id == TenantSubscription.plan_id
        ).filter(
            TenantSubscription.status.in_(['trialing', 'active', 'past_due'])
        ).group_by(SubscriptionPlan.code).all()
        
        for code, count in plan_query:
            plan_dist[code] = count
        
        # Recent signups (last 30 days)
        recent = db.query(Tenant).filter(
            Tenant.created_at >= datetime.utcnow() - timedelta(days=30)
        ).count()
        
        return {
            'total_tenants': total,
            'active_tenants': active,
            'trial_tenants': trial_count,
            'past_due_tenants': past_due,
            'suspended_tenants': suspended,
            'pending_tenants': pending,
            'mrr': float(mrr),
            'plan_distribution': plan_dist,
            'recent_signups': recent
        }
