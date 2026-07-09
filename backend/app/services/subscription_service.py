"""
Subscription management service for billing and plan lifecycle.
"""
import uuid
import logging
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Dict, Any
from decimal import Decimal

from sqlalchemy.orm import Session
from sqlalchemy import func

from ..models.tenant import (
    SubscriptionPlan, TenantSubscription, Tenant,
    UsageTracking, BillingInvoice, AuditLog
)
from ..models.patient import Patient
from ..models.appointment import Appointment
from ..models.user import User

logger = logging.getLogger(__name__)


class SubscriptionService:
    """Service for subscription lifecycle and billing"""
    
    @staticmethod
    def get_plan_by_id(db: Session, plan_id: uuid.UUID) -> Optional[SubscriptionPlan]:
        """Get plan by ID"""
        return db.query(SubscriptionPlan).filter(SubscriptionPlan.id == plan_id).first()
    
    @staticmethod
    def get_plan_by_code(db: Session, code: str) -> Optional[SubscriptionPlan]:
        """Get plan by code"""
        return db.query(SubscriptionPlan).filter(SubscriptionPlan.code == code).first()
    
    @staticmethod
    def list_plans(
        db: Session,
        include_inactive: bool = False
    ) -> List[SubscriptionPlan]:
        """List subscription plans"""
        query = db.query(SubscriptionPlan)
        if not include_inactive:
            query = query.filter(SubscriptionPlan.is_active == True)
        return query.order_by(SubscriptionPlan.sort_order).all()
    
    @staticmethod
    def create_plan(
        db: Session,
        code: str,
        name: str,
        description: str,
        base_price: Decimal,
        **kwargs
    ) -> SubscriptionPlan:
        """Create a new subscription plan"""
        plan = SubscriptionPlan(
            code=code,
            name=name,
            description=description,
            base_price=base_price,
            **kwargs
        )
        db.add(plan)
        db.commit()
        db.refresh(plan)
        return plan
    
    @staticmethod
    def update_plan(
        db: Session,
        plan_id: uuid.UUID,
        **updates
    ) -> Optional[SubscriptionPlan]:
        """Update plan details"""
        plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == plan_id).first()
        if not plan:
            return None
        
        for key, value in updates.items():
            if hasattr(plan, key):
                setattr(plan, key, value)
        
        plan.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(plan)
        return plan
    
    @staticmethod
    def get_active_subscription(
        db: Session,
        tenant_id: uuid.UUID
    ) -> Optional[TenantSubscription]:
        """Get active subscription for tenant"""
        return db.query(TenantSubscription).filter(
            TenantSubscription.tenant_id == tenant_id,
            TenantSubscription.status.in_(['trialing', 'active', 'past_due'])
        ).first()
    
    @staticmethod
    def create_subscription(
        db: Session,
        tenant_id: uuid.UUID,
        plan_id: uuid.UUID,
        trial_days: int = 14,
        **kwargs
    ) -> TenantSubscription:
        """Create a new subscription for tenant"""
        now = datetime.now(timezone.utc)
        
        subscription = TenantSubscription(
            tenant_id=tenant_id,
            plan_id=plan_id,
            status='trialing',
            trial_ends_at=now + timedelta(days=trial_days),
            current_period_start=now,
            current_period_end=now + timedelta(days=30),
            **kwargs
        )
        db.add(subscription)
        db.commit()
        db.refresh(subscription)
        return subscription
    
    @staticmethod
    def change_plan(
        db: Session,
        tenant_id: uuid.UUID,
        new_plan_id: uuid.UUID,
        changed_by: uuid.UUID,
        immediate: bool = False
    ) -> TenantSubscription:
        """Change tenant's subscription plan"""
        subscription = SubscriptionService.get_active_subscription(db, tenant_id)
        if not subscription:
            raise ValueError("No active subscription found")
        
        old_plan_id = subscription.plan_id
        
        if immediate:
            # Immediate change
            subscription.plan_id = new_plan_id
            subscription.updated_at = datetime.now(timezone.utc)
        else:
            # Schedule change at period end
            subscription.custom_features = {
                **(subscription.custom_features or {}),
                'pending_plan_change': str(new_plan_id),
                'plan_change_scheduled_at': datetime.now(timezone.utc).isoformat()
            }
        
        # Log audit
        audit = AuditLog(
            tenant_id=tenant_id,
            user_id=changed_by,
            action='plan_changed',
            entity_type='Subscription',
            entity_id=subscription.id,
            old_values={'plan_id': str(old_plan_id)},
            new_values={'plan_id': str(new_plan_id), 'immediate': immediate}
        )
        db.add(audit)
        
        db.commit()
        db.refresh(subscription)
        return subscription
    
    @staticmethod
    def cancel_subscription(
        db: Session,
        tenant_id: uuid.UUID,
        reason: str,
        cancelled_by: uuid.UUID,
        at_period_end: bool = True
    ) -> TenantSubscription:
        """Cancel tenant subscription"""
        subscription = SubscriptionService.get_active_subscription(db, tenant_id)
        if not subscription:
            raise ValueError("No active subscription found")
        
        if at_period_end:
            subscription.cancel_at_period_end = True
        else:
            subscription.status = 'cancelled'
            subscription.cancelled_at = datetime.now(timezone.utc)
        
        subscription.cancellation_reason = reason
        subscription.updated_at = datetime.now(timezone.utc)
        
        # Log audit
        audit = AuditLog(
            tenant_id=tenant_id,
            user_id=cancelled_by,
            action='subscription_cancelled',
            entity_type='Subscription',
            entity_id=subscription.id,
            new_values={'reason': reason, 'at_period_end': at_period_end}
        )
        db.add(audit)
        
        db.commit()
        db.refresh(subscription)
        return subscription
    
    @staticmethod
    def reactivate_subscription(
        db: Session,
        tenant_id: uuid.UUID,
        new_plan_id: Optional[uuid.UUID] = None,
        activated_by: Optional[uuid.UUID] = None
    ) -> TenantSubscription:
        """Reactivate a suspended/cancelled subscription"""
        subscription = db.query(TenantSubscription).filter(
            TenantSubscription.tenant_id == tenant_id
        ).order_by(TenantSubscription.created_at.desc()).first()
        
        if not subscription:
            raise ValueError("No subscription found")
        
        now = datetime.now(timezone.utc)
        
        # Create new subscription period
        if new_plan_id:
            subscription.plan_id = new_plan_id
        
        subscription.status = 'active'
        subscription.cancel_at_period_end = False
        subscription.cancelled_at = None
        subscription.cancellation_reason = None
        subscription.current_period_start = now
        subscription.current_period_end = now + timedelta(days=30)
        subscription.updated_at = now
        
        # Update tenant status
        tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
        if tenant:
            tenant.status = 'active'
        
        # Log audit
        audit = AuditLog(
            tenant_id=tenant_id,
            user_id=activated_by,
            action='subscription_reactivated',
            entity_type='Subscription',
            entity_id=subscription.id,
            new_values={'plan_id': str(subscription.plan_id)}
        )
        db.add(audit)
        
        db.commit()
        db.refresh(subscription)
        return subscription
    
    @staticmethod
    def _get_real_count(db: Session, tenant_id: uuid.UUID, resource_type: str) -> int:
        """Query actual DB table count for a resource type."""
        if resource_type == 'patients':
            return db.query(func.count(Patient.id)).filter(
                Patient.hospital_id == tenant_id,
                Patient.is_active == True  # noqa: E712
            ).scalar() or 0
        elif resource_type == 'appointments':
            return db.query(func.count(Appointment.id)).filter(
                Appointment.hospital_id == tenant_id
            ).scalar() or 0
        elif resource_type == 'users':
            return db.query(func.count(User.id)).filter(
                User.hospital_id == tenant_id,
                User.is_active == True  # noqa: E712
            ).scalar() or 0
        else:
            # For storage and unknown types fall back to UsageTracking sum
            now = datetime.now(timezone.utc)
            usage = db.query(UsageTracking).filter(
                UsageTracking.tenant_id == tenant_id,
                UsageTracking.resource_type == resource_type,
                UsageTracking.period_year == now.year,
                UsageTracking.period_month == now.month
            ).first()
            return usage.usage_count if usage else 0

    @staticmethod
    def get_usage_quota(
        db: Session,
        tenant_id: uuid.UUID,
        resource_type: str
    ) -> Dict[str, Any]:
        """Get current usage vs limit for a resource"""
        subscription = SubscriptionService.get_active_subscription(db, tenant_id)

        max_limit = None
        if subscription:
            max_limit = subscription.get_effective_limit(resource_type)

        current = SubscriptionService._get_real_count(db, tenant_id, resource_type)

        now = datetime.now(timezone.utc)
        percentage = 0
        if max_limit and max_limit > 0:
            percentage = (current / max_limit) * 100
        elif max_limit is None:
            percentage = 0  # Unlimited
        else:
            percentage = 100

        return {
            'resource_type': resource_type,
            'current_usage': current,
            'max_limit': max_limit,
            'percentage_used': round(percentage, 2),
            'period': f"{now.year}-{now.month:02d}"
        }
    
    @staticmethod
    def track_usage(
        db: Session,
        tenant_id: uuid.UUID,
        resource_type: str,
        quantity: int = 1
    ) -> UsageTracking:
        """Track resource usage"""
        now = datetime.now(timezone.utc)
        
        usage = db.query(UsageTracking).filter(
            UsageTracking.tenant_id == tenant_id,
            UsageTracking.resource_type == resource_type,
            UsageTracking.period_year == now.year,
            UsageTracking.period_month == now.month
        ).first()
        
        if not usage:
            usage = UsageTracking(
                tenant_id=tenant_id,
                resource_type=resource_type,
                period_year=now.year,
                period_month=now.month,
                usage_count=0
            )
            db.add(usage)
        
        usage.usage_count += quantity
        
        # Check limit
        subscription = SubscriptionService.get_active_subscription(db, tenant_id)
        if subscription:
            max_limit = subscription.get_effective_limit(resource_type)
            if max_limit and usage.usage_count >= max_limit:
                usage.limit_reached_at = now
        
        usage.updated_at = now
        db.commit()
        db.refresh(usage)
        return usage
    
    @staticmethod
    def check_limit(
        db: Session,
        tenant_id: uuid.UUID,
        resource_type: str
    ) -> bool:
        """Check if tenant has reached their limit"""
        quota = SubscriptionService.get_usage_quota(db, tenant_id, resource_type)
        max_limit = quota['max_limit']
        
        if max_limit is None:
            return True  # Unlimited
        
        return quota['current_usage'] < max_limit
    
    @staticmethod
    def get_all_quotas(
        db: Session,
        tenant_id: uuid.UUID
    ) -> List[Dict[str, Any]]:
        """Get all usage quotas for tenant"""
        resources = ['users', 'patients', 'appointments', 'storage']
        return [SubscriptionService.get_usage_quota(db, tenant_id, r) for r in resources]


