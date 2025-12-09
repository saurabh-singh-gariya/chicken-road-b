# Testing Retry System Locally

## Enable Test Mode

The retry schedule has been configured with a TEST_MODE that uses faster intervals for local testing.

### Option 1: Environment Variable (Recommended)
Add to your `.env` or `.env.local`:
```env
RETRY_TEST_MODE=true
```

### Option 2: Automatic in Development
Test mode is automatically enabled when `NODE_ENV=development`

## Test Retry Schedule

When TEST_MODE is enabled:
- **Attempt 1**: 1 minute after initial failure
- **Attempt 2**: 2 minutes after initial failure  
- **Attempt 3+**: Every 3 minutes until 5 minutes total from initial failure
- **After 5 minutes**: Expired (no more retries)

## How to Trigger a Retry

### Method 1: Make settleBet/refundBet Fail

1. **Temporarily break the agent callback URL** in your database:
   ```sql
   UPDATE agents 
   SET callbackURL = 'http://invalid-url-that-will-fail.com' 
   WHERE agentId = 'your-test-agent-id';
   ```

2. **Trigger a settle or refund bet** through your game flow

3. **The API will fail** and create a retry job automatically

### Method 2: Simulate Network Error

1. **Stop your agent server** (if running locally)
2. **Trigger settle/refund bet**
3. **Network error will occur** and create retry job

### Method 3: Make Agent Reject

1. **Modify agent to return status !== '0000'** (if you control the agent)
2. **Trigger settle/refund bet**
3. **Agent rejection will create retry job**

## Database Monitoring Queries

### 1. Check Retry Jobs Created

```sql
-- View all retry jobs
SELECT 
  id,
  platformTxId,
  apiAction,
  status,
  retryAttempt,
  maxRetries,
  nextRetryAt,
  initialFailureAt,
  lastRetryAt,
  createdAt,
  updatedAt,
  errorMessage
FROM wallet_retry_job
ORDER BY createdAt DESC
LIMIT 20;
```

### 2. Monitor Retry Job Status Changes

```sql
-- Watch retry jobs that are pending or processing
SELECT 
  id,
  platformTxId,
  apiAction,
  status,
  retryAttempt,
  nextRetryAt,
  TIMESTAMPDIFF(SECOND, NOW(), nextRetryAt) as seconds_until_retry,
  errorMessage
FROM wallet_retry_job
WHERE status IN ('PENDING', 'PROCESSING')
ORDER BY nextRetryAt ASC;
```

### 3. Check Retry Execution History

```sql
-- See retry attempts and their timing
SELECT 
  platformTxId,
  apiAction,
  status,
  retryAttempt,
  initialFailureAt,
  lastRetryAt,
  nextRetryAt,
  TIMESTAMPDIFF(MINUTE, initialFailureAt, lastRetryAt) as minutes_since_failure,
  TIMESTAMPDIFF(SECOND, NOW(), nextRetryAt) as seconds_until_next,
  errorMessage
FROM wallet_retry_job
WHERE platformTxId = 'YOUR_TEST_TX_ID'
ORDER BY retryAttempt;
```

### 4. Monitor Audit Logs

```sql
-- View all audit logs for a transaction
SELECT 
  id,
  requestId,
  apiAction,
  status,
  responseTime,
  httpStatus,
  failureType,
  errorMessage,
  createdAt
FROM wallet_audit
WHERE platformTxId = 'YOUR_TEST_TX_ID'
ORDER BY createdAt DESC;
```

### 5. Check Retry Success/Failure

```sql
-- See which retries succeeded
SELECT 
  platformTxId,
  apiAction,
  status,
  retryAttempt,
  completedAt,
  CASE 
    WHEN status = 'SUCCESS' THEN '✅ Succeeded'
    WHEN status = 'EXPIRED' THEN '❌ Expired'
    WHEN status = 'FAILED' THEN '❌ Failed'
    WHEN status = 'PENDING' THEN '⏳ Pending'
    WHEN status = 'PROCESSING' THEN '🔄 Processing'
  END as status_display
FROM wallet_retry_job
ORDER BY createdAt DESC;
```

