# Complete Application Load Bearing Capacity Analysis

## System Architecture Overview

### Components:
1. **HTTP REST API** (NestJS/Express)
2. **WebSocket Gateway** (Socket.IO)
3. **Database** (MySQL via TypeORM)
4. **Redis** (Caching, Sessions, Locks)
5. **Retry System** (Background jobs)
6. **Scheduled Tasks** (Cron jobs)

---

## Resource Constraints Analysis

### 1. **Database (MySQL) - TypeORM**

#### Default Connection Pool:
- **TypeORM Default**: 10 connections per instance
- **No explicit pool config found** → Uses defaults
- **Connection reuse**: Yes (connection pooling)

#### Capacity Calculation:
```
Per Pod:
- Max DB connections: 10
- Avg query time: 50-200ms
- Throughput: 10 connections × (1000ms / 100ms) = 100 queries/second
- Per pod: ~100 queries/second

With 3 pods:
- Total connections: 30
- Total throughput: ~300 queries/second
```

#### Bottleneck:
- **Limited by connection pool size**
- **10 connections per pod is low for high traffic**
- **Recommendation**: Increase to 20-50 per pod

---

### 2. **Redis Connection**

#### Current Setup:
- **Single Redis client** (ioredis)
- **Connection pooling**: Built-in (ioredis handles this)
- **Max connections**: Default (unlimited, but Redis server has limits)

#### Capacity:
```
Redis Operations:
- SET/GET: < 1ms
- Lock operations: < 2ms
- Throughput: Very high (10,000+ ops/second)

Bottleneck: Redis server memory (80MB limit in docker-compose)
- Max keys: ~100,000 (assuming 800 bytes/key)
- Current usage: Sessions, locks, game state
```

#### Limiting Factor:
- **Redis memory**: 80MB limit
- **Session TTL**: 1 hour (3600s)
- **Max concurrent sessions**: ~50,000 (if 1KB per session)

---

### 3. **WebSocket (Socket.IO)**

#### Current Configuration:
- **No explicit connection limit found**
- **Default Socket.IO**: ~65,000 connections per server
- **Memory per connection**: ~2-5KB

#### Capacity Calculation:
```
Per Pod:
- Max WebSocket connections: ~10,000 (conservative, limited by memory)
- Memory per connection: ~3KB
- Total memory: 10,000 × 3KB = 30MB (just for connections)
- Game state per user: ~5-10KB
- Total per user: ~8-13KB

With 1GB pod memory:
- Available for WebSocket: ~500MB (after app overhead)
- Max connections: 500MB / 13KB = ~38,000 connections
- Practical limit: ~10,000 per pod (safety margin)

With 3 pods:
- Total WebSocket capacity: ~30,000 concurrent connections
```

#### Bottleneck:
- **Memory per connection**
- **Game state storage in Redis**
- **Event processing speed**

---

### 4. **HTTP REST API**

#### Current Setup:
- **NestJS/Express** (Node.js event loop)
- **No explicit request limit**
- **Default Node.js**: ~10,000 concurrent requests

#### Capacity Calculation:
```
Per Pod:
- Max concurrent HTTP requests: ~1,000 (conservative)
- Avg request time: 100-500ms
- Throughput: 1,000 requests / 0.3s = ~3,333 requests/second

With 3 pods:
- Total HTTP capacity: ~10,000 requests/second
```

#### Bottleneck:
- **Database connection pool** (10 connections)
- **External API calls** (agent wallet APIs)
- **CPU for request processing**

---

### 5. **Retry System** (Background)

#### Current Capacity:
- **~900 retries/hour** (21,600/day)
- **Runs in main app process**
- **Uses same DB/Redis resources**

#### Impact on Main App:
- **Minimal** (runs every 1 minute, short duration)
- **Uses distributed lock** (only 1 pod processes)
- **Resource usage**: Low (sequential processing)

---

## Complete Capacity Analysis

### **Scenario 1: Typical Gaming Session**

**User Behavior:**
- 1 WebSocket connection per user
- 1 HTTP login request per session
- 5-10 game actions per minute (bet, step, cashout)
- Average session: 10 minutes

**Resource Usage per User:**
- WebSocket: 1 connection (3KB memory)
- Redis session: 1 key (1KB, 1 hour TTL)
- Database: ~2 queries per action
- HTTP: 1 request per session

