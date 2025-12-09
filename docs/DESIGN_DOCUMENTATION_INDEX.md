# Complete Design Documentation Index

## Overview

This directory contains comprehensive design documentation for the Chicken Road Backend application. The documentation is organized into feature-specific documents for easy navigation.

---

## Documentation Structure

### 1. [Architecture Overview](./ARCHITECTURE_OVERVIEW.md)
**High-level system architecture and design patterns**

- Overall architecture (Modular Monolith)
- Technology stack
- Major modules and services
- Request/response flow
- External services integration
- Background workers and cron jobs
- Design patterns used
- Scalability considerations
- Security architecture
- Error handling strategy
- Monitoring & observability

---

### 2. [Module Documentation](./MODULE_DOCUMENTATION.md)
**Detailed module-by-module breakdown**

- **Routes Modules**:
  - CommonApiFunctionsModule (wallet operations)
  - GameApiRoutesModule (game API)
  - GamePlayModule (WebSocket gateway)
  - SingleWalletFunctionsModule (wallet integration)

- **Business Logic Modules**:
  - AgentsModule, BetModule, UserModule
  - GameConfigModule, HazardModule, FairnessModule
  - WalletRetryModule, WalletAuditModule, WalletErrorModule

- **Infrastructure Modules**:
  - RedisModule, JwtModule, UserSessionModule, LastWinModule

- **Scheduler Modules**:
  - BetCleanupSchedulerModule, WalletAuditCleanupModule, RefundSchedulerModule

- Module dependencies graph

---

### 3. [File-Level Analysis](./FILE_LEVEL_ANALYSIS.md)
**Detailed file-by-file and function-by-function analysis**

- **Core Application Files**:
  - main.ts - Application bootstrap
  - app.module.ts - Root module

- **Route Files**:
  - Controllers and services for wallet, game API, and WebSocket
  - Function-level breakdown with inputs/outputs

- **Module Service Files**:
  - All service files with key functions
  - Step-by-step logic for each function
  - Input/output specifications

- **Entity Files**:
  - All entity definitions
  - Decorators and annotations
  - Field descriptions

- **Common Utilities**:
  - Interceptors, filters, guards, logger
  - Configuration files

---

### 4. [API Endpoints](./API_ENDPOINTS.md)
**Complete API endpoint documentation**

- **Wallet API** (`/wallet/*`):
  - Create Member
  - Login
  - Login and Launch Game
  - Logout

- **Game API** (`/api/*`):
  - Authenticate Game
  - Online Counter

- **WebSocket Events** (`/io/`):
  - Connection flow
  - Game Service events (bet, step, cashout, etc.)
  - Ping/Pong

- **Health Endpoints**
- Error responses and codes
- Rate limiting (future)
- CORS configuration

---

### 5. [MySQL Schema](./MYSQL_SCHEMA.md)
**Complete database schema documentation**

- Entity Relationship Diagram
- **Tables**:
  - User (composite PK)
  - Agents
  - Bet (with indexes)
  - GameConfig
  - WalletAudit
  - WalletRetryJob
  - WalletError
  - GameSession
  - Admin

- Column definitions with types
- Indexes and relationships
- Example queries
- Database configuration
- Connection pool settings
- Query patterns
- Data retention policies
- Migration strategy

---

### 6. [Redis Usage](./REDIS_USAGE.md)
**Complete Redis usage documentation**

- **Redis Keys**:
  - Game Sessions (`gameSession:${userId}-${agentId}`)
  - Distributed Locks (multiple patterns)
  - Game Configuration Cache (`game.payloads`)
  - Hazard States (`hazards-${difficulty}`)
  - Fairness Data (`fairness:${userId}:${agentId}`)
  - Cleanup Tracking

- Connection configuration
- TTL configuration
- Memory management
- Redis operations (read/write patterns)
- Pub/Sub implementation
- Error handling
- Performance considerations
- Monitoring commands
- Best practices
- Troubleshooting

