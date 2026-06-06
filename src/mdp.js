/**
 * Highway MDP for tabular Q-learning.
 *
 * S = (lane, speed_level, front_distance_bin, traffic_density)
 *   lane ∈ {0..3} four lanes (left → right)
 *   speed ∈ {LOW, MEDIUM, HIGH}
 *   front ∈ {NEAR, SAFE, FAR} from bumper headway (meters)
 *   density ∈ {LOW, MEDIUM, HIGH} — sampled per episode, fixed until reset
 *
 * A = accelerate, brake, lane left/right, keep straight
 */

export const LANE_MIN = 0;
export const LANE_MAX = 3;

export const SPEED = { LOW: 0, MEDIUM: 1, HIGH: 2 };
export const FRONT = { NEAR: 0, SAFE: 1, FAR: 2 };
export const DENSITY = { LOW: 0, MEDIUM: 1, HIGH: 2 };

/** Typical cruise speeds (abstract m/step scale, matched in traffic sim). */
export const TIER_V = [10.5, 17.5, 26.5];

export const ACTIONS = {
  ACCELERATE: 0,
  BRAKE: 1,
  MOVE_LEFT: 2,
  MOVE_RIGHT: 3,
  KEEP_STRAIGHT: 4,
};

export const NUM_ACTIONS = 5;
export const NUM_LANES = 4;
export const NUM_SPEEDS = 3;
export const NUM_FRONT = 3;
export const NUM_DENSITY = 3;

export const ACTION_NAMES = ['ACC', 'BRK', '←', '→', 'STR'];

export function stateCount() {
  return NUM_LANES * NUM_SPEEDS * NUM_FRONT * NUM_DENSITY;
}

export function encodeState(lane, speed, frontBin, density) {
  return (
    lane +
    NUM_LANES * (speed + NUM_SPEEDS * (frontBin + NUM_FRONT * density))
  );
}

export function decodeState(index) {
  const d = Math.floor(index / (NUM_LANES * NUM_SPEEDS * NUM_FRONT));
  let rem = index % (NUM_LANES * NUM_SPEEDS * NUM_FRONT);
  const fb = Math.floor(rem / (NUM_LANES * NUM_SPEEDS));
  rem %= NUM_LANES * NUM_SPEEDS;
  const sp = Math.floor(rem / NUM_LANES);
  const ln = rem % NUM_LANES;
  return { lane: ln, speed: sp, frontBin: fb, density: d };
}

/** Bumper headway (meters) → discrete front state. */
export function headwayToFrontBin(meters) {
  if (meters < 5) return FRONT.NEAR;
  if (meters < 14) return FRONT.SAFE;
  return FRONT.FAR;
}

/** Inner lanes (1,2) favored as “through” lanes on a 4-lane highway. */
export function isInnerLane(lane) {
  return lane === 1 || lane === 2;
}

/**
 * Reward shaping for safe, smooth, efficient driving.
 * `lastAction` / `action` used only for lane-change smoothness (approximate).
 */
export function computeDrivingReward({
  collision,
  offRoad,
  blockedLaneChange,
  frontBin,
  lane,
  action,
  lastAction,
  speed,
}) {
  if (collision) return -100;
  if (offRoad) return -50;
  if (blockedLaneChange) return -6;

  const laneChangeNow =
    action === ACTIONS.MOVE_LEFT || action === ACTIONS.MOVE_RIGHT;
  const laneChangePrev =
    lastAction === ACTIONS.MOVE_LEFT || lastAction === ACTIONS.MOVE_RIGHT;
  let smooth = 0;
  if (laneChangeNow && !laneChangePrev) smooth += 3;
  if (laneChangeNow && laneChangePrev) smooth -= 12;

  if (frontBin === FRONT.NEAR) return -10 + smooth;

  if (isInnerLane(lane)) {
    let r = 7;
    if (frontBin === FRONT.SAFE || frontBin === FRONT.FAR) r += 3;
    if (speed >= SPEED.MEDIUM && frontBin === FRONT.FAR) r += 2;
    return r + smooth;
  }
  if (frontBin === FRONT.SAFE || frontBin === FRONT.FAR) return 4 + smooth;
  return -1 + smooth;
}
