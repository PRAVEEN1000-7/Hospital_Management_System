# Quick Deployment Checklist - HMS Multi-Tenant Security Fixes

**Date**: 2026-05-08  
**Version**: 1.0  
**Status**: READY FOR DEPLOYMENT ✅

---

## Pre-Deployment (1 hour)

### Environment Setup
- [ ] Backup database
  ```bash
  pg_dump hms_db > backup_$(date +%Y%m%d_%H%M%S).sql
  ```
- [ ] Verify database connectivity
  ```bash
  psql -h localhost -U hms_user -d hms_db -c "SELECT version();"
  ```
- [ ] Check available disk space (> 5GB)
- [ ] Verify Python 3.11+ installed
- [ ] Verify PostgreSQL 15+ running

### Code Review
- [ ] Review `MULTI_TENANT_LOOPHOLES_AND_BUGS.md`
- [ ] Review `SECURITY_IMPLEMENTATION_GUIDE.md`
- [ ] Review all new security files:
  - `backend/app/core/tenant_security.py`
  - `backend/app/core/audit_logger.py`
  - `backend/app/core/rate_limiter.py`
  - `backend/app/services/user_capacity_service.py`
- [ ] Code review approval obtained

### Testing
- [ ] Run all security tests locally
  ```bash
  cd backend
  pytest tests/test_multi_tenant_security.py -v
  ```
- [ ] All tests passing ✅
- [ ] No new warnings in logs

---

## Phase 1: Database Migration (30 min)

### Backup & Pre-Migration Check
- [ ] Create database backup
  ```bash
  pg_dump hms_db > backup_pre_security_$(date +%Y%m%d_%H%M%S).sql
  gzip backup_pre_security_*.sql
  ```
- [ ] Verify backup size (should be > 50MB for real data)
- [ ] Verify no active transactions
  ```bash
  psql -U hms_user -d hms_db -c "SELECT * FROM pg_stat_activity WHERE state != 'idle';"
  ```

### Run Migration
- [ ] Connect to database
  ```bash
  psql -U hms_user -d hms_db
  ```
- [ ] Run migration script
  ```sql
  \i /path/to/database_hole/07_security_schema_fixes.sql
  ```
- [ ] Wait for completion (should be < 5 minutes)
- [ ] No errors in migration log

### Post-Migration Verification
- [ ] Verify new tables created
  ```bash
  psql -U hms_user -d hms_db -c "\dt saas_core.*"
  ```
- [ ] Verify hospitals.tenant_id column added
  ```bash
  psql -U hms_user -d hms_db -c "\d hospitals"
  ```
- [ ] Verify indexes created
  ```bash
  psql -U hms_user -d hms_db -c "SELECT indexname FROM pg_indexes WHERE schemaname='public' LIMIT 5;"
  ```
- [ ] Check database integrity
  ```bash
  psql -U hms_user -d hms_db -c "REINDEX DATABASE hms_db;"
  ```

### Data Validation
- [ ] Count hospitals
  ```bash
  psql -U hms_user -d hms_db -c "SELECT COUNT(*) FROM hospitals;"
  ```
- [ ] Count tenants
  ```bash
  psql -U hms_user -d hms_db -c "SELECT COUNT(*) FROM saas_core.tenants;"
  ```
- [ ] Verify hospitals.tenant_id populated
  ```bash
  psql -U hms_user -d hms_db -c "SELECT COUNT(*) FROM hospitals WHERE tenant_id IS NULL;"
  ```
  - Expected: 0 (all hospitals linked to tenants)

---

## Phase 2: Application Code Deployment (45 min)

### Dependency Installation
- [ ] Install Python dependencies
  ```bash
  cd backend
  pip install -r requirements.txt
  ```
- [ ] Verify new modules can be imported
  ```bash
  python -c "from app.core.tenant_security import TenantValidator; print('OK')"
  python -c "from app.core.audit_logger import AuditLogger; print('OK')"
  python -c "from app.core.rate_limiter import RateLimiter; print('OK')"
  ```

### Environment Configuration
- [ ] Add to `.env` file:
  ```bash
  # Rate Limiting
  RATE_LIMIT_ENABLED=true
  RATE_LIMIT_REQUESTS_PER_MINUTE=100
  RATE_LIMIT_REQUESTS_PER_HOUR=5000
  RATE_LIMIT_LOGIN_ATTEMPTS=5
  ```
- [ ] Verify `.env` file readable
- [ ] No credentials in Git history
  ```bash
  git log --all --full-history -- ".env" | head -5
  ```