---

### 7. [Application Flows](./APPLICATION_FLOWS.md)
**Step-by-step flow documentation with sequence diagrams**

- **User Registration Flow**
- **User Login Flow**
- **Bet Placement Flow** (with lock acquisition)
- **Game Step Flow** (with hazard checking)
- **Cashout Flow**
- **Settlement Flow** (with retry mechanism)
- **Retry Flow** (cron-based)
- **Hazard Generation Flow**

- Cache hit/miss scenarios
- Error handling paths
- Sequence diagrams for each flow

---

### 8. [Configuration & Infrastructure](./CONFIGURATION_INFRASTRUCTURE.md)
**Complete configuration and infrastructure documentation**

- **Environment Variables**:
  - Application, Database, Redis, JWT, Retry

- **Configuration Modules**:
  - AppConfig, DatabaseConfig, RedisConfig, JwtConfig

- **Database Configuration**:
  - TypeORM setup
  - Connection pooling (30 connections per pod)

- **Redis Configuration**:
  - Client setup
  - Memory configuration (400MB, allkeys-lru)

- **Logging Strategy**:
  - Winston logger
  - Log levels and files
  - Best practices

- **Application Startup**:
  - Bootstrap process
  - Startup logging

- **Cron Jobs & Schedulers**:
  - Wallet Retry Scheduler (every 1 minute)
  - Hazard Scheduler (every 5 seconds)
  - Bet Cleanup (daily at 2 AM)
  - Wallet Audit Cleanup (daily at 3 AM)

- Infrastructure components
- Health checks
- Security configuration
- Environment-specific configuration

---

### 9. [Code Quality Audit](./CODE_QUALITY_AUDIT.md)
**Comprehensive code quality, performance, and security audit**

- **Anti-Patterns**:
  - Hardcoded URLs
  - Magic numbers
  - Inconsistent error handling
  - Circular dependencies

- **Performance Issues**:
  - N+1 query problem
  - Missing database indexes
  - Redis key scanning
  - Synchronous operations
  - Large payloads in Redis

- **Security Vulnerabilities**:
  - CORS configuration
  - JWT secret defaults
  - SQL injection risks
  - IP whitelisting
  - Password storage
  - Error message leakage

- **Code Quality Issues**:
  - Missing type definitions
  - Inconsistent naming
  - Dead code
  - Missing JSDoc
  - Large functions

- **Missing Validations**:
  - Input validation gaps
  - Business rule validation
  - Currency validation
  - Round ID validation

- **Exception Handling**:
  - Unhandled promise rejections
  - Error swallowing
  - Missing error context

- **Memory Leaks**:
  - Redis connections
  - WebSocket connections
  - Event listeners

- **Database Issues**:
  - Missing transactions
  - Connection pool exhaustion
  - Query timeout
  - Missing query optimization

- **Redis Issues**:
  - TTL not set
  - Lock not released
  - Memory usage

- **Testing Gaps**:
  - Unit tests
  - Integration tests
  - E2E tests

- **Monitoring Gaps**:
  - Metrics
  - Alerts

---

### 10. [Improvement Plan](./IMPROVEMENT_PLAN.md)
**Prioritized improvement plan with effort estimates**

- **P1 - Critical Improvements**:
  1. Database indexes (Low effort)
  2. CORS configuration (Low effort)
  3. JWT secret validation (Low effort)
  4. Database transactions (Medium effort)
  5. Redis TTL enforcement (Low effort)
  6. Unit test coverage (High effort)

- **P2 - High Priority Improvements**:
  7. Remove hardcoded URLs (Low effort)
  8. Refactor large functions (Medium effort)
  9. Remove circular dependencies (Medium effort)
  10. Comprehensive input validation (Medium effort)
  11. Standardize error handling (Medium effort)
  12. Add application metrics (High effort)
  13. Memory leak prevention (Medium effort)
  14. Query optimization (Medium effort)

