<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:0f172a,50:1e3a8a,100:0ea5e9&height=220&section=header&text=RL%20Self-Driving%20Car&fontSize=42&fontColor=ffffff&animation=fadeIn&fontAlignY=38&desc=Q-Learning%20on%20a%204-Lane%20Highway%20with%20Three.js&descAlignY=58&descSize=18" alt="RL Self-Driving Car Banner" />

# 🚗 RL Self-Driving Car

### A premium reinforcement learning simulation project built with JavaScript, Three.js, and Vite

<p>
  <a href="https://aadityaanand2002.github.io/rl-self-driving-car/"><img src="https://img.shields.io/badge/Live_Demo-GitHub_Pages-2ea44f?style=for-the-badge&logo=github" alt="Live Demo" /></a>
  <img src="https://img.shields.io/badge/JavaScript-ES6+-f7df1e?style=for-the-badge&logo=javascript&logoColor=000" alt="JavaScript" />
  <img src="https://img.shields.io/badge/Three.js-3D-black?style=for-the-badge&logo=three.js" alt="Three.js" />
  <img src="https://img.shields.io/badge/Vite-Build_Tool-646cff?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Reinforcement_Learning-Q--Learning-orange?style=for-the-badge" alt="Q-Learning" />
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="MIT License" />
</p>

<p>
  A browser-based autonomous driving simulation where a <b>tabular Q-learning agent</b> learns lane-level driving behavior
  inside a custom multi-vehicle highway environment, rendered in real time using <b>Three.js</b>.
</p>

</div>

---

## 🎯 Project Snapshot

| Metric | Value |
|---|---|
| Highway Lanes | **4** |
| Total States | **108** |
| Actions | **5** |
| Rendering Engine | **Three.js** |
| Build Tool | **Vite** |
| Deployment | **GitHub Pages** |

---

## 🌟 Why This Project Stands Out

This project combines **reinforcement learning**, **traffic simulation**, and **interactive 3D visualization** in a compact and easy-to-understand format. Instead of hiding the policy inside a deep neural network, it uses a **tabular Q-learning approach**, which makes the learning behavior much easier to inspect and explain.

It is especially useful for:

- Students learning the foundations of reinforcement learning
- Demonstrating MDPs and reward shaping visually
- Academic mini-projects and portfolio showcases
- Building intuition before moving to Deep RL methods

---

## ✨ Core Features

- 🧠 Tabular **Q-learning** with explicit Q-table updates
- 🛣️ Custom **4-lane highway simulator**
- 🚘 Ego agent capable of accelerating, braking, and changing lanes
- 🌐 Real-time **3D driving visualization** using Three.js
- 📊 Easy-to-understand state and action formulation
- ⚡ Fast local development workflow using Vite
- 🚀 Production-ready deployment through GitHub Pages

---

## 🖼️ Visual Output

### Environment View
![Environment View](./s1.png)

### Training Dashboard
![Training Dashboard](./s2.png)

### Learned Driving Behavior
![Learned Driving Behavior](./s3.png)

---

## 🔗 Live Experience

<p align="center">
  <a href="https://aadityaanand2002.github.io/rl-self-driving-car/"><img src="https://img.shields.io/badge/Open%20Live%20Demo-111827?style=for-the-badge&logo=github&logoColor=white" alt="Open Live Demo" /></a>
</p>

<p align="center">
  <b><a href="https://aadityaanand2002.github.io/rl-self-driving-car/">Launch the Project</a></b>
</p>

---

## 📄 Project Report

- [View Project Report PDF](./docs/SelfDrivingCar.pdf)

---

## 🧠 Reinforcement Learning Design

The environment models a 4-lane highway where the ego vehicle must take driving decisions in a changing traffic context. At each step, the agent observes a simplified state, selects an action, receives a reward, and updates the Q-table.

### State Space

The agent uses a discretized state representation with **108 total states**, based on:

- 4 lane positions
- 3 speed levels
- 3 front-distance bins
- 3 traffic density levels

```text
s = lane + 4 * (speed_tier + 3 * (front_bin + 3 * density))
```

### Action Space

The policy selects from 5 discrete actions:

- `ACCELERATE`
- `BRAKE`
- `MOVE_LEFT`
- `MOVE_RIGHT`
- `KEEP_STRAIGHT`

### Reward Objective

The reward design encourages the vehicle to:

- Drive safely
- Maintain good speed
- Avoid collisions
- Reduce unnecessary lane changes
- Stay within valid road boundaries

---

## 🔁 Learning Pipeline

```text
Current State → Select Action → Simulate Environment → Observe Reward → Update Q-table
```

### Bellman Update Rule

```js
Q[s][a] += alpha * (reward + gamma * Math.max(...Q[sNext]) - Q[s][a]);
```

### Epsilon-Greedy Action Selection

```js
if (Math.random() < epsilon) {
  return randomAction();
} else {
  return argmax(Q[state]);
}
```

---

## 🧰 Tech Stack

<p align="center">
  <img src="https://skillicons.dev/icons?i=js,vite,github" alt="Tech Stack Icons" />
</p>

| Technology | Role |
|---|---|
| **JavaScript (ES Modules)** | Reinforcement learning logic and simulator behavior |
| **Three.js** | Real-time 3D visualization and scene rendering |
| **Vite** | Development server and optimized production builds |
| **GitHub Pages** | Static hosting and deployment |

---

## 🗂️ Project Structure

```text
rl-self-driving-car/
├── index.html
├── package.json
├── vite.config.js
├── src/
│   ├── main.js
│   ├── mdp.js
│   ├── qlearning.js
│   └── trafficEnvironment.js
└── dist/
```

### Module Breakdown

- `main.js` — Three.js scene setup, renderer, HUD, and animation loop
- `mdp.js` — state encoding, action mapping, and reward design
- `qlearning.js` — Q-table creation, policy logic, and update rules
- `trafficEnvironment.js` — highway traffic simulation and environment transitions

---

## 🚀 Local Setup

### Requirements

- Node.js 18+
- npm 9+

### Run in Development Mode

```bash
npm install
npm run dev
```

### Build for Production

```bash
npm run build
```

The optimized build output is generated inside the `dist/` folder.

---

## 🌍 Deployment

This project is configured for **GitHub Pages** deployment through GitHub Actions.

### Deployment Steps

1. Push the repository to the `main` branch
2. Open **Repository Settings → Pages**
3. Select **GitHub Actions** as the source
4. The workflow in `.github/workflows/deploy.yml` will build and deploy automatically

### Important

If the repository name changes, update the base path inside `vite.config.js`.

```js
base: '/your-repo-name/'
```

---

## 📘 Educational Value

This project offers a clear bridge between theory and implementation. It helps explain how a reinforcement learning agent interacts with an environment, how discrete states are encoded, and how rewards shape policy behavior over time.

Because the design remains compact and interpretable, it is well suited for demonstrations, viva presentations, portfolio projects, and academic submissions.

---

## 🔮 Future Scope

- Add training metric plots and episode statistics
- Save and reload learned Q-tables
- Introduce more realistic traffic dynamics
- Improve reward shaping for smoother driving behavior
- Extend the agent from tabular RL to Deep Q-Networks
- Add richer analytics such as collision maps and behavior summaries

---

## 👨‍💻 Author

**Aditya Anand**

---

## 📄 License

This project is licensed under the **MIT License**.

---

## 🙏 Acknowledgements

- Sutton & Barto — *Reinforcement Learning: An Introduction*
- Watkins — Original Q-learning work
- Three.js documentation and open-source community examples