**Capacity Calculation:**
```
WebSocket Limit: 30,000 concurrent users (3 pods)
Database Limit: 300 queries/second = 18,000 queries/minute
  → 18,000 / 2 queries per action = 9,000 actions/minute
  → 9,000 / 5 actions per user = 1,800 active users/minute
  → But WebSocket limit is higher, so: 30,000 concurrent users

Redis Limit: 50,000 sessions (80MB memory)
  → 50,000 concurrent users

Bottleneck: Database connection pool (10 per pod)
  → 30 connections total
  → 30 × 10 queries/second = 300 queries/second
  → 300 / 2 = 150 active users/second
  → 150 × 60 = 9,000 active users/minute
```

**Result:**
- **Concurrent WebSocket users**: ~30,000 (WebSocket limit)
- **Active gaming users**: ~9,000 (Database limit)
- **Total capacity**: ~9,000-30,000 concurrent users (depending on activity)

---

### **Scenario 2: Peak Load (All Users Active)**

**Assumptions:**
- All users actively playing
- 10 actions per minute per user
- High database query rate

**Capacity:**
```
Database: 300 queries/second
  → 300 / 2 queries per action = 150 actions/second
  → 150 × 60 = 9,000 actions/minute
  → 9,000 / 10 actions per user = 900 active users

WebSocket: 30,000 connections (but limited by DB)
Redis: 50,000 sessions (not limiting)

Bottleneck: Database (most restrictive)
Result: ~900-1,000 highly active concurrent users
```

---

### **Scenario 3: Mixed Load (Realistic)**

**User Distribution:**
- 20% highly active (10 actions/min)
- 50% moderately active (5 actions/min)
- 30% idle/spectating (1 action/min)

**Weighted Average:**
- 0.2 × 10 + 0.5 × 5 + 0.3 × 1 = 4.8 actions/user/minute

**Capacity:**
```
Database: 18,000 queries/minute
  → 18,000 / 2 = 9,000 actions/minute
  → 9,000 / 4.8 = 1,875 concurrent users

WebSocket: 30,000 (not limiting)
Redis: 50,000 (not limiting)

Result: ~1,500-2,000 concurrent users (realistic)
```

---

## Capacity by Component

| Component | Per Pod | 3 Pods | Bottleneck |
|-----------|---------|--------|------------|
| **WebSocket** | 10,000 | 30,000 | Memory |
| **HTTP API** | 3,333 req/s | 10,000 req/s | DB Pool |
| **Database** | 100 q/s | 300 q/s | **Connection Pool (10/pod)** |
| **Redis** | 10,000 ops/s | 10,000 ops/s | Memory (80MB) |
| **Retry System** | 900/hour | 900/hour | Sequential processing |

---

## Critical Bottlenecks (Priority Order)

### **1. Database Connection Pool** ⚠️ CRITICAL
- **Current**: 10 connections per pod
- **Impact**: Limits all database operations
- **Recommendation**: Increase to 20-50 per pod
- **Expected improvement**: 2-5x capacity increase

### **2. Sequential Retry Processing** ⚠️ HIGH
- **Current**: 1 job at a time
- **Impact**: Limits retry throughput to ~900/hour
- **Recommendation**: Parallel processing (10 concurrent)
- **Expected improvement**: 10x capacity increase

### **3. Redis Memory Limit** ⚠️ MEDIUM
- **Current**: 80MB
- **Impact**: Limits concurrent sessions
- **Recommendation**: Increase to 256MB-512MB
- **Expected improvement**: 3-6x session capacity

### **4. WebSocket Memory** ⚠️ LOW
- **Current**: ~10,000 per pod (conservative)
- **Impact**: Limits concurrent connections
- **Recommendation**: Optimize game state storage
- **Expected improvement**: 2-3x connection capacity

---

## Real-World Capacity Estimates

### **Current System (No Optimizations)**

| Load Scenario | Concurrent Users | Status |
|---------------|------------------|--------|
| **Idle/Spectating** | 30,000 | ✅ OK |
| **Mixed Activity** | 1,500-2,000 | ⚠️ Strained |
| **All Active** | 900-1,000 | ❌ Insufficient |
| **Peak Gaming** | 500-800 | ❌ Critical |

### **With Quick Optimizations**

1. **Increase DB pool**: 10 → 30 per pod
2. **Parallel retries**: 1 → 10 concurrent
3. **Increase Redis**: 80MB → 256MB

