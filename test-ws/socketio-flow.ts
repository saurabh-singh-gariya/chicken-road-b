import http from 'http';
import { io } from 'socket.io-client';

// Usage (PowerShell / CMD):
// node -r ts-node/register test-ws/socketio-flow.ts --token <JWT> --scenario win
// Optional args:
//   --scenario win|cashout|hazard
//   --bet 50
//   --difficulty easy|medium|hard
//   --columns 15             (client expectation; server currently fixed at 15)
//   --interval 250           (ms delay between steps)
//   --minBalance 1000        (auto-fund to at least this balance before bet)
//   --api http://localhost:3000  (base URL for REST wallet ops)
// Notes (after recent game logic changes + wallet auto-create):
//   * Wallets auto-create on first balance/deposit access server-side.
//   * Script can now optionally ensure sufficient balance via REST before opening the socket.
//   * Reaching the final step AUTO-WINS and pays out (including original bet).
//   * Mid-game cashout pays current winAmount but isWin = false (unless already at final step, then isWin = true).
//   * Hazard: bet already debited; no payout; profit = -betAmount.
//   * Responses include profit and endReason; we log those when game ends.
//   * If REST funding fails, script will still attempt to proceed (may get insufficient funds error).

// Parse simple CLI args
const argv = process.argv.slice(2);
function getArg(name: string, fallback?: string) {
  const idx = argv.findIndex((a) => a === `--${name}`);
  if (idx !== -1 && idx + 1 < argv.length) return argv[idx + 1];
  const pref = `--${name}=`;
  const direct = argv.find((a) => a.startsWith(pref));
  if (direct) return direct.substring(pref.length);
  return fallback;
}

const token = getArg('token', process.env.JWT || 'PASTE_YOUR_JWT_TOKEN');
const betAmount = parseInt(getArg('bet', '50')!, 10);
const minBalance = parseInt(getArg('minBalance', String(betAmount))!, 10);
const apiBase: string =
  getArg('api', 'http://localhost:3000') || 'http://localhost:3000';
let difficulty = (getArg('difficulty', 'easy') || 'easy').toLowerCase();
const scenario = (getArg('scenario', 'win') || 'win').toLowerCase();
const totalColumns = parseInt(getArg('columns', '15')!, 10); // mirrors server
const interval = parseInt(getArg('interval', '250')!, 10);

if (!token || token === 'PASTE_YOUR_JWT_TOKEN') {
  console.warn(
    'WARNING: No JWT provided. Pass with --token <JWT> or set env JWT',
  );
}

function decodeJwt(t?: string) {
  if (!t || t.split('.').length !== 3) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(
        t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'),
        'base64',
      ).toString('utf8'),
    );
    return payload;
  } catch {
    return null;
  }
}

const decoded = decodeJwt(token);
if (decoded)
  console.log('JWT payload sub:', decoded.sub, '| full payload:', decoded);

// Determine step sequence & cashout flag per scenario
interface FlowPlan {
  buildSteps: () => number[]; // returns ordered lineNumbers
  doCashout: boolean; // whether to cashout after last planned step (if still active)
  description: string;
}

const plans: Record<string, FlowPlan> = {
  win: {
    // Full path to final column (auto-win): 0..(totalColumns-1)
    buildSteps: () => Array.from({ length: totalColumns }, (_, i) => i),
    doCashout: false, // no cashout needed; game ends automatically
    description: 'Traverse all steps to trigger auto-win on final step',
  },
  cashout: {
    buildSteps: () => [0, 1, 2], // a few steps then exit
    doCashout: true, // mid-game cashout (isWin=false expected)
    description: 'Take a few steps then cash out mid-game (not a win)',
  },
  hazard: {
    buildSteps: () => [0, 1, 2, 3, 4], // May hit hazard earlier depending on RNG
    doCashout: false,
    description:
      'Walk several steps and stop; expect possible hazard before completion',
  },
};

const plan = plans[scenario] || plans.win;
console.log('Scenario:', scenario, '-', plan.description);

