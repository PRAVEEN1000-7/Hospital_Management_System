"""
Rate limiting for multi-tenant SaaS — prevents noisy neighbor problem.
Per-tenant rate limiting to ensure fair usage across all tenants.
"""
import logging
import time
import uuid
from typing import Optional, Dict, Tuple
from datetime import datetime, timedelta
from functools import wraps

from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from redis import Redis

from ..config import settings
from ..models.tenant import Tenant

logger = logging.getLogger(__name__)


class RateLimiter:
    """Rate limiter with per-tenant tracking"""
    
    def __init__(self, redis_client: Optional[Redis] = None):
        """Initialize rate limiter (optional Redis for distributed systems)"""
        self.redis = redis_client
        self.memory_store: Dict[str, list] = {}  # Fallback: in-memory store
    
    def _get_key(self, tenant_id: uuid.UUID, key_type: str = "api") -> str:
        """Generate rate limit key"""
        return f"ratelimit:{tenant_id}:{key_type}"
    
    def _get_login_key(self, username: str) -> str:
        """Generate login rate limit key"""
        return f"ratelimit:login:{username}"
    
    def check_limit(
        self,
        tenant_id: uuid.UUID,
        requests_per_minute: int = None,
        requests_per_hour: int = None,
        key_type: str = "api"
    ) -> Tuple[bool, Dict[str, int]]:
        """
        Check if request is within rate limits.
        
        Returns:
            (is_allowed: bool, stats: {requests_used, limit, reset_at_timestamp})
        """
        if not settings.RATE_LIMIT_ENABLED:
            return True, {}
        
        requests_per_minute = requests_per_minute or settings.RATE_LIMIT_REQUESTS_PER_MINUTE
        requests_per_hour = requests_per_hour or settings.RATE_LIMIT_REQUESTS_PER_HOUR
        
        key = self._get_key(tenant_id, key_type)
        now = time.time()
        
        if self.redis:
            return self._check_limit_redis(key, requests_per_minute, requests_per_hour, now)
        else:
            return self._check_limit_memory(key, requests_per_minute, requests_per_hour, now)
    
    def _check_limit_redis(
        self,
        key: str,
        requests_per_minute: int,
        requests_per_hour: int,
        now: float
    ) -> Tuple[bool, Dict[str, int]]:
        """Check rate limit using Redis (for distributed systems)"""
        try:
            # Get request history from Redis
            requests = self.redis.lrange(key, 0, -1)
            request_times = [float(r) for r in requests]
            
            # Remove old requests
            cutoff_hour = now - 3600
            cutoff_minute = now - 60
            request_times = [t for t in request_times if t > cutoff_hour]
            
            # Check minute limit
            recent_requests = [t for t in request_times if t > cutoff_minute]
            if len(recent_requests) >= requests_per_minute:
                return False, {
                    "requests_used": len(recent_requests),
                    "limit": requests_per_minute,
                    "window": "minute"
                }
            
            # Check hour limit
            if len(request_times) >= requests_per_hour:
                return False, {
                    "requests_used": len(request_times),
                    "limit": requests_per_hour,
                    "window": "hour"
                }
            
            # Add current request
            self.redis.lpush(key, now)
            self.redis.expire(key, 3600)  # Expire after 1 hour
            
            return True, {
                "requests_used": len(recent_requests) + 1,
                "limit": requests_per_minute,
                "window": "minute"
            }
        except Exception as e:
            logger.error(f"Redis rate limit check failed: {e}")
            # Fail open (allow request) if Redis fails
            return True, {}
    
    def _check_limit_memory(
        self,
        key: str,
        requests_per_minute: int,
        requests_per_hour: int,
        now: float
    ) -> Tuple[bool, Dict[str, int]]:
        """Check rate limit using in-memory store (single server only)"""
        if key not in self.memory_store:
            self.memory_store[key] = []
        
        request_times = self.memory_store[key]
        
        # Remove old requests
        cutoff_hour = now - 3600
        cutoff_minute = now - 60
        request_times = [t for t in request_times if t > cutoff_hour]
        
        # Check minute limit
        recent_requests = [t for t in request_times if t > cutoff_minute]
        if len(recent_requests) >= requests_per_minute:
            return False, {
                "requests_used": len(recent_requests),
                "limit": requests_per_minute,
                "window": "minute"
            }
        
        # Check hour limit
        if len(request_times) >= requests_per_hour:
            return False, {
                "requests_used": len(request_times),
                "limit": requests_per_hour,
                "window": "hour"
            }
        
        # Add current request
        request_times.append(now)
        self.memory_store[key] = request_times
        
        return True, {
            "requests_used": len(recent_requests) + 1,
            "limit": requests_per_minute,
            "window": "minute"
        }
    
    def check_login_limit(self, username: str) -> Tuple[bool, Dict[str, int]]:
        """
        Check login rate limit (prevents brute force).
        Max 5 attempts per 5 minutes per username.
        """
        if not settings.RATE_LIMIT_ENABLED:
            return True, {}
        
        key = self._get_login_key(username)
        now = time.time()
        max_attempts = settings.RATE_LIMIT_LOGIN_ATTEMPTS
        window = 300  # 5 minutes
        
        if self.redis:
            return self._check_login_limit_redis(key, max_attempts, window, now)
        else:
            return self._check_login_limit_memory(key, max_attempts, window, now)
    
    def _check_login_limit_redis(
        self,
        key: str,
        max_attempts: int,
        window: int,
        now: float
    ) -> Tuple[bool, Dict[str, int]]:
        """Check login rate limit using Redis"""
        try:
            attempts = int(self.redis.get(key) or 0)
            
            if attempts >= max_attempts:
                return False, {
                    "attempts": attempts,
                    "limit": max_attempts,
                    "window_seconds": window
                }
            
            self.redis.incr(key)
            self.redis.expire(key, window)
            
            return True, {"attempts": attempts + 1, "limit": max_attempts}
        except Exception as e:
            logger.error(f"Redis login limit check failed: {e}")
            return True, {}
    
    def _check_login_limit_memory(
        self,
        key: str,
        max_attempts: int,
        window: int,
        now: float
    ) -> Tuple[bool, Dict[str, int]]:
        """Check login rate limit using in-memory store"""
        if key not in self.memory_store:
            self.memory_store[key] = []
        
        attempts_list = self.memory_store[key]
        cutoff = now - window
        
        # Remove old attempts
        attempts_list = [t for t in attempts_list if t > cutoff]
        
        if len(attempts_list) >= max_attempts:
            return False, {
                "attempts": len(attempts_list),
                "limit": max_attempts,
                "window_seconds": window
            }
        
        # Add current attempt
        attempts_list.append(now)
        self.memory_store[key] = attempts_list
        
        return True, {"attempts": len(attempts_list), "limit": max_attempts}
    
    def reset_tenant_limits(self, tenant_id: uuid.UUID):
        """Reset all limits for a tenant (admin action)"""
        if self.redis:
            keys = self.redis.keys(f"ratelimit:{tenant_id}:*")
            if keys:
                self.redis.delete(*keys)
        else:
            prefix = f"ratelimit:{tenant_id}:"
            keys_to_delete = [k for k in self.memory_store if k.startswith(prefix)]
            for k in keys_to_delete:
                del self.memory_store[k]
        
        logger.info(f"Rate limits reset for tenant {tenant_id}")


# Global rate limiter instance
_rate_limiter: Optional[RateLimiter] = None


def get_rate_limiter() -> RateLimiter:
    """Get or create rate limiter instance"""
    global _rate_limiter
    if _rate_limiter is None:
        _rate_limiter = RateLimiter()
    return _rate_limiter


def check_tenant_rate_limit(
    tenant_id: uuid.UUID,
    requests_per_minute: int = None,
    requests_per_hour: int = None
):
    """
    Dependency to check rate limit for tenant.
    
    Usage:
        @router.get("/data")
        async def get_data(
            current_user: User = Depends(get_current_active_user),
            _: None = Depends(check_tenant_rate_limit)
        ):
            pass
    """
    def _check():
        limiter = get_rate_limiter()
        is_allowed, stats = limiter.check_limit(
            tenant_id,
            requests_per_minute,
            requests_per_hour
        )
        
        if not is_allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded. Max {stats['limit']} requests per {stats['window']}.",
                headers={
                    "X-RateLimit-Limit": str(stats['limit']),
                    "X-RateLimit-Used": str(stats['requests_used']),
                    "Retry-After": "60"
                }
            )
        
        return True
    
    return _check