- **P3 - Medium Priority Improvements**:
  15. Extract magic numbers (Low effort)
  16. Remove dead code (Low effort)
  17. Add JSDoc comments (Medium effort)
  18. Standardize naming (Low effort)
  19. Add integration tests (High effort)
  20. Add E2E tests (High effort)

- Implementation roadmap (10-week plan)
- Quick wins
- Long-term improvements
- Success metrics

---

## Quick Reference

### Key Files

**Configuration**:
- `src/config/app.config.ts` - Application config
- `src/config/database.config.ts` - Database config
- `src/config/redis.config.ts` - Redis config
- `src/config/jwt.config.ts` - JWT config
- `src/config/defaults.config.ts` - Default values

**Main Entry**:
- `src/main.ts` - Application bootstrap
- `src/app.module.ts` - Root module

**Core Services**:
- `src/routes/gamePlay/game-play.service.ts` - Game logic
- `src/routes/single-wallet-functions/single-wallet-functions.service.ts` - Wallet API
- `src/modules/wallet-retry/wallet-retry-scheduler.service.ts` - Retry scheduler

**Entities**:
- `src/entities/bet.entity.ts` - Bet entity
- `src/entities/user.entity.ts` - User entity
- `src/entities/wallet-retry-job.entity.ts` - Retry job entity

---

## Architecture Summary

**Pattern**: Modular Monolith  
**Framework**: NestJS 11.x  
**Database**: MySQL 8.0+ (TypeORM)  
**Cache**: Redis (ioredis)  
**WebSocket**: Socket.IO  
**Auth**: JWT + Certificate-based  

**Key Features**:
- Real-time game via WebSocket
- Wallet API integration with retry mechanism
- Provably fair game mechanics
- Distributed locking for concurrency
- Comprehensive audit logging
- Scheduled cleanup jobs

---

## Getting Started

1. **New Developers**: Start with [Architecture Overview](./ARCHITECTURE_OVERVIEW.md)
2. **Understanding Code**: See [File-Level Analysis](./FILE_LEVEL_ANALYSIS.md)
3. **API Integration**: See [API Endpoints](./API_ENDPOINTS.md)
4. **Database Work**: See [MySQL Schema](./MYSQL_SCHEMA.md)
5. **Redis Operations**: See [Redis Usage](./REDIS_USAGE.md)
6. **Understanding Flows**: See [Application Flows](./APPLICATION_FLOWS.md)
7. **Configuration**: See [Configuration & Infrastructure](./CONFIGURATION_INFRASTRUCTURE.md)
8. **Code Quality**: See [Code Quality Audit](./CODE_QUALITY_AUDIT.md)
9. **Improvements**: See [Improvement Plan](./IMPROVEMENT_PLAN.md)

---

## Document Maintenance

- **Last Updated**: 2024-01-01
- **Version**: 1.0
- **Maintainer**: Development Team

**Update Process**:
1. Update relevant documentation when making changes
2. Keep sequence diagrams in sync with code
3. Update improvement plan as items are completed
4. Review and update quarterly

---

## Additional Resources

- **Existing Documentation**:
  - `docs/BEGINNER_GUIDE.md` - Getting started guide
  - `docs/GAME_FLOW_DOCUMENTATION.md` - Game flow details
  - `docs/HAPPY_FLOW.md` - Happy path scenarios
  - `docs/INTEGRATION_GUIDE.md` - Integration guide
  - `docs/WEBSOCKET_INTEGRATION.md` - WebSocket details

- **Configuration Files**:
  - `docker-compose.prod.yml` - Production Docker setup
  - `package.json` - Dependencies
  - `.env.example` - Environment variables template

---

## Questions or Updates

For questions or documentation updates, please:
1. Review existing documentation first
2. Check code comments and JSDoc
3. Contact the development team
4. Update documentation as needed