### Code Deployment
- [ ] Pull latest code
  ```bash
  git pull origin main
  ```
- [ ] Or copy new files manually
  ```bash
  cp app/core/tenant_security.py backend/app/core/
  cp app/core/audit_logger.py backend/app/core/
  cp app/core/rate_limiter.py backend/app/core/
  ```
- [ ] Verify files in place
  ```bash
  ls -la backend/app/core/*.py | grep -E "tenant_security|audit_logger|rate_limiter"
  ```

### Application Start
- [ ] Start application
  ```bash
  cd backend
  uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
  ```
- [ ] Wait for startup (< 10 seconds)
- [ ] Check for errors in console
  - No import errors
  - No database connection errors
  - No migration errors

---

## Phase 3: Verification & Testing (30 min)

### Health Checks
- [ ] API health endpoint responds
  ```bash
  curl http://localhost:8000/health
  ```
  Expected: `{"status": "ok"}`

- [ ] Database connected
  ```bash
  curl http://localhost:8000/api/health/db
  ```
  Expected: `{"database": "connected"}`

### Security Validation
- [ ] Test JWT validation
  ```bash
  # Login
  curl -X POST http://localhost:8000/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"password"}'
  ```
  Expected: `{"access_token": "...", "token_type": "bearer"}`

- [ ] Test hospital_id mismatch rejection
  ```bash
  # Get valid token, modify hospital_id, should be rejected
  # (automated test in test_multi_tenant_security.py)
  ```

- [ ] Test module access control
  ```bash
  # Try to access pharmacy without subscription
  # Should return 403
  ```

### Audit Logging
- [ ] Check audit log created
  ```bash
  ls -la logs/audit.log
  tail -n 20 logs/audit.log
  ```
- [ ] Audit entries in JSON format
  ```bash
  tail -n 1 logs/audit.log | python -m json.tool
  ```

### Rate Limiting
- [ ] Rate limiter responds
  ```bash
  for i in {1..150}; do curl -s http://localhost:8000/api/test; done
  # After 100+ requests, should get 429 Too Many Requests
  ```

### Run Test Suite
- [ ] Run security tests
  ```bash
  cd backend
  pytest tests/test_multi_tenant_security.py -v
  ```
- [ ] All tests passing
  ```
  PASSED: test_cross_tenant_isolation
  PASSED: test_subscription_enforcement
  PASSED: test_audit_logging
  PASSED: test_rate_limiting
  ```

### Performance Check
- [ ] Average request time < 100ms
  ```bash
  # Use load testing tool (ab, wrk, etc.)
  ab -n 100 -c 10 http://localhost:8000/api/patients
  ```
  Expected: Request time < 50ms, Throughput > 20 req/sec

---

## Phase 4: Production Deployment (1 hour)

### Pre-Deployment Review
- [ ] All tests passing ✅
- [ ] Performance acceptable ✅
- [ ] Database intact ✅
- [ ] Backup verified ✅
- [ ] Stakeholders notified ✅

### Deployment Window
- [ ] Schedule during low-traffic period
- [ ] Notify users of potential 2-minute maintenance window

### Docker Deployment (if applicable)
- [ ] Build new Docker image
  ```bash
  docker build -t hms:security-v2 -f Dockerfile .
  ```
- [ ] Verify image created
  ```bash
  docker images | grep hms
  ```
- [ ] Stop old container
  ```bash
  docker stop hms
  ```
- [ ] Remove old container
  ```bash
  docker rm hms
  ```
- [ ] Start new container
  ```bash
  docker run -d \
    --name hms \
    -e DATABASE_URL="..." \
    -e SECRET_KEY="..." \
    -p 8000:8000 \
    hms:security-v2
  ```
- [ ] Wait for startup (< 30 seconds)
- [ ] Check logs for errors
  ```bash
  docker logs -f hms | head -50
  ```

### Traditional Deployment (if applicable)
- [ ] Stop application
  ```bash
  systemctl stop hms
  ```
- [ ] Deploy code
  ```bash
  cp -r app /home/hms/app_new
  rm -rf /home/hms/app
  mv /home/hms/app_new /home/hms/app
  ```
- [ ] Start application
  ```bash
  systemctl start hms
  ```
- [ ] Check status
  ```bash
  systemctl status hms
  journalctl -u hms -f
  ```

### Post-Deployment Verification
- [ ] API responding to requests
  ```bash
  curl http://localhost:8000/api/patients
  ```
- [ ] No error spikes in logs
  ```bash
  tail -f logs/app.log | grep ERROR
  ```
