# Virtua Live2D - Agentic State Controller

A Live2D character rig driven by real-time agentic LLM states. Built as part of a practice-led research project at the University of Canberra exploring how embodied avatars can communicate the internal states of an agentic AI assistant.

**Live demo:** [virtua.nanix.dev](https://virtua.nanix.dev) - guest login available (on request)

**Design Framework:** [`Design_Framework.pdf`](./Design_Framework.pdf) - full parameter mappings, design rationale, and transferable principles

---

## What This Is

Most agentic LLM interfaces show the user a spinner or the word "Working…" regardless of what the bot is actually doing. This project provides a Live2D avatar layer that communicates six distinct agentic states in real time - driven directly from the bot's internal loop rather than from the content of completed responses.

The six states and their triggers:

| State | Trigger |
|---|---|
| `idle` | Bot at rest, awaiting input |
| `thinking` | Message received, reasoning in progress |
| `working` | Tool executing, awaiting result |
| `responding` | Reply streaming to user |
| `error` | Exception, rate limit, or API failure |
| `surprise` | Server-push notification received |

Each state is defined in a JSON file specifying static parameters (fixed values for the duration of the state), continuous drift parameters, fade timings, display floors/ceilings, and whether the mouth state machine should run. The avatar is driven entirely through code - no pre-authored motions or expression clips.

---

## Prerequisites

### 1. Node.js 20+

```bash
node --version   # must be v20 or higher
```

If you are on an older version, install Node 20 via [nvm](https://github.com/nvm-sh/nvm):

```bash
nvm install 20 && nvm use 20
```

### 2. Live2D Cubism SDK for Web

Download the Cubism SDK for Web from the Live2D developer site:
→ https://www.live2d.com/en/sdk/download/cubism/

Extract the archive and copy two folders into the root of this repository:

```
live2d-embodied-avatar/
  Core/        ← from CubismSdkForWeb-X-X/Core/
  Framework/   ← from CubismSdkForWeb-X-X/Framework/
```

### 3. A Live2D model

This integration was developed and tested with **Niziiro Mao**, available from the Live2D sample model page:
→ https://www.live2d.com/en/learn/sample/

Download and extract the model files to:

```
live2d-embodied-avatar/
  models/
    mao/
      niiziro_mao.model3.json
      ... (textures, physics, etc.)
      states/   ← copy the states/ folder from this repo here
```

The model path is configured in `src/lappdefine.ts`:

```typescript
const ModelPath  = './models/mao/';
const ModelFile = 'niiziro_mao.model3.json';
```

Adjust these values if you are using a different model.

---

## Setup and Build

```bash
# Install dependencies
npm install

# Build
npm run build

# Output is in dist/
```

The `dist/` folder is a complete self-contained application. Serve it from any static web server:

```bash
# Quick local test
npx serve dist

# Or via Python
cd dist && python3 -m http.server 8080
```

Open `http://localhost:8080` in a browser - the model should load and begin the idle animation.

---

## Controlling States

### From the browser console

Once loaded, the avatar is controllable directly from the browser console:

```javascript
Live2DApp.setState('thinking')
Live2DApp.setState('working')
Live2DApp.setState('responding')
Live2DApp.setState('error')
Live2DApp.setState('surprise')
Live2DApp.setState('idle')
```

### From a Python backend (WebSocket)

Emit state events over your existing WebSocket connection:

```python
async def emit_state(ws, state: str):
    await ws.send_json({"type": "state", "id": state})
    await asyncio.sleep(0)  # flush frame before synchronous work begins

# In your agentic loop:
await emit_state(ws, 'thinking')   # message received
await emit_state(ws, 'working')    # tool dispatching
await emit_state(ws, 'responding') # end_turn, reply beginning
await emit_state(ws, 'idle')       # reply complete
await emit_state(ws, 'error')      # exception caught
```

The `asyncio.sleep(0)` is important - it yields to the event loop to flush the WebSocket frame before any blocking work (ChromaDB queries, system prompt construction, etc.) begins. Without it, the `thinking` state will not appear until after the synchronous work completes.
Ensure that when consuming these WebSocket packets - you pass them to the `Live2DApp.setState()` function.

```js
// When handling WS message:
...
ws.onmessage = (e) => handleMsg(JSON.parse(e.data));
...

function handleMsg(msg) {
	switch (msg.type) {
		...
		// Set the state for the app
		case "state":
			if (typeof window.Live2DApp.setState === 'function') {
				window.Live2DApp.setState(msg.id);
			}
		break;
	}
}
```

---

## State JSON Format

Each state is defined in a JSON file under `states/`. The format:

```json
{
  "FadeInTime": 400,
  "FadeOutTime": 400,
  "UseMouth": false,
  "MinimumTime": 500,
  "MaximumTime": 0,
  "Static": [
    { "Id": "ParamAngleX", "Value": -30 },
    { "Id": "ParamEyeBallY", "Value": 1.0 }
  ],
  "Drift": [
    { "Id": "ParamAngleZ", "Min": 0, "Max": 30, "Time": 5 },
    { "Id": "ParamEyeLOpen", "Min": 0.7, "Max": 0.9, "Time": 6 }
  ]
}
```

| Field | Purpose |
|---|---|
| `FadeInTime` | Blend-in duration in ms |
| `FadeOutTime` | Blend-out duration in ms |
| `UseMouth` | Activates phoneme mouth state machine when `true` |
| `MinimumTime` | State will not transition out before this duration |
| `MaximumTime` | State auto-returns to idle after this duration (0 = no limit) |
| `Static` | Parameters held at fixed values for the state duration |
| `Drift` | Parameters animated continuously within a min/max range |

The `manifest.json` maps state names to their JSON files:

```json
{
  "states": {
    "idle":       "idle.json",
    "thinking":   "thinking.json",
    "working":    "working.json",
    "responding": "responding.json",
    "error":      "error.json",
    "surprise":   "surprise.json"
  }
}
```

States are loaded at runtime and can be modified without rebuilding.

---

## Adapting to a Different Model

The state JSON files in this repository contain parameter IDs specific to Niziiro Mao. If you are using a different model:

1. Open your model in **Cubism Editor 5** and note the parameter IDs available
2. For each state JSON, replace parameter IDs with the equivalent IDs for your model
3. Author the static target values by moving sliders in the editor and noting the values
4. Adjust drift ranges to suit the parameter extents of your model

The Design Framework document (Section 5) provides the full rationale for each parameter choice, which should help translate the intent to a different rig even if the specific IDs differ.

---

## Live Demo

A live instance running the full Virtua assistant (including bot backend) is available at:

**[https://virtua.nanix.dev](https://virtua.nanix.dev)**

Guest credentials for assessment/demonstration purposes are available on request (and have been included as part of the submission).

The guest account has read access to the chat interface. The Live2D avatar will cycle through states as the bot processes requests. The backend and memory systems are not included in this repository.

---

## Design Framework

The full design framework document - covering state vocabulary, parameter mappings, animation system architecture, legibility testing results (n=13 observers, 78.4% overall accuracy), transferable principles, and a log of what was tried and rejected - is included as:

[`Design_Framework.pdf`](./Design_Framework.pdf)

---

## Licence

The Live2D integration source code in this repository is released under the MIT Licence.

The **Niziiro Mao** model is not included in this repository and is subject to the [Live2D Free Material Licence Agreement](https://www.live2d.com/en/terms/live2d-free-material-license-agreement/). It is available for non-commercial use only.

The **Live2D Cubism SDK** (Core and Framework) is subject to the [Live2D Proprietary Software Licence Agreement](https://www.live2d.com/en/terms/live2d-proprietary-software-license-agreement/) and is not redistributed here.

---

## References

- Pelachaud, C. (2005). Multimodal expressive embodied conversational agents. *Proceedings of the 13th ACM International Conference on Multimedia*, 683–689.
- Yao et al. (2023). ReAct: Synergizing Reasoning and Acting in Language Models. *arXiv:2210.03629*.
- Live2D Inc. - Cubism SDK for Web: https://www.live2d.com/en/sdk/download/cubism/
