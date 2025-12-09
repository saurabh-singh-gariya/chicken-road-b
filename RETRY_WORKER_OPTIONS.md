# Retry System - Separate Thread/Process Options

## Current Implementation
- Uses `@nestjs/schedule` cron jobs
- Runs in main application process
- Executes on main event loop

## Option 1: Node.js Worker Threads (Same Process, Separate Thread)

### Pros:
- ✅ True multi-threading (separate V8 isolate)
- ✅ Doesn't block main event loop
- ✅ Shared memory for data passing
- ✅ No separate deployment needed

### Cons:
- ❌ Still shares process resources (memory, CPU)
- ❌ If main app crashes, worker crashes too
- ❌ More complex error handling

### Implementation:
```typescript
// wallet-retry-worker.service.ts
import { Worker } from 'worker_threads';

@Injectable()
export class WalletRetryWorkerService {
  private worker: Worker;

  async startWorker() {
    this.worker = new Worker('./dist/workers/retry-worker.js', {
      workerData: { /* config */ }
    });
    
    this.worker.on('message', (result) => {
      // Handle retry results
    });
  }
}
```

---

## Option 2: Separate Microservice (Recommended for Production)

### Pros:
- ✅ Complete isolation (separate process)
- ✅ Independent scaling (scale retry workers separately)
- ✅ Fault isolation (retry service crash doesn't affect main app)
- ✅ Can use different resources (CPU/memory)
- ✅ Easier monitoring and debugging

### Cons:
- ❌ More complex deployment
- ❌ Network overhead for inter-service communication
- ❌ Need service discovery/load balancing

### Architecture:
```
Main App (API Server)
  ↓ (creates retry jobs in DB)
Database (wallet_retry_job table)
  ↓ (reads jobs)
Retry Worker Service (Separate Deployment)
  ↓ (executes retries)
Agent Wallet APIs
```

### Kubernetes Deployment:
```yaml
# retry-worker-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: retry-worker
spec:
  replicas: 2  # Scale independently
  template:
    spec:
      containers:
      - name: retry-worker
        image: your-app:latest
        command: ["node", "dist/workers/retry-worker.js"]
        env:
        - name: WORKER_MODE
          value: "retry-only"
```

---

## Option 3: Job Queue System (Bull/BullMQ) - Best for High Volume

### Pros:
- ✅ Built for background jobs
- ✅ Automatic retries, job priorities
- ✅ Job progress tracking
- ✅ Rate limiting, concurrency control
- ✅ Web UI for monitoring
- ✅ Job persistence in Redis

### Cons:
- ❌ Additional dependency (Redis + Bull)
- ❌ Learning curve
- ❌ More infrastructure

### Implementation:
```typescript
// Install: npm install @nestjs/bull bull
import { Queue } from 'bull';

@Injectable()
export class WalletRetryQueueService {
  private retryQueue: Queue;

  async addRetryJob(jobData: any) {
    await this.retryQueue.add('process-retry', jobData, {
      attempts: 1, // We handle retries ourselves
      delay: 5 * 60 * 1000, // 5 minutes
    });
  }
}

// Worker process
@Processor('retry-queue')
export class RetryProcessor {
  @Process('process-retry')
  async handleRetry(job: Job) {
    // Process retry
  }
}
```

---

## Option 4: Separate Kubernetes CronJob (Scheduled Worker)

### Pros:
- ✅ Runs on schedule (every minute)
- ✅ Complete isolation
- ✅ Auto-cleanup after execution
- ✅ No long-running process

### Cons:
- ❌ Pod startup overhead
- ❌ Less efficient for frequent runs

### Implementation:
```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: retry-worker
spec:
  schedule: "* * * * *"  # Every minute
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: retry-worker
            image: your-app:latest
            command: ["node", "dist/scripts/process-retries.js"]
          restartPolicy: OnFailure
```

---

## Recommendation

### For Your Use Case:

**Short Term (Current):**
- Keep current implementation (cron in main app)
- Already has distributed locking (Redis)
- Works fine for moderate load

**Medium Term (When Scaling):**
- **Option 2: Separate Microservice** (Best balance)
  - Deploy retry scheduler as separate Kubernetes deployment
  - Scale independently (2-3 retry worker pods)
  - Main app pods don't run retry scheduler

**Long Term (High Volume):**
- **Option 3: Bull/BullMQ** (Best for scale)
  - Better job management
  - Built-in monitoring
  - Handles millions of jobs

---

## Quick Implementation: Separate Worker Service

### Step 1: Create Worker Entry Point
```typescript
// src/workers/retry-worker.main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { WalletRetrySchedulerService } from '../modules/wallet-retry/wallet-retry-scheduler.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const scheduler = app.get(WalletRetrySchedulerService);
  
  // Run scheduler immediately, then every minute
  await scheduler.processDueRetries();
  setInterval(() => {
    scheduler.processDueRetries();
  }, 60 * 1000);
}

bootstrap();
```

### Step 2: Update package.json
```json
{
  "scripts": {
    "start:worker": "ts-node src/workers/retry-worker.main.ts"
  }
}
```

### Step 3: Deploy Separately
```yaml
# retry-worker-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: retry-worker
spec:
  replicas: 1
  template:
    spec:
      containers:
      - name: retry-worker
        image: your-app:latest
        command: ["npm", "run", "start:worker"]
```

### Step 4: Disable in Main App
```typescript
// In app.module.ts or environment config
@Module({
  providers: [
    // Conditionally register scheduler
    ...(process.env.ENABLE_RETRY_SCHEDULER !== 'false' 
      ? [WalletRetrySchedulerService] 
      : []),
  ],
})
```

---

## Performance Comparison

| Option | Isolation | Scalability | Complexity | Resource Usage |
|--------|----------|-------------|------------|----------------|
| Current (Cron) | Low | Medium | Low | Shared |
| Worker Threads | Medium | Medium | Medium | Shared |
| Separate Service | High | High | Medium | Separate |
| Bull Queue | High | Very High | High | Separate |
| CronJob | High | Low | Low | Ephemeral |

---

## Migration Path

1. **Phase 1**: Keep current, add feature flag
2. **Phase 2**: Deploy separate worker service (Option 2)
3. **Phase 3**: Disable scheduler in main app
4. **Phase 4** (Optional): Migrate to Bull if needed