| Load Scenario | Concurrent Users | Status |
|---------------|------------------|--------|
| **Idle/Spectating** | 30,000 | ✅ OK |
| **Mixed Activity** | 4,000-5,000 | ✅ Good |
| **All Active** | 2,500-3,000 | ⚠️ Adequate |
| **Peak Gaming** | 1,500-2,000 | ⚠️ Strained |

---

## Failure Scenarios

### **What Happens at Capacity?**

#### **Scenario A: Database Pool Exhausted**
- New requests wait for available connection
- Response times increase (500ms → 2-5 seconds)
- Some requests timeout
- Users experience lag

#### **Scenario B: Redis Memory Full**
- New sessions rejected
- LRU eviction (oldest sessions removed)
- Users get logged out unexpectedly
- Game state lost

#### **Scenario C: WebSocket Memory Full**
- New connections rejected
- Existing connections may drop
- Users can't join game
- Connection errors

#### **Scenario D: Retry System Overloaded**
- Retries queue up (backlog grows)
- Delays compound (minutes → hours)
- Jobs expire before processing
- Financial reconciliation issues

---

## Recommendations by Scale

### **Small Scale** (< 500 concurrent users)
- ✅ **Current system adequate**
- Monitor database connections
- No changes needed

### **Medium Scale** (500-2,000 concurrent users)
- ⚠️ **Optimize current system**:
  - Increase DB pool: 10 → 30 per pod
  - Increase Redis: 80MB → 256MB
  - Monitor retry backlog

### **Large Scale** (2,000-10,000 concurrent users)
- ❌ **Requires architectural changes**:
  - Separate retry worker service
  - Database read replicas
  - Redis cluster
  - Connection pooling optimization
  - Load balancing optimization

### **Very Large Scale** (> 10,000 concurrent users)
- ❌ **Major redesign needed**:
  - Microservices architecture
  - Database sharding
  - Redis cluster with persistence
  - CDN for static assets
  - Advanced caching strategies

---

## Quick Capacity Test

### **Monitor Current Load:**
```sql
-- Database connections
SHOW PROCESSLIST;
SELECT COUNT(*) FROM information_schema.processlist WHERE user = 'your_user';

-- Active sessions
SELECT COUNT(*) FROM information_schema.processlist WHERE command != 'Sleep';

-- Retry backlog
SELECT COUNT(*) FROM wallet_retry_job WHERE status = 'PENDING';
```

### **Redis Monitoring:**
```bash
redis-cli INFO memory
redis-cli DBSIZE  # Total keys
redis-cli KEYS "session:*" | wc -l  # Active sessions
```

### **Application Metrics:**
- WebSocket connections: Monitor Socket.IO server
- HTTP request rate: Monitor API endpoints
- Response times: Monitor p95/p99 latencies
- Error rates: Monitor 5xx errors

---

## Summary

### **Current Capacity (Conservative Estimates)**

| Metric | Capacity | Limiting Factor |
|--------|----------|-----------------|
| **Concurrent WebSocket Users** | 30,000 | Memory (not limiting) |
| **Active Gaming Users** | 1,500-2,000 | **Database Pool (10/pod)** |
| **HTTP Requests/Second** | 10,000 | Database Pool |
| **Retry Jobs/Hour** | 900 | Sequential Processing |
| **Sessions** | 50,000 | Redis Memory (80MB) |

### **Realistic Concurrent User Capacity**

**Mixed Activity (Realistic):**
- **~1,500-2,000 concurrent users** (with mixed activity levels)
- **~500-800 highly active users** (all playing simultaneously)

**Bottleneck:**
- **Database connection pool** (most restrictive)
- **Retry system** (for settlement failures)

### **Quick Wins** (Can implement now)

1. **Increase DB pool**: 10 → 30 per pod → **2-3x capacity**
2. **Parallel retries**: 1 → 10 concurrent → **10x retry capacity**
3. **Increase Redis**: 80MB → 256MB → **3x session capacity**

**Combined improvement**: **2,000 → 4,000-5,000 concurrent users**

---

## Next Steps

1. **Monitor current load** (use queries above)
2. **Identify actual bottleneck** (DB, Redis, or WebSocket)
3. **Implement quick wins** (DB pool, parallel retries)
4. **Scale horizontally** (add more pods)
5. **Optimize further** (read replicas, Redis cluster)

