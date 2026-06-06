import { NUM_ACTIONS, stateCount } from './mdp.js';

export function createQTable() {
  const n = stateCount();
  const table = new Float32Array(n * NUM_ACTIONS);
  return { table, nStates: n };
}

export function qGet(q, stateIndex, action) {
  return q.table[stateIndex * NUM_ACTIONS + action];
}

export function qSet(q, stateIndex, action, value) {
  q.table[stateIndex * NUM_ACTIONS + action] = value;
}

export function bestAction(q, stateIndex) {
  let best = 0;
  let bestV = qGet(q, stateIndex, 0);
  for (let a = 1; a < NUM_ACTIONS; a++) {
    const v = qGet(q, stateIndex, a);
    if (v > bestV) {
      bestV = v;
      best = a;
    }
  }
  return best;
}

export function maxQ(q, stateIndex) {
  let m = qGet(q, stateIndex, 0);
  for (let a = 1; a < NUM_ACTIONS; a++) {
    const v = qGet(q, stateIndex, a);
    if (v > m) m = v;
  }
  return m;
}

export function selectAction(q, stateIndex, epsilon) {
  if (Math.random() < epsilon) {
    return Math.floor(Math.random() * NUM_ACTIONS);
  }
  return bestAction(q, stateIndex);
}

export function updateQ(q, s, a, reward, sNext, gamma, alpha, terminal) {
  const target = terminal ? reward : reward + gamma * maxQ(q, sNext);
  const old = qGet(q, s, a);
  qSet(q, s, a, old + alpha * (target - old));
}
