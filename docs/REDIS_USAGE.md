# Redis Usage Documentation

## Overview

Redis is used for:
1. **Session Storage** - Game session state
2. **Distributed Locking** - Concurrency control
3. **Caching** - Game configuration, hazard states
4. **Pub/Sub** - Cache invalidation, coordination

## Connection Configuration

**Client**: ioredis

**Configuration**:
- Host: `REDIS_HOST` (default: localhost)
- Port: `REDIS_PORT` (default: 6379)
- Password: `REDIS_PASSWORD` (optional)

**Connection Pooling**: Single connection per application instance

**Retry Strategy**: Exponential backoff (max 2 seconds)

---

## Redis Keys

### 1. Game Sessions

**Pattern**: `gameSession:${userId}-${agentId}`

**Purpose**: Store active game session state

**TTL**: Configurable via `game.session.ttl` (default: 3600 seconds = 1 hour)

**Structure**:
```json
{
  "userId": "user123",
  "agentId": "agent456",
  "currency": "INR",
  "difficulty": "EASY",
  "serverSeed": "hex-string",
  "userSeed": "user-provided-seed",
  "hashedServerSeed": "sha256-hash",
  "nonce": 0,
  "coefficients": ["1.01", "1.03", ...],
  "currentStep": 0,
  "winAmount": 10.10,
  "betAmount": 10.00,
  "isActive": true,
  "isWin": false,
  "createdAt": "2024-01-01T00:00:00Z",
  "platformBetTxId": "tx-uuid",
  "roundId": "round-id",
  "collisionColumns": [5, 10, 15]
}
```

**Operations**:
- `SET` - Create/update session
- `GET` - Retrieve session
- `DEL` - Delete session (on game end)

**Example**:
```typescript
// Set session
await redisService.set(
  `gameSession:${userId}-${agentId}`,
  sessionData,
  sessionTTL
);

// Get session
const session = await redisService.get(`gameSession:${userId}-${agentId}`);

// Delete session
await redisService.del(`gameSession:${userId}-${agentId}`);
```

---

### 2. Distributed Locks

**Pattern**: `bet-lock:${userId}-${agentId}`

**Purpose**: Prevent concurrent bet placement

**TTL**: 30 seconds

**Pattern**: `wallet-retry-scheduler-lock`

**Purpose**: Prevent multiple pods from processing retries

**TTL**: 60 seconds

**Pattern**: `retry-job-lock:${platformTxId}:${apiAction}`

**Purpose**: Prevent duplicate retry processing

**TTL**: 300 seconds (5 minutes)

**Pattern**: `bet-cleanup-lock`

**Purpose**: Prevent duplicate cleanup execution

**TTL**: 300 seconds

**Pattern**: `wallet-audit-cleanup-lock`

**Purpose**: Prevent duplicate audit cleanup

**TTL**: 300 seconds

**Operations**:
- `SET key "1" EX ttl NX` - Acquire lock
- `DEL key` - Release lock

**Example**:
```typescript
// Acquire lock
const acquired = await redisService.acquireLock('bet-lock:user123-agent456', 30);
if (acquired) {
  try {
    // Critical section
  } finally {
    await redisService.releaseLock('bet-lock:user123-agent456');
  }
}
```

---

### 3. Game Configuration Cache

**Key**: `game.payloads`

**Purpose**: Cache game payloads configuration

**TTL**: Default Redis TTL (configurable via `redis.TTL`)

**Structure**:
```json
{
  "platform": "In-out",
  "gameType": "CRASH",
  "gameCode": "chicken-road-two",
  "gameName": "chicken-road-2",
  "settleType": "platformTxId"
}
```

**Operations**:
- `SET` - Cache configuration
- `GET` - Retrieve cached configuration

**Cache Strategy**: 
- Read from cache first
- If miss, read from database
- Update cache on database read

---

### 4. Hazard States

**Pattern**: `hazards-${difficulty}`

**Purpose**: Store current hazard positions for each difficulty

**TTL**: 7.5 seconds (1.5x refresh interval)

**Structure**:
```json
{
  "difficulty": "EASY",
  "hazards": [3, 7, 12],
  "lastRefresh": "2024-01-01T00:00:00Z",
  "nextRefresh": "2024-01-01T00:00:05Z"
}
```

**Refresh**: Every 5 seconds (cron job)

**Operations**:
- `SET` - Update hazard state
- `GET` - Get current hazards

**Example**:
```typescript
// Get active hazards
const hazards = await redisService.get(`hazards-EASY`);
// Returns: [3, 7, 12] (column indices)
```

---

### 5. Fairness Data

**Pattern**: `fairness:${userId}:${agentId}`

**Purpose**: Store provably fair seeds

**TTL**: 7 days (604800 seconds)

**Structure**:
```json
{
  "userId": "user123",
  "agentId": "agent456",
  "userSeed": "user-provided-seed",
  "serverSeed": "server-generated-seed",
  "hashedServerSeed": "sha256-hash",
  "nonce": 0
}
```

**Operations**:
- `SET` - Store/update fairness data
- `GET` - Retrieve fairness data

**Rotation**: Seeds rotated after each settlement

---

### 6. Cleanup Last Run Tracking

**Pattern**: `bet-cleanup-last-run`

**Purpose**: Track last cleanup execution date

**TTL**: 3 days

**Value**: Date string (YYYY-MM-DD)

**Pattern**: `wallet-audit-cleanup-last-run`

**Purpose**: Track last audit cleanup execution

**TTL**: 3 days

---

### 7. User Sessions (Set-based)

