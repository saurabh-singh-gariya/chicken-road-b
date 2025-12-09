# Retry System Load Bearing Capacity Analysis

## Current System Constraints

### 1. **Scheduler Frequency**
- **Cron**: Runs every 1 minute (`* * * * *`)
- **Lock TTL**: 60 seconds (scheduler lock)
- **Max processing window**: ~55 seconds (leaving 5s buffer for lock release)

### 2. **Batch Processing Limit**
- **Query limit**: `take: 100` jobs per scheduler run
- **Hard limit**: Maximum 100 retries processed per minute

### 3. **Processing Method**
- **Sequential**: Processes one job at a time (`for` loop)
- **No parallelization**: Each job must complete before next starts

### 4. **Job Execution Time**
- **HTTP request**: 1-5 seconds (typical agent API response)
- **Database operations**: 0.1-0.5 seconds per job
- **Total per job**: ~2-6 seconds average

### 5. **Distributed Locking**
- **Scheduler lock**: Only 1 pod processes retries at a time
- **Job lock**: 5 minutes TTL per job
- **Concurrency**: Effectively 1 job at a time across all pods

---

## Capacity Calculations

### **Best Case Scenario** (Fast API responses)
```
Processing time per job: 2 seconds
Jobs per minute: 100 (batch limit)
Throughput: 100 jobs/minute = 1.67 jobs/second
Daily capacity: 100 × 60 × 24 = 144,000 jobs/day
```

### **Average Case Scenario** (Typical API responses)
```
Processing time per job: 4 seconds
Jobs per minute: 100 (batch limit)
But: 60 seconds / 4 seconds = 15 jobs can complete in 1 minute
Actual throughput: 15 jobs/minute (limited by time, not batch size)
Daily capacity: 15 × 60 × 24 = 21,600 jobs/day
```

### **Worst Case Scenario** (Slow/timeout API responses)
```
Processing time per job: 30 seconds (timeout)
Jobs per minute: 60 seconds / 30 seconds = 2 jobs/minute
Daily capacity: 2 × 60 × 24 = 2,880 jobs/day
```

---

## Current Bottlenecks

### **Bottleneck #1: Sequential Processing** ⚠️ CRITICAL
- **Impact**: Processing one job at a time
- **Example**: With 100 due retries and 4s per job = 400 seconds (6.7 minutes)
- **Problem**: Scheduler runs every 1 minute, but processing takes 6+ minutes
- **Result**: Jobs accumulate, delays increase

### **Bottleneck #2: Batch Size Limit** ⚠️ HIGH
- **Impact**: Only 100 jobs queried per run
- **Problem**: If 200 jobs are due, only 100 are processed
- **Result**: Remaining 100 wait for next minute (delayed by 1+ minutes)

### **Bottleneck #3: Single Pod Processing** ⚠️ MEDIUM
- **Impact**: Distributed lock prevents parallel processing
- **Problem**: Even with 10 pods, only 1 processes retries
- **Result**: No horizontal scaling benefit

### **Bottleneck #4: Scheduler Frequency** ⚠️ MEDIUM
- **Impact**: Only checks every 1 minute
- **Problem**: Jobs ready at 10:00:01 wait until 10:01:00
- **Result**: Up to 59 seconds delay

---

## Real-World Capacity Estimates

### **Scenario 1: Low Load** (< 100 failures/hour)
- **Capacity**: ✅ **Adequate**
- **Processing**: All retries handled within 1 minute
- **Delay**: Minimal (< 2 minutes)

### **Scenario 2: Medium Load** (100-1,000 failures/hour)
- **Capacity**: ⚠️ **Strained**
- **Processing**: Jobs accumulate, delays of 5-10 minutes
- **Delay**: Moderate (5-15 minutes)

### **Scenario 3: High Load** (1,000-10,000 failures/hour)
- **Capacity**: ❌ **Insufficient**
- **Processing**: Severe backlog, delays of 30+ minutes
- **Delay**: High (30-60 minutes)

### **Scenario 4: Peak Load** (> 10,000 failures/hour)
- **Capacity**: ❌ **Critical Failure**
- **Processing**: System cannot keep up
- **Delay**: Hours or days
- **Risk**: Jobs expire before processing

---

## Capacity by Failure Rate

