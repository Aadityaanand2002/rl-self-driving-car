# Project Report: Highway Driving Agent with Q-Learning (Three.js)

*Presentation outline — copy each slide block into your deck as needed.*

---

## Slide 1 — Outline of Presentation

1. Introduction  
2. Literature survey  
3. Problem statement  
4. Proposed system — MDP, \(Q\)-learning, hyperparameters, sim constants  
5. Hardware and software requirements  
6. Implementation status  
7. Results and evaluation (current stage)  
8. Publications / IP (if any)  
9. Advantages and applications  
10. Budget  
11. Remaining work and workflow  
12. Future scope  
13. References  

---

## Slide 2 — Introduction

Autonomous driving stacks **perception → prediction → planning → control**; RL often targets the **planning / policy** layer. यहाँ हम **model-free tabular Q-learning** पर focus करते हैं: state–action value function \(Q(s,a)\) को discrete MDP पर estimate करना, बिना explicit transition matrix \(P(s'|s,a)\) के — transitions **executable simulator** से sample होते हैं।

Implementation: **JavaScript + Three.js (WebGL)** में multi-vehicle microscopic sim चलाकर ego policy online train होती है; output interpretable \(Q\)-table और greedy action per state। Production ADAS का claim नहीं; goal **MDP formulation + RL update + traffic dynamics** का integrated demo है।

---

## Slide 3 — Literature Survey

**Markov Decision Processes** formalise decision-making under uncertainty: states, actions, transitions, rewards, and a discount factor (Puterman; classic RL texts by Sutton & Barto). **Q-learning** learns action values without a model of transitions, which fits when the “physics” is easier to simulate than to write as equations (Watkins; later work on convergence under tabular and function-approximation settings).

**Traffic simulation** ranges from microscopic models (car-following, lane-changing) to macroscopic flow; IDM-style acceleration is widely used in research and games. **Deep RL** (e.g. DQN and successors) dominates recent driving papers, but **tabular Q-learning** remains useful for teaching, small state spaces, and interpretable policies.

For **3D visualisation**, WebGL and libraries such as Three.js are standard for interactive demos in browsers without installing heavy simulators.

---

## Slide 4 — Problem Statement

We needed a system that:

- Stays **small enough for tabular Q-learning** (finite state and action sets),  
- Still feels like **multi-lane highway driving** (several vehicles, varying density),  
- **Trains online** with clear rewards (safety, lane discipline, smoothness), and  
- **Renders in 3D** so non-specialists can see what the policy is doing.

Hard constraints: no real sensors or vehicle hardware; everything runs in software. Soft constraints: avoid “black box” behaviour where the student cannot relate the numbers on screen to the MDP definition.

---

## Slide 5 — Proposed Method / System (Technical Specification)

### 5.1 MDP tuple
\(\mathcal{M} = (\mathcal{S}, \mathcal{A}, P, R, \gamma)\).  
\(P\) explicitly matrix form में नहीं है — **JavaScript `TrafficEnvironment.step()`** stochastic + deterministic rules से next continuous variables produce करता है; tabular agent को केवल **discretised observation** मिलता है।

---

### 5.2 State space \(\mathcal{S}\) (tabular)
**Cardinality:** \(|\mathcal{S}| = 4 \times 3 \times 3 \times 3 = \mathbf{108}\).

| Component | Symbol / range | Semantics |
|-----------|----------------|-----------|
| Lane index | \(\ell \in \{0,1,2,3\}\) | 4-lane highway (discrete lateral index) |
| Speed tier | \(u \in \{\mathrm{LOW},\mathrm{MED},\mathrm{HIGH}\} = \{0,1,2\}\) | Discrete speed class (ACCELERATE / BRAKE से बदलता है) |
| Front bin | \(f \in \{\mathrm{NEAR},\mathrm{SAFE},\mathrm{FAR}\} = \{0,1,2\}\) | Same-lane **bumper headway** \(h\) (metres) से quantization |
| Traffic density | \(d \in \{0,1,2\}\) | Episode start पर uniform random; episode भर **constant** (policy conditioning) |

**Headway discretisation** (`headwayToFrontBin` — `mdp.js`):
- \(h < 5\) m → NEAR  
- \(5 \le h < 14\) m → SAFE  
- \(h \ge 14\) m → FAR  

**Headway definition:** same-lane nearest lead vehicle; bumper clearance \(h = \Delta z_{\mathrm{center}} - L_{\mathrm{car}}\) (approx.), no lead → sentinel **90 m** (FAR bucket).

**State indexing (row-major flatten):**
\[
s = \ell + 4\bigl(u + 3(f + 3d)\bigr)
\]

---

### 5.3 Action space \(\mathcal{A}\)
\(|\mathcal{A}| = \mathbf{5}\). Integer mapping (`ACTIONS` in `mdp.js`):

| ID | Enum | Effect on ego (per env step) |
|----|------|--------------------------------|
| 0 | ACCELERATE | \(u \leftarrow \min(u+1,2)\); then \(v\) sync to tier |
| 1 | BRAKE | \(u \leftarrow \max(u-1,0)\) |
| 2 | MOVE_LEFT | \(\ell \leftarrow \ell-1\) if \(\ell>0\) and gap safe; else off-road / blocked |
| 3 | MOVE_RIGHT | \(\ell \leftarrow \ell+1\) if \(\ell<3\) and safe |
| 4 | KEEP_STRAIGHT | \(\ell, u\) unchanged |

**Policy:** ε-greedy — \(\Pr(a = \mathrm{random}) = \varepsilon\), else \(a = \arg\max_{a'} Q(s,a')\).

---

### 5.4 Reward \(R(s,a)\) (shaped scalar, `computeDrivingReward`)
Priority order (first match wins base; lane-change smoothness **additive term** `smooth`):

| Condition | Reward |
|-----------|--------|
| Collision (terminal) | **−100** |
| Off-road (invalid lateral) | **−50** |
| Blocked lane change | **−6** |
| Then: `smooth`: lone lane-change +3; consecutive lane-change −12 | added |
| \(f=\) NEAR | **−10** + smooth |
| Inner lane \(\ell \in \{1,2\}\) | base **+7**; if \(f\in\{\mathrm{SAFE},\mathrm{FAR}\}\) **+3**; if \(u\ge \mathrm{MED}\) and \(f=\mathrm{FAR}\) **+2**; + smooth |
| Else if \(f\in\{\mathrm{SAFE},\mathrm{FAR}\}\) | **+4** + smooth |
| Else | **−1** + smooth |

**Terminal set:** collision only → episodic reset; \(s'\) bootstrap के लिए terminal पर \(Q(s',\cdot)=0\) (standard TD target).

---

### 5.5 Q-learning update (tabular)
One-step backup (`qlearning.js`):
\[
Q(s,a) \leftarrow Q(s,a) + \alpha \Bigl[ r + \gamma \max_{a'} Q(s',a') \cdot \mathbb{1}[\neg\mathrm{done}] - Q(s,a) \Bigr]
\]
- **Representation:** `Float32Array` length \(108 \times 5 = 540\).  
- **Initialisation:** zeros (reset button से wipe).

---

### 5.6 Hyperparameters (UI + code defaults)

| Parameter | Symbol | Default (typical) | Range in UI / notes |
|-----------|--------|-------------------|---------------------|
| Discount factor | \(\gamma\) | **0.90** | slider maps 0.80–1.00 (HTML default 90) |
| Learning rate | \(\alpha\) | **0.10** | 0.05–1.00 step 0.01 (default 10) |
| Exploration | \(\varepsilon\) | **0.25** | 0–1 (default 25 on 0–100 scale) |
| Env steps per second | — | **6** | 1–120 (sim ticks / wall-clock second) |
| Max RL steps / frame | — | **4** | burst cap (reduces visual + target jitter) |

**OrbitControls:** `dampingFactor = 0.12`; camera chase uses exponential smoothing \(1-e^{-2.6\,\Delta t}\) on target; mesh Z smoothing \(1-e^{-10\,\Delta t}\) toward sim target.

---

### 5.7 Environment / dynamics constants (`trafficEnvironment.js`)

| Quantity | Value | Role |
|----------|-------|------|
| \(L_{\mathrm{car}}\) | 4.1 m | length scale, collision, headway |
| \(\Delta t_{\mathrm{z}}\) (`Z_DT`) | **0.34** | scales \(\Delta z = v \cdot \Delta t_{\mathrm{z}}\) per step |
| Tier speeds `TIER_V` | **[10.5, 17.5, 26.5]** | ego \(v\) after tier change (+ small noise ±0.1 for ego) |
| NPC \(v\) clamp | [6, 36] | after acceleration integration |
| Car-following | \(a = 0.34(d_v - v) + \mathcal{U}(-0.5,0.5)\); braking term if bumper \(< s_0=2.1+0.44v\) | heuristic IDM-like |
| Lane-change safety | longitudinal gap **6.2 m** (ego), **5.0 m** (NPC neighbour check) | |
| Merge-into-ego probability | base \(0.013 + 0.011 d\); lead window \(dz \in [11,72]\) m | |
| NPC recycle (far behind) | if \(z_{\mathrm{ego}}-z_{\mathrm{npc}}>95\) m → respawn \(z \in [z_{\mathrm{ego}}+62,\,z_{\mathrm{ego}}+155]\) | |
| Longitudinal rebase | if \(z_{\mathrm{ego}}>620\) → subtract shift \(= z_{\mathrm{ego}}-320\) from **all** vehicles | numeric stability |
| NPC count by density \(d\) | **8 / 14 / 22** | low / med / high |

**Collision:** same lane, \(|\Delta z| < 0.9\,L_{\mathrm{car}}\).

---

### 5.8 Visualisation (`main.js` / Three.js)

| Item | Value |
|------|--------|
| Lane width | **3.05 m** |
| Fixed road patch length | **1400 m** (world Z; group at origin — **sirf gaadiyan move**) |
| Mesh culling radius | **260 m** from ego (approx.) |
| Renderer | WebGLRenderer, ACES tone-mapping, PCF soft shadows |
| 2D labels | CSS2DRenderer for “YOU” tag |

---

### 5.9 Software architecture (modules)
- `mdp.js` — constants, `encodeState` / `decodeState`, `headwayToFrontBin`, `computeDrivingReward`  
- `qlearning.js` — `Q` storage, ε-greedy, Bellman backup  
- `trafficEnvironment.js` — multi-agent step, merges, rebase, recycle  
- `main.js` — Three.js scene, UI, training loop, visual smoothing, camera  

---

*Slide 5 यहीं technical core है — viva / report में “क्या parameters use किए” सीधे इस table से answer कर सकते हो।*

---

## Slide 6 — Hardware / Software Requirements

**Hardware**  
Any recent laptop or desktop with a normal GPU (integrated graphics is enough for this scene). RAM and CPU are modest; no GPU cluster or cloud requirement for the current build.

**Software**  
- **Node.js** (LTS) for the build tool  
- **npm** for dependencies  
- A **modern browser** (Chrome, Firefox, Edge, Safari) with WebGL support  
- **Libraries:** Three.js (3D), Vite (dev server and bundling)  
- **OS:** macOS, Windows, or Linux — wherever Node runs  

No microcontrollers, no ROS, no CUDA dependency for the tabular version.

---

## Slide 7 — Implementation Updates (Work Done)

Roughly in order of completion:

- Project scaffold (Vite + Three.js).  
- First grid-world style MDP, then redesign to **lane × speed × headway × density**.  
- **Traffic simulator** with multiple vehicles, density-dependent counts, merge logic, and rebase.  
- **Q-table** training loop with ε-greedy exploration and UI controls (pause, reset Q, sliders).  
- **Highway visuals:** four-lane road, markings, shoulders, posts, fog, lighting.  
- **Ego identification** (colour, ring, “YOU” label) and **camera zoom** controls.  
- **Motion smoothing** for meshes; fixed world road vs moving road experiment; caps on RL steps per frame to reduce visual spikes.  
- Build verified with `npm run build`; local run with `npm run dev`.

What is *not* done yet is listed under remaining work (next slide section).

---

## Slide 8 — Partial / Full Results (Papers, Patents)

**Current status:** this is a **course / prototype / demo** level project. We did **not** write a conference paper, journal article, or patent application from it.  

**Partial results you can honestly report:**  
- The agent **does learn** to reduce collisions and survive longer episodes when ε is reduced after an initial exploration phase (observable in the on-screen counters).  
- Policies are **interpretable** in the tabular sense: you can inspect which greedy action the table prefers per state bucket.  

If the work were extended (e.g. formal ablation study, statistical runs across seeds, comparison to a baseline), it could become material for a **student workshop** or **education-oriented** short paper — that would be future work, not a claim today.

---

## Slide 9 — Advantages and Applications

**Advantages**  
- Runs in a **browser**; easy to demonstrate in a lab or classroom.  
- **Transparent MDP:** state dimensions match what you show in the UI.  
- **No dataset download** and no training cluster for the tabular version.  
- Fast iteration: change reward weights or density and retrain in minutes.

**Applications**  
- Teaching **MDP formulation**, **reward design**, and **exploration vs exploitation**.  
- First step before moving students to **Deep Q-Networks** or continuous control.  
- A **visual sandbox** for discussing highway rules, safe headway, and lane-change etiquette in a simplified world.

---

## Slide 10 — Budget

For the setup we used: **zero dedicated project budget** — only existing machines and open-source software (Three.js, Vite, Node).  

If you formalise this for an institution, line items might include: optional domain hosting for a static build (~tens of dollars per year), or a used machine if students lack a computer — otherwise treat as **not applicable** or **negligible**.

---

## Slide 11 — Workflow for Remaining Work

Suggested order if development continues:

1. **Logging:** export episode length, collision rate, and reward per episode to CSV for simple plots.  
2. **Baselines:** random policy and “always brake when near” hand rule for comparison.  
3. **Hyperparameter sweep:** grid over α, ε decay schedule, and reward weights.  
4. **Stress tests:** more NPCs, harder merge rate, check tabular limits.  
5. **Optional upgrade path:** DQN or similar if state is expanded or made continuous; then revisit GPU need.  
6. **Packaging:** static deploy (`npm run build`) + short user README for assessors.

Each step should end with a quick regression check in the browser so the demo does not break silently.

---

## Slide 12 — Future Scope

- **Function approximation:** neural Q-network when the state includes more features (relative velocities, multiple lanes of neighbours).  
- **Continuous actions** (steering, throttle) with policy gradient methods.  
- **Curriculum:** start sparse traffic, increase density as the agent improves.  
- **Metrics** aligned with literature: time-to-collision, minimum headway histograms.  
- **User study:** whether the 3D view actually helps students understand the MDP compared to charts alone.

Longer term, coupling to a standard simulator (SUMO, CARLA) would trade simplicity for realism — worth it only if the learning goals change.

---

## Slide 13 — References

1. Sutton, R. S., & Barto, A. G. *Reinforcement Learning: An Introduction* (2nd ed.). MIT Press.  
2. Watkins, C. J. C. H. *Learning from Delayed Rewards* (PhD thesis, Q-learning).  
3. Puterman, M. L. *Markov Decision Processes: Discrete Stochastic Dynamic Programming*. Wiley.  
4. Treiber, M., Hennecke, A., & Helbing, D. Congested traffic states in empirical observations and microscopic simulations. *Physical Review E* (IDM-related literature).  
5. Three.js documentation: https://threejs.org/docs/  
6. Vite documentation: https://vitejs.dev/  

*(Add your course notes, lab manual, or institution guidelines if the report is for internal assessment.)*

---

*End of slide content. Adjust wording to match your department’s tone (more formal / more informal) before submission.*
