import {
  ACTIONS,
  SPEED,
  TIER_V,
  headwayToFrontBin,
  computeDrivingReward,
} from './mdp.js';

const CAR_LEN = 4.1;
const HALF_LEN = CAR_LEN * 0.5;
const Z_DT = 0.34;

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function npcCountForDensity(d) {
  if (d === 0) return 8;
  if (d === 1) return 14;
  return 22;
}

export class TrafficEnvironment {
  constructor() {
    this.cars = [];
    this.density = 1;
    this.lastAction = ACTIONS.KEEP_STRAIGHT;
  }

  reset() {
    this.density = Math.floor(Math.random() * 3);
    this.cars = [];
    this.lastAction = ACTIONS.KEEP_STRAIGHT;

    this.cars.push({
      id: 0,
      agent: true,
      lane: 1 + Math.floor(Math.random() * 2),
      z: 14 + Math.random() * 5,
      v: TIER_V[SPEED.MEDIUM],
      speedTier: SPEED.MEDIUM,
      desiredV: rand(15, 22),
      length: CAR_LEN,
      laneCd: 0,
    });

    const n = npcCountForDensity(this.density);
    let id = 1;
    for (let i = 0; i < n; i++) {
      const lane = Math.floor(Math.random() * 4);
      const z = rand(4, 92) + (i % 7) * 0.35;
      const desiredV = rand(11, 29);
      this.cars.push({
        id: id++,
        agent: false,
        lane,
        z,
        v: clamp(desiredV + rand(-3, 3), 7, 33),
        speedTier: 0,
        desiredV,
        length: CAR_LEN,
        laneCd: Math.floor(rand(0, 55)),
      });
    }
  }

  getAgent() {
    return this.cars.find((c) => c.agent);
  }

  getObservation() {
    const a = this.getAgent();
    const h = this.headwayAheadMeters(a);
    return {
      lane: a.lane,
      speed: a.speedTier,
      frontBin: headwayToFrontBin(h),
      density: this.density,
      headwayMeters: h,
    };
  }

  headwayAheadMeters(agent) {
    let best = Infinity;
    let lead = null;
    for (const c of this.cars) {
      if (c.agent || c.lane !== agent.lane) continue;
      const dz = c.z - agent.z;
      if (dz > 0.4 && dz < best) {
        best = dz;
        lead = c;
      }
    }
    if (!lead) return 90;
    return best - HALF_LEN * 2;
  }

  isLaneChangeSafe(agent, newLane) {
    for (const c of this.cars) {
      if (c.id === agent.id) continue;
      if (c.lane !== newLane) continue;
      if (Math.abs(c.z - agent.z) < 6.2) return false;
    }
    return true;
  }

  agentCollides(agent) {
    for (const c of this.cars) {
      if (c.id === agent.id) continue;
      if (c.lane !== agent.lane) continue;
      if (Math.abs(c.z - agent.z) < CAR_LEN * 0.9) return true;
    }
    return false;
  }

  isLaneGapClear(excludeId, lane, z, minGap) {
    for (const o of this.cars) {
      if (o.id === excludeId || o.lane !== lane) continue;
      if (Math.abs(o.z - z) < minGap) return false;
    }
    return true;
  }

  /** NPCs in adjacent lanes ahead sometimes merge into the agent's lane (realistic obstacle). */
  mergeNpcTowardAgentLane(agent) {
    const p = 0.013 + this.density * 0.011;
    for (const c of this.cars) {
      if (c.agent) continue;
      if (c.lane === agent.lane) continue;
      if (Math.abs(c.lane - agent.lane) !== 1) continue;
      const dz = c.z - agent.z;
      if (dz < 11 || dz > 72) continue;
      if (Math.random() > p) continue;
      const target = agent.lane;
      if (!this.isLaneGapClear(c.id, target, c.z, 6.9)) continue;
      c.lane = target;
      c.laneCd = Math.floor(rand(32, 78));
    }
  }

  /**
   * NPC far behind the agent: respawn ahead (off-camera) instead of wrapping in place.
   */
  recycleNpcFarBehind(c, agent) {
    if (agent.z - c.z < 95) return;
    c.z = agent.z + rand(62, 155);
    c.lane = Math.floor(Math.random() * 4);
    c.v = clamp(c.desiredV + rand(-2.5, 2.5), 7, 33);
    c.laneCd = Math.floor(rand(12, 45));
  }