**Pattern**: `user-sessions:${agentId}` or similar

**Purpose**: Track active user sessions

**Note**: Implementation may vary based on `UserSessionService`

**Operations**: Set operations (SADD, SREM, SCARD)

---

## Redis Pub/Sub

### Channels

Currently used for:
- Cache invalidation (potential)
- Coordination between pods (potential)

### Implementation

**Service**: `PubSubService`

**Features**:
- Automatic reconnection
- Multiple callbacks per channel
- Graceful cleanup on shutdown

**Example**:
```typescript
// Subscribe
await pubSubService.subscribe('cache-invalidate', (message) => {
  // Handle cache invalidation
});

// Publish
await pubSubService.publish('cache-invalidate', { key: 'game.payloads' });
```

---

## TTL Configuration

### Default TTL

**Key**: `redis.TTL` (in `game_config` table)

**Default**: 3600 seconds (1 hour)

**Usage**: Default TTL for cached data

### Session TTL

**Key**: `game.session.ttl` (in `game_config` table)

**Default**: 3600 seconds (1 hour)

**Usage**: Game session expiration

### Dynamic TTL

Some keys have fixed TTLs:
- **Locks**: 30-300 seconds (depending on operation)
- **Hazards**: 7.5 seconds (1.5x refresh interval)
- **Fairness**: 7 days
- **Cleanup tracking**: 3 days

---

## Memory Management

### Configuration

**Max Memory**: 400MB (production)

**Eviction Policy**: `allkeys-lru` (Least Recently Used)

**Persistence**: AOF (Append Only File) enabled

### Memory Usage Estimation

| Key Type | Size | Count | Total |
|----------|------|-------|-------|
| Game Session | ~2KB | 1000 | ~2MB |
| Locks | ~50 bytes | 100 | ~5KB |
| Hazards | ~500 bytes | 4 | ~2KB |
| Fairness | ~500 bytes | 1000 | ~500KB |
| Config Cache | ~1KB | 10 | ~10KB |
| **Total** | | | **~2.5MB** |

**Note**: Actual usage depends on active users and session duration.

---

## Redis Operations

### Read Patterns

1. **Cache-Aside**:
   ```
   1. Check Redis
   2. If miss, read from database
   3. Update Redis
   4. Return data
   ```

2. **Session Retrieval**:
   ```
   1. Get session from Redis
   2. Validate session exists
   3. Return session or error
   ```

### Write Patterns

1. **Write-Through** (Sessions):
   ```
   1. Update session in Redis
   2. Set TTL
   3. Return success
   ```

2. **Write-Behind** (Audit):
   ```
   1. Log to database (async)
   2. Don't block on Redis
   ```

---

## Error Handling

### Connection Errors

**Retry Strategy**: Exponential backoff
- Attempt 1: 50ms
- Attempt 2: 100ms
- Attempt 3: 150ms
- Max: 2000ms

**Fallback**: 
- If Redis unavailable, operations may fail
- Critical operations should handle Redis failures gracefully

### Lock Acquisition Failures

**Behavior**: Return `false` if lock not acquired

**Usage**: Check return value before proceeding

```typescript
const lockAcquired = await redisService.acquireLock(key, ttl);
if (!lockAcquired) {
  // Another process has the lock
  return;
}
```

---

## Performance Considerations

### Connection Pooling

**Current**: Single connection per instance

**Recommendation**: Consider connection pooling for high concurrency

### Pipeline Operations

**Current**: Individual commands

**Optimization**: Use Redis pipelines for batch operations

### Key Naming

**Pattern**: `prefix:identifier`

**Benefits**:
- Easy to query with `KEYS` or `SCAN`
- Namespace separation
- Clear purpose

---

## Monitoring

### Key Metrics

1. **Memory Usage**: `INFO memory`
2. **Key Count**: `DBSIZE`
3. **Hit Rate**: Custom metrics (cache hits/misses)
4. **Connection Count**: `INFO clients`
5. **Command Statistics**: `INFO stats`

### Commands

```bash
# Check memory
redis-cli INFO memory

# Count keys
redis-cli DBSIZE

# List all game sessions
redis-cli KEYS "gameSession:*"

# Get session TTL
redis-cli TTL "gameSession:user123-agent456"

# Monitor commands
redis-cli MONITOR
```

---

## Best Practices

1. **Always Set TTL**: Prevent memory leaks
2. **Use Locks Properly**: Always release in finally block
3. **Handle Failures**: Don't assume Redis is always available
4. **Monitor Memory**: Set alerts for high memory usage
5. **Key Naming**: Use consistent patterns
6. **Avoid KEYS**: Use SCAN for production
7. **Pipeline Operations**: Batch related operations

---

## Troubleshooting

### High Memory Usage

**Symptoms**: Redis memory approaching limit

**Solutions**:
- Check for keys without TTL
- Review eviction policy
- Increase max memory if needed
- Archive old data

### Lock Not Released

**Symptoms**: Operations stuck waiting for locks

**Solutions**:
- Check for crashes during lock acquisition
- Use shorter TTLs for locks
- Implement lock timeout handling

### Session Not Found

**Symptoms**: Users lose game sessions

**Solutions**:
- Check TTL configuration
- Verify session is being saved
- Check Redis connectivity
- Review session cleanup logic

---

## Migration Strategy

### Adding New Keys

1. Document key pattern
2. Set appropriate TTL
3. Add to monitoring
4. Update this documentation

### Changing TTL

1. Update configuration
2. Update existing keys (if needed)
3. Monitor impact
4. Update documentation

