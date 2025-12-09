# Improvement Plan (Prioritized)

## Priority Levels
- **P1**: Critical - Security, data integrity, performance bottlenecks
- **P2**: High - Code quality, maintainability, scalability
- **P3**: Medium - Nice-to-have, technical debt

## Effort Levels
- **Low**: < 1 day
- **Medium**: 1-3 days
- **High**: > 3 days

---

## P1 - Critical Improvements

### 1. Database Indexes

**Priority**: P1  
**Effort**: Low

**Issue**: Missing indexes on frequently queried columns

**Actions**:
1. Add index on `bet.status` for status filtering
2. Add composite index on `(userId, createdAt)` for user bet history
3. Add composite index on `(operatorId, status, createdAt)` for agent queries
4. Add index on `wallet_audit.createdAt` for time-based queries

**Files**:
- `src/entities/bet.entity.ts`
- `src/entities/wallet-audit.entity.ts`

**Impact**: Significant query performance improvement

---

### 2. Security: CORS Configuration

**Priority**: P1  
**Effort**: Low

**Issue**: `origin: '*'` allows all origins

**Actions**:
1. Add `CORS_ORIGINS` environment variable
2. Parse comma-separated origins
3. Restrict CORS to allowed origins in production
4. Keep `*` for development

**Files**:
- `src/main.ts`
- `src/config/app.config.ts`

**Impact**: Prevents CSRF attacks

---

### 3. Security: JWT Secret Validation

**Priority**: P1  
**Effort**: Low

**Issue**: Default secret not validated

**Actions**:
1. Add startup validation for JWT secret
2. Fail startup if default secret in production
3. Require minimum secret length (32 characters)

**Files**:
- `src/main.ts`
- `src/config/jwt.config.ts`

**Impact**: Prevents security vulnerabilities

---

### 4. Database Transactions

**Priority**: P1  
**Effort**: Medium

**Issue**: Related operations not atomic

**Actions**:
1. Wrap bet settlement in transaction
2. Wrap bet creation + session creation in transaction (if possible)
3. Ensure audit logging doesn't block transactions

**Files**:
- `src/routes/gamePlay/game-play.service.ts`
- `src/modules/bet/bet.service.ts`

**Impact**: Data integrity, prevents partial updates

---

### 5. Redis TTL Enforcement

**Priority**: P1  
**Effort**: Low

**Issue**: Some keys may not have TTL

**Actions**:
1. Audit all Redis SET operations
2. Ensure all session data has TTL
3. Add validation to prevent setting keys without TTL

**Files**:
- `src/modules/redis/redis.service.ts`
- All services using Redis

**Impact**: Prevents memory leaks

---

### 6. Unit Test Coverage

**Priority**: P1  
**Effort**: High

**Issue**: Limited test coverage

**Actions**:
1. Add unit tests for critical services:
   - `GamePlayService`
   - `SingleWalletFunctionsService`
   - `WalletRetryJobService`
   - `BetService`
2. Target 80% coverage for critical paths
3. Add tests for error scenarios

**Files**:
- Create `*.spec.ts` files for each service

**Impact**: Prevents regressions, improves code quality

---

## P2 - High Priority Improvements

### 7. Remove Hardcoded URLs

**Priority**: P2  
**Effort**: Low

**Issue**: Hardcoded URL in wallet service

**Actions**:
1. Remove hardcoded URL
2. Use `callbackURL` from agent configuration
3. Add fallback URL to configuration if needed

**Files**:
- `src/routes/single-wallet-functions/single-wallet-functions.service.ts`

**Impact**: Better configurability

---

### 8. Refactor Large Functions

**Priority**: P2  
**Effort**: Medium

**Issue**: `settleBet()` and `refundBet()` are too long

**Actions**:
1. Extract error handling to separate method
2. Extract audit logging to separate method
3. Extract retry job creation to separate method
4. Break into smaller, testable functions

**Files**:
- `src/routes/single-wallet-functions/single-wallet-functions.service.ts`

**Impact**: Better maintainability, testability

---

### 9. Remove Circular Dependencies

**Priority**: P2  
**Effort**: Medium

**Issue**: Forward reference to `GameConfigService` in `RedisService`

**Actions**:
1. Move TTL configuration to separate service
2. Inject configuration service instead of game config service
3. Or: Use event-based communication

**Files**:
- `src/modules/redis/redis.service.ts`
- `src/modules/gameConfig/game-config.service.ts`

**Impact**: Better architecture, easier testing

---

### 10. Comprehensive Input Validation

**Priority**: P2  
**Effort**: Medium

**Issue**: Some inputs not fully validated

**Actions**:
1. Add DTOs for all WebSocket payloads
2. Add class-validator decorators
3. Validate bet amounts against user limits
4. Validate currency against supported list

**Files**:
- `src/routes/gamePlay/DTO/*.dto.ts`
- `src/routes/gamePlay/game-play.service.ts`

**Impact**: Prevents invalid data, improves security

---

### 11. Standardize Error Handling

**Priority**: P2  
**Effort**: Medium

**Issue**: Inconsistent error handling patterns

**Actions**:
1. Create error handling utility
2. Standardize error response format
3. Ensure all errors are logged with context
4. Use proper logger instead of console.error

**Files**:
- Create `src/common/errors/` directory
- Update all services

**Impact**: Better error tracking, debugging

---

### 12. Add Application Metrics

**Priority**: P2  
**Effort**: High

**Issue**: No metrics collection

**Actions**:
1. Add Prometheus metrics
2. Track: request count, response times, error rates
3. Track: active sessions, retry job counts
4. Add Grafana dashboards