  /**
   * Keep z coordinates in a moderate band so the world + visuals stay stable.
   * Same shift applied to every car preserves relative motion; renderer subtracts the same shift.
   */
  rebaseLongitudinal(agent) {
    if (agent.z < 620) return 0;
    const shift = agent.z - 320;
    for (const c of this.cars) {
      c.z -= shift;
    }
    return shift;
  }

  step(action) {
    const agent = this.getAgent();
    let offRoad = false;
    let blockedLaneChange = false;
    let lane = agent.lane;
    let speedTier = agent.speedTier;

    if (action === ACTIONS.MOVE_LEFT) {
      if (lane <= 0) offRoad = true;
      else if (this.isLaneChangeSafe(agent, lane - 1)) lane -= 1;
      else blockedLaneChange = true;
    } else if (action === ACTIONS.MOVE_RIGHT) {
      if (lane >= 3) offRoad = true;
      else if (this.isLaneChangeSafe(agent, lane + 1)) lane += 1;
      else blockedLaneChange = true;
    }

    if (action === ACTIONS.ACCELERATE) {
      speedTier = Math.min(SPEED.HIGH, speedTier + 1);
    } else if (action === ACTIONS.BRAKE) {
      speedTier = Math.max(SPEED.LOW, speedTier - 1);
    }

    agent.lane = lane;
    agent.speedTier = speedTier;
    agent.v = clamp(TIER_V[speedTier] + rand(-0.1, 0.1), 6, 36);

    for (const c of this.cars) {
      if (c.agent) continue;
      if (c.laneCd > 0) c.laneCd -= 1;

      let minDz = 200;
      for (const o of this.cars) {
        if (o.id === c.id) continue;
        if (o.lane !== c.lane) continue;
        const dz = o.z - c.z;
        if (dz > 0.25 && dz < minDz) minDz = dz;
      }
      const bumper = minDz - CAR_LEN;

      let acc = 0.34 * (c.desiredV - c.v) + rand(-0.5, 0.5);
      const s0 = 2.1 + 0.44 * c.v;
      if (bumper < s0) {
        acc -= 1.2 * (s0 - bumper) / Math.max(0.7, s0);
      }
      if (bumper < 0.6) acc = Math.min(acc, -4.2);

      c.v = clamp(c.v + acc, 6, 36);
      c.z += c.v * Z_DT;
      this.recycleNpcFarBehind(c, agent);

      const pLc =
        (0.007 + this.density * 0.007 + Math.max(0, c.desiredV - c.v) * 0.0012) *
        (c.laneCd <= 0 ? 1 : 0.12);
      if (Math.random() < pLc) {
        const dir = Math.random() < 0.5 ? -1 : 1;
        const nl = c.lane + dir;
        if (nl >= 0 && nl <= 3) {
          let ok = true;
          for (const o of this.cars) {
            if (o.id === c.id || o.lane !== nl) continue;
            if (Math.abs(o.z - c.z) < 5.0) {
              ok = false;
              break;
            }
          }
          if (ok) {
            c.lane = nl;
            c.laneCd = Math.floor(rand(26, 72));
          }
        }
      }

      c.desiredV += rand(-0.06, 0.06);
      c.desiredV = clamp(c.desiredV, 10, 32);
    }

    this.mergeNpcTowardAgentLane(agent);

    agent.z += agent.v * Z_DT;

    const rebaseShift = this.rebaseLongitudinal(agent);

    const collision = this.agentCollides(agent);
    const terminal = collision;

    const headway = this.headwayAheadMeters(agent);
    const frontBin = headwayToFrontBin(headway);

    const reward = computeDrivingReward({
      collision,
      offRoad,
      blockedLaneChange,
      frontBin,
      lane: agent.lane,
      action,
      lastAction: this.lastAction,
      speed: agent.speedTier,
    });

    this.lastAction = action;

    return {
      reward,
      terminal,
      collision,
      offRoad,
      blockedLaneChange,
      headwayMeters: headway,
      frontBin,
      lane: agent.lane,
      speed: agent.speedTier,
      density: this.density,
      rebaseShift,
    };
  }
}