| Failures/Hour | Failures/Day | Current Capacity | Status | Max Delay |
|---------------|--------------|------------------|--------|-----------|
| 10 | 240 | 21,600/day | ✅ OK | 2 min |
| 100 | 2,400 | 21,600/day | ✅ OK | 5 min |
| 500 | 12,000 | 21,600/day | ⚠️ Strained | 15 min |
| 1,000 | 24,000 | 21,600/day | ❌ Insufficient | 30 min |
| 5,000 | 120,000 | 21,600/day | ❌ Critical | 2+ hours |
| 10,000 | 240,000 | 21,600/day | ❌ Failed | Days |

**Note**: Capacity assumes 4-second average job time. Actual capacity varies with API response times.

---

## Performance Metrics

### **Current Throughput**
- **Theoretical max**: 100 jobs/minute (batch limit)
- **Practical max**: ~15 jobs/minute (time-constrained)
- **Sustained capacity**: ~21,600 jobs/day

### **Latency**
- **Minimum delay**: 1 minute (scheduler frequency)
- **Average delay**: 2-5 minutes (low load)
- **Maximum delay**: 30+ minutes (high load)

### **Scalability**
- **Vertical scaling**: ❌ Limited (sequential processing)
- **Horizontal scaling**: ❌ None (single pod lock)
- **Current pods**: Irrelevant (only 1 processes)

---

## Failure Scenarios

### **What Happens When Capacity Exceeded?**

1. **Jobs Accumulate**
   - Due retries queue up in database
   - `nextRetryAt` passes, but jobs not processed
   - Backlog grows exponentially

2. **Delays Compound**
   - Retry #1 delayed by 10 minutes
   - Retry #2 scheduled 10 minutes late
   - Each retry gets progressively later

3. **Expiration Risk**
   - Jobs may expire (72 hours) before processing
   - Critical transactions never complete
   - Financial reconciliation issues

4. **Database Load**
   - Large number of PENDING jobs
   - Query performance degrades
   - Indexes become less effective

---

## Recommendations by Load

### **Low Load** (< 500 failures/hour)
- ✅ **Current system adequate**
- Monitor for delays
- No changes needed

### **Medium Load** (500-2,000 failures/hour)
- ⚠️ **Optimize current system**:
  - Increase batch size to 500
  - Process in parallel (5-10 concurrent)
  - Reduce scheduler interval to 30 seconds

### **High Load** (2,000-10,000 failures/hour)
- ❌ **Requires architectural changes**:
  - Separate retry worker service
  - Parallel processing (20-50 concurrent)
  - Job queue system (Bull/BullMQ)
  - Increase batch size to 1000+

### **Very High Load** (> 10,000 failures/hour)
- ❌ **Major redesign needed**:
  - Distributed job queue (BullMQ cluster)
  - Multiple worker services
  - Priority queues
  - Rate limiting per agent

---

## Quick Capacity Test

### **Test Query**
```sql
-- Check current retry job backlog
SELECT 
  status,
  COUNT(*) as count,
  MIN(nextRetryAt) as oldest_due,
  MAX(nextRetryAt) as newest_due,
  TIMESTAMPDIFF(MINUTE, MIN(nextRetryAt), NOW()) as oldest_minutes_overdue
FROM wallet_retry_job
WHERE status IN ('PENDING', 'PROCESSING')
GROUP BY status;
```

### **Health Indicators**
- ✅ **Healthy**: < 50 pending jobs, < 5 minutes overdue
- ⚠️ **Warning**: 50-200 pending jobs, 5-15 minutes overdue
- ❌ **Critical**: > 200 pending jobs, > 15 minutes overdue

---

## Summary

### **Current Capacity**
- **Sustained**: ~21,600 retries/day (~900/hour)
- **Peak**: ~100 retries/minute (theoretical)
- **Practical**: ~15 retries/minute (time-constrained)

### **Limitations**
1. Sequential processing (biggest bottleneck)
2. Batch size limit (100 jobs)
3. Single pod processing (no horizontal scaling)
4. 1-minute scheduler interval

### **When to Upgrade**
- **Upgrade needed when**: > 1,000 failures/hour sustained
- **Critical upgrade when**: > 5,000 failures/hour
- **Redesign needed when**: > 10,000 failures/hour

### **Quick Wins** (Can implement now)
1. Increase batch size: 100 → 500
2. Parallel processing: 1 → 10 concurrent
3. Reduce scheduler interval: 60s → 30s
4. **Expected improvement**: 5-10x capacity increase