### 6. Real-time Monitoring Query (Run every few seconds)

```sql
-- Watch retries in real-time
SELECT 
  id,
  platformTxId,
  apiAction,
  status,
  retryAttempt,
  DATE_FORMAT(nextRetryAt, '%H:%i:%s') as next_retry_time,
  TIMESTAMPDIFF(SECOND, NOW(), nextRetryAt) as seconds_until_retry,
  DATE_FORMAT(initialFailureAt, '%H:%i:%s') as failed_at,
  TIMESTAMPDIFF(MINUTE, initialFailureAt, NOW()) as minutes_since_failure
FROM wallet_retry_job
WHERE status = 'PENDING'
  AND nextRetryAt <= DATE_ADD(NOW(), INTERVAL 1 MINUTE)
ORDER BY nextRetryAt ASC;
```

## Key Database Fields to Watch

### `wallet_retry_job` Table:

| Field | What to Watch |
|-------|---------------|
| `status` | Changes: PENDING → PROCESSING → SUCCESS/FAILED/EXPIRED |
| `retryAttempt` | Increments with each retry (0, 1, 2, ...) |
| `nextRetryAt` | When next retry will execute (watch this countdown) |
| `lastRetryAt` | Timestamp of last retry attempt |
| `initialFailureAt` | When the first failure occurred |
| `errorMessage` | Latest error message |
| `updatedAt` | Last time the record was modified |

### `wallet_audit` Table:

| Field | What to Watch |
|-------|---------------|
| `status` | SUCCESS or FAILURE |
| `responseTime` | API response time in milliseconds |
| `retryJobId` | Links to retry job (if created) |
| `isRetry` | true if this is a retry attempt |
| `retryAttempt` | Which retry attempt number |

### `bet` Table:

| Field | What to Watch |
|-------|---------------|
| `status` | Should change to WON/LOST when retry succeeds |
| `retryJobId` | Links to retry job (if exists) |

## Testing Checklist

1. ✅ **Enable TEST_MODE** (set `RETRY_TEST_MODE=true`)
2. ✅ **Trigger a settle/refund failure** (break agent URL or stop agent server)
3. ✅ **Check `wallet_retry_job` table** - Should see new record with status='PENDING'
4. ✅ **Check `wallet_audit` table** - Should see FAILURE record with retryJobId
5. ✅ **Wait 1 minute** - Check if retry executes (status changes to PROCESSING then back)
6. ✅ **Check `retryAttempt`** - Should increment to 1
7. ✅ **Check `nextRetryAt`** - Should be 2 minutes from initial failure
8. ✅ **Wait 2 minutes total** - Check if second retry executes
9. ✅ **Check `retryAttempt`** - Should increment to 2
10. ✅ **Check `nextRetryAt`** - Should be 5 minutes from initial failure (or null if expired)
11. ✅ **Wait 5 minutes total** - Check if retry expires (status='EXPIRED')

## Quick Test SQL Commands

```sql
-- 1. Find recent retry jobs
SELECT * FROM wallet_retry_job ORDER BY createdAt DESC LIMIT 5;

-- 2. Count retries by status
SELECT status, COUNT(*) as count 
FROM wallet_retry_job 
GROUP BY status;

-- 3. See retry timeline for a specific transaction
SELECT 
  retryAttempt,
  status,
  DATE_FORMAT(initialFailureAt, '%H:%i:%s') as failed_at,
  DATE_FORMAT(lastRetryAt, '%H:%i:%s') as last_retry,
  DATE_FORMAT(nextRetryAt, '%H:%i:%s') as next_retry,
  TIMESTAMPDIFF(MINUTE, initialFailureAt, COALESCE(lastRetryAt, NOW())) as minutes_elapsed
FROM wallet_retry_job
WHERE platformTxId = 'YOUR_TX_ID'
ORDER BY retryAttempt;
```

## Restore Production Schedule

When done testing, remove `RETRY_TEST_MODE=true` from your `.env` file to restore the production schedule (5min → 15min → 30min → every 2h for 72h).