class BillingService:
    """Service for invoice generation and payment handling"""
    
    @staticmethod
    def generate_invoice_number() -> str:
        """Generate unique invoice number"""
        from datetime import datetime
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d")
        unique = uuid.uuid4().hex[:6].upper()
        return f"INV-{timestamp}-{unique}"
    
    @staticmethod
    def create_invoice(
        db: Session,
        tenant_id: uuid.UUID,
        subscription_id: uuid.UUID,
        items: List[Dict[str, Any]],
        subtotal: Decimal,
        tax_amount: Decimal = Decimal('0.00'),
        due_date: Optional[datetime] = None
    ) -> BillingInvoice:
        """Create a new billing invoice"""
        now = datetime.now(timezone.utc)
        
        if not due_date:
            due_date = now + timedelta(days=7)
        
        total = subtotal + tax_amount
        
        invoice = BillingInvoice(
            tenant_id=tenant_id,
            subscription_id=subscription_id,
            invoice_number=BillingService.generate_invoice_number(),
            status='open',
            subtotal=subtotal,
            tax_amount=tax_amount,
            total=total,
            amount_due=total,
            invoice_date=now,
            due_date=due_date,
            line_items=items
        )
        db.add(invoice)
        db.commit()
        db.refresh(invoice)
        return invoice
    
    @staticmethod
    def record_payment(
        db: Session,
        invoice_id: uuid.UUID,
        amount: Decimal,
        payment_method: str,
        payment_reference: str
    ) -> BillingInvoice:
        """Record payment against an invoice"""
        invoice = db.query(BillingInvoice).filter(
            BillingInvoice.id == invoice_id
        ).first()
        
        if not invoice:
            raise ValueError("Invoice not found")
        
        invoice.amount_paid += amount
        invoice.amount_due = invoice.total - invoice.amount_paid
        
        if invoice.amount_due <= 0:
            invoice.status = 'paid'
            invoice.paid_at = datetime.now(timezone.utc)
        else:
            invoice.status = 'partially_paid'
        
        invoice.payment_method = payment_method
        invoice.payment_reference = payment_reference
        invoice.updated_at = datetime.now(timezone.utc)
        
        db.commit()
        db.refresh(invoice)
        return invoice
    
    @staticmethod
    def get_invoices(
        db: Session,
        tenant_id: Optional[uuid.UUID] = None,
        status: Optional[str] = None,
        limit: int = 50
    ) -> List[BillingInvoice]:
        """Get invoices with optional filtering"""
        query = db.query(BillingInvoice)
        
        if tenant_id:
            query = query.filter(BillingInvoice.tenant_id == tenant_id)
        
        if status:
            query = query.filter(BillingInvoice.status == status)
        
        return query.order_by(BillingInvoice.created_at.desc()).limit(limit).all()