**Files**:
- Create `src/common/metrics/` directory
- Add metrics middleware

**Impact**: Better observability, performance monitoring

---

### 13. Memory Leak Prevention

**Priority**: P2  
**Effort**: Medium

**Issue**: Potential memory leaks in connections and listeners

**Actions**:
1. Implement proper cleanup in `onModuleDestroy`
2. Close Redis connections on shutdown
3. Remove WebSocket event listeners
4. Add memory monitoring

**Files**:
- `src/modules/redis/redis.provider.ts`
- `src/modules/redis/pub-sub.service.ts`
- `src/routes/gamePlay/game-play.gateway.ts`

**Impact**: Prevents memory leaks, improves stability

---

### 14. Query Optimization

**Priority**: P2  
**Effort**: Medium

**Issue**: Some queries may not be optimized

**Actions**:
1. Analyze slow queries
2. Add missing indexes
3. Optimize bet history queries
4. Use query result caching where appropriate

**Files**:
- `src/modules/bet/bet.service.ts`
- Database migration files

**Impact**: Better performance, reduced database load

---

## P3 - Medium Priority Improvements

### 15. Extract Magic Numbers

**Priority**: P3  
**Effort**: Low

**Issue**: Hardcoded values throughout codebase

**Actions**:
1. Extract to constants in `defaults.config.ts`
2. Document each constant
3. Use constants instead of magic numbers

**Files**:
- `src/config/defaults.config.ts`
- Multiple service files

**Impact**: Better maintainability

---

### 16. Remove Dead Code

**Priority**: P3  
**Effort**: Low

**Issue**: Commented-out code blocks

**Actions**:
1. Remove commented code
2. Use version control for history
3. Document why code was removed if needed

**Files**:
- `src/routes/gamePlay/game-play.gateway.ts`
- Other files with commented code

**Impact**: Cleaner codebase

---

### 17. Add JSDoc Comments

**Priority**: P3  
**Effort**: Medium

**Issue**: Missing documentation

**Actions**:
1. Add JSDoc to all public methods
2. Document parameters and return types
3. Add examples where helpful

**Files**:
- All service files
- All controller files

**Impact**: Better developer experience

---

### 18. Standardize Naming

**Priority**: P3  
**Effort**: Low

**Issue**: Mixed naming conventions

**Actions**:
1. Standardize on camelCase for TypeScript
2. Update database column names if needed (or use @Column name mapping)
3. Update all variable names

**Files**:
- All TypeScript files

**Impact**: Better code consistency

---

### 19. Add Integration Tests

**Priority**: P3  
**Effort**: High

**Issue**: No integration tests

**Actions**:
1. Set up test database
2. Add integration tests for API endpoints
3. Test critical flows: bet, step, cashout
4. Add CI/CD integration

**Files**:
- Create `test/integration/` directory

**Impact**: Prevents integration issues

---

### 20. Add E2E Tests

**Priority**: P3  
**Effort**: High

**Issue**: No end-to-end tests

**Actions**:
1. Set up E2E test framework
2. Test complete user flows
3. Test WebSocket connections
4. Add to CI/CD pipeline

**Files**:
- Create `test/e2e/` directory

**Impact**: Prevents end-to-end issues

---

## Implementation Roadmap

### Phase 1: Critical Security & Performance (Weeks 1-2)
1. Database indexes (P1)
2. CORS configuration (P1)
3. JWT secret validation (P1)
4. Redis TTL enforcement (P1)
5. Database transactions (P1)

### Phase 2: Code Quality & Testing (Weeks 3-4)
6. Unit test coverage (P1)
7. Remove hardcoded URLs (P2)
8. Refactor large functions (P2)
9. Comprehensive validation (P2)

### Phase 3: Architecture & Observability (Weeks 5-6)
10. Remove circular dependencies (P2)
11. Standardize error handling (P2)
12. Add application metrics (P2)
13. Memory leak prevention (P2)

### Phase 4: Optimization & Polish (Weeks 7-8)
14. Query optimization (P2)
15. Extract magic numbers (P3)
16. Remove dead code (P3)
17. Add JSDoc comments (P3)

### Phase 5: Testing & Documentation (Weeks 9-10)
18. Standardize naming (P3)
19. Add integration tests (P3)
20. Add E2E tests (P3)

---

## Quick Wins (Can be done immediately)

1. **Add database indexes** (1-2 hours)
2. **Extract hardcoded URL** (30 minutes)
3. **Add JWT secret validation** (1 hour)
4. **Extract magic numbers** (2 hours)
5. **Remove dead code** (1 hour)

---

## Long-Term Improvements

### Architecture
- Consider microservices for wallet operations
- Implement event-driven architecture
- Add message queue for async operations

### Scalability
- Implement read replicas for database
- Add Redis cluster for high availability
- Implement horizontal scaling for WebSocket

### Monitoring
- Add APM (Application Performance Monitoring)
- Implement distributed tracing
- Add business metrics dashboard

### Security
- Implement rate limiting
- Add request signing
- Implement API versioning
- Add audit logging for all operations

---

## Success Metrics

### Performance
- API response time < 200ms (p95)
- Database query time < 100ms (p95)
- Redis operation time < 10ms (p95)

### Reliability
- Uptime > 99.9%
- Error rate < 0.1%
- Retry success rate > 95%

### Code Quality
- Test coverage > 80%
- Code complexity < 10 (cyclomatic)
- No critical security vulnerabilities

---

## Notes

- Prioritize based on business impact
- Some improvements can be done in parallel
- Consider breaking large improvements into smaller PRs
- Document all changes in commit messages
- Update this plan as improvements are completed