const s = io(
  (apiBase || 'http://localhost:3000').replace(/\/$/, '') + '/game',
  {
    transports: ['websocket'],
    auth: { token },
  },
);

let steps: number[] = [];
let stepIndex = -1;
let gameEnded = false;
let sessionSummary: {
  finalWinAmount?: number;
  profit?: number;
  endReason?: string;
  isWin?: boolean;
} = {};

function scheduleNextStep() {
  if (gameEnded) return;
  if (stepIndex + 1 >= steps.length) {
    // Completed all planned steps
    if (plan.doCashout && !gameEnded) {
      console.log('CASHOUT (mid-game)');
      s.emit('game-service', { action: 'cashout' });
    } else if (!plan.doCashout) {
      console.log(
        'Planned steps complete, no cashout. Waiting for auto-win/hazard.',
      );
    }
    return;
  }
  stepIndex++;
  const ln = steps[stepIndex];
  setTimeout(() => {
    if (!gameEnded) {
      console.log('STEP', ln);
      s.emit('game-service', { action: 'step', payload: { lineNumber: ln } });
    }
  }, interval);
}

async function ensureBalance(): Promise<void> {
  if (!token) return; // can't call REST without JWT
  try {
    const current = await httpJsonRequest<number>(
      'GET',
      `/api/v1/wallet/balance?userId=${encodeURIComponent(decoded?.sub)}`,
    );
    if (current >= minBalance) {
      console.log(`Balance OK (${current} >= ${minBalance})`);
      return;
    }
    const needed = minBalance - current;
    console.log(`Depositing ${needed} to reach minBalance ${minBalance}`);
    await httpJsonRequest('POST', '/api/v1/wallet/deposit', {
      userId: decoded?.sub,
      amount: needed,
    });
  } catch (e) {
    console.warn('Auto-fund step failed:', (e as any)?.message || e);
  }
}

function httpJsonRequest<T = any>(
  method: string,
  path: string,
  body?: any,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(
      (apiBase || 'http://localhost:3000').replace(/\/$/, '') + path,
    );
    const data = body ? JSON.stringify(body) : undefined;
    const req = http.request(
      {
        method,
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data ? Buffer.byteLength(data) : 0,
          Authorization: `Bearer ${token}`,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const txt = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode && res.statusCode >= 400) {
            return reject(new Error(`HTTP ${res.statusCode}: ${txt}`));
          }
          if (!txt) return resolve(undefined as any);
          try {
            resolve(JSON.parse(txt));
          } catch (e) {
            reject(new Error('Invalid JSON in response'));
          }
        });
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

s.on('connect', async () => {
  console.log('Connected', s.id);
  steps = plan.buildSteps();
  await ensureBalance();
  // Place bet after ensuring funds
  s.emit('game-service', { action: 'bet', payload: { betAmount, difficulty } });
});

s.on('game-service', (msg) => {
  console.log('RESP game-service', msg);
  if (!msg) return;
  const { isActive, isWin, endReason, winAmount, profit } = msg;
  if (!isActive) {
    gameEnded = true;
    sessionSummary = {
      finalWinAmount: winAmount,
      profit,
      endReason,
      isWin,
    };
    console.log('--- GAME SUMMARY ---');
    console.log('End Reason :', endReason);
    console.log('Win Amount :', winAmount);
    console.log('Profit     :', profit);
    console.log('isWin      :', isWin);
    console.log('--------------------');
    setTimeout(() => s.close(), 600);
    return;
  }
  // After bet response (currentStep = -1) start first step
  if (msg.currentStep === -1) {
    scheduleNextStep();
  } else {
    scheduleNextStep();
  }
});
s.on('betConfig', (cfg) => console.log('CFG betConfig', cfg));

s.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
});

s.io.on('error', (err: any) => {
  console.error('Socket.IO manager error', err);
});

process.on('SIGINT', () => {
  console.log('\nSIGINT received, closing');
  s.close();
  setTimeout(() => process.exit(0), 100);
});