- [ ] Database queries performing normally
  ```bash
  # Monitor slow query logs
  ```
- [ ] Audit logs being written
  ```bash
  tail -n 5 logs/audit.log
  ```

---

## Phase 5: Post-Deployment (Ongoing)

### Monitoring (First 24 hours)
- [ ] Monitor error logs
  ```bash
  watch "tail -20 logs/app.log | grep -c ERROR"
  ```
  Expected: Minimal errors (< 5/hour)

- [ ] Monitor performance
  ```bash
  watch "tail -100 logs/app.log | grep duration | tail -10"
  ```
  Expected: Request duration 10-50ms

- [ ] Monitor audit logs
  ```bash
  watch "wc -l logs/audit.log"
  ```
  Expected: Growing steadily (1-10 entries/request)

- [ ] Monitor database
  ```bash
  watch "psql -U hms_user -d hms_db -c 'SELECT COUNT(*) FROM saas_core.audit_logs;'"
  ```

### Team Communication
- [ ] Notify stakeholders: Deployment complete ✅
- [ ] Send deployment notes to team
- [ ] Schedule post-deployment review

### Backup Rotation
- [ ] Archive pre-migration backup
  ```bash
  mv backup_pre_security_*.sql.gz /backups/archive/
  ```
- [ ] Verify backup retention policy
- [ ] Test restore procedure

---

## Rollback Plan (If Issues)

### Decision Criteria
Rollback if any of:
- Critical data loss
- > 50% request failures
- Database corruption
- Security vulnerability not addressed

### Rollback Procedure (< 30 min)

1. **Stop application**
   ```bash
   docker stop hms
   # or
   systemctl stop hms
   ```

2. **Restore database**
   ```bash
   psql -U hms_user < backup_pre_security_20260508_120000.sql.gz
   ```
   Wait for restore (check size to estimate time)

3. **Restore application code**
   ```bash
   git checkout [previous-commit-hash]
   # or restore from backup
   ```

4. **Start application**
   ```bash
   docker start hms
   # or
   systemctl start hms
   ```

5. **Verify rollback successful**
   ```bash
   curl http://localhost:8000/health
   psql -U hms_user -d hms_db -c "SELECT COUNT(*) FROM hospitals;"
   ```

6. **Notify stakeholders**
   - Incident report
   - Rollback reason
   - Next steps

---

## Success Criteria ✅

After deployment, verify:

- [ ] All API endpoints responding normally
- [ ] No JWT validation failures in logs
- [ ] Audit logs contain expected entries
- [ ] Rate limiting working (test with 150+ req/min)
- [ ] Database performance unchanged (< 50ms queries)
- [ ] User login/logout working smoothly
- [ ] Module access control working
- [ ] Tenant isolation verified
- [ ] No data corruption
- [ ] Backup verified restorable

---

## Troubleshooting

### Issue: "Column 'tenant_id' does not exist"
**Solution**: Migration not run. Check `/database_hole/07_security_schema_fixes.sql` was executed.

### Issue: Import error for tenant_security
**Solution**: New files not copied. Verify files exist:
```bash
ls -la backend/app/core/tenant_security.py
```

### Issue: Rate limiting blocking all requests
**Solution**: Limits too low. Adjust in `.env`:
```bash
RATE_LIMIT_REQUESTS_PER_MINUTE=100  # Increase this
```

### Issue: "Tenant not found"
**Solution**: Hospital-tenant relationship broken. Run:
```bash
psql -U hms_user -d hms_db -c "SELECT * FROM hospitals WHERE tenant_id IS NULL LIMIT 5;"
```

### Issue: Slow requests (> 100ms)
**Solution**: Database indexes missing. Run:
```bash
psql -U hms_user -d hms_db -c "REINDEX DATABASE hms_db;"
```

---

## Support

### Documentation Files
1. **MULTI_TENANT_LOOPHOLES_AND_BUGS.md** - Issue analysis
2. **SECURITY_IMPLEMENTATION_GUIDE.md** - Detailed implementation guide
3. **QUICK_DEPLOYMENT_CHECKLIST.md** - This file (quick deployment)

### Contact
- Security team: security@company.com
- DevOps team: devops@company.com
- Database team: database@company.com

---

## Sign-Off

**Deployment Date**: _______________  
**Deployed By**: _______________  
**Verified By**: _______________  
**Approved By**: _______________

---

**Last Updated**: 2026-05-08  
**Version**: 1.0  
**Status**: READY ✅
