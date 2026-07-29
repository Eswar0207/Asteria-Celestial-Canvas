# Asteria Celestial Canvas (Cosmos Edition)

A state-of-the-art, browser-native collaborative whiteboard built from scratch for the Frontend R&D Assignment. 

![Asteria Cosmic Whiteboard UI Layout](./screenshot.jpg)

## Output Gallery

To make it easy to evaluate the visual interactions, here is a breakdown of key whiteboard screens:

| 1. High-Performance Space Board | 2. Inline Notes Editing | 3. Connected Element Clusters |
| :---: | :---: | :---: |
| ![Whiteboard Space Layout](./docs/initial_layout.png) | ![Editing Notes Inline](./docs/edited_note.png) | ![Shape tools active](./docs/tool_active.png) |
| Glassmorphic menus and starry canvas grid lines | Text area overlay for direct in-place editing | Interconnected note constellations and active connector arrows |

## Interactive Online Demo
Open the project locally on multiple browser tabs side-by-side to witness real-time coordination, pointer glows, fading laser pointer trails, and live cursor chat updates without any server setup!

---

## 1. Directory Structure

```directory
Asteria-Collaborative-Canvas/
├── dist/                          # Compiled production bundles
│   ├── index.html                 # Minified entry layout
│   └── assets/                    # Bundled CSS/JS modules
├── src/
│   ├── main.js                    # Canvas loop, haptic audio, sync, AI engine
│   └── style.css                  # Dark cosmic design tokens & glass overlays
├── index.html                     # HTML workspace DOM structure
├── package.json                   # Project scripts and Vite bundler dev dependencies
├── README.md                      # Technical documentation manual
└── screenshot.jpg                 # Layout output preview image
```

---

## 2. Core R&D Technical Capabilities

### ✦ Butter-Smooth 60 FPS Infinite Coordinate Space
Instead of rendering slow HTML DOM nodes, all sticky notes, sketch paths, images, and smart connector lines are drawn onto a single high-performance HTML5 Canvas using a unified `requestAnimationFrame` loop. 
*   **Coordinate Translation**: The loop applies a transformation matrix mapping global pan coordinates ($pan_x, pan_y$) and zoom factors ($scale$) relative to the mouse pointer, preventing coordinate drift.
*   **Reverse Projective Mapping**: Handlers convert viewport screen coordinates $(clientX, clientY)$ back to infinite board coordinates so that users can select, click, drag, and resize elements anywhere in the infinite canvas workspace:
    $$x_{canvas} = \frac{x_{screen} - \text{pan}_x}{\text{scale}}$$
    $$y_{canvas} = \frac{y_{screen} - \text{pan}_y}{\text{scale}}$$

### ✦ Slab-Method Raycast Box Intersection Geometry
To ensure clean visuals, connector lines between elements do not cross over shapes or text boxes; instead, they terminate precisely on the boundaries of target boxes. This is calculated using the **Liang-Barsky slab intersection geometry**:
*   **Vector Segment Ray**: The connection path is modeled as a segment running from the center coordinates of element A ($C_1$) to element B ($C_2$):
    $$R(t) = C_1 + t \cdot (C_2 - C_1) \quad \text{where} \quad t \in [0, 1]$$
*   **Axis-Aligned Bounding Box (AABB)**: We represent the target node B as a bounding box with boundaries $[x_{min}, x_{max}]$ and $[y_{min}, y_{max}]$ derived from its dimensions.
*   **Intersection Formula**: We calculate the intersection factors $t$ along each coordinate axis and resolve the collision point using:
    $$t_{near} = \max(\min(t_{xmin}, t_{xmax}),\ \min(t_{ymin}, t_{ymax}))$$
    Applying this $t_{near}$ factor back to $R(t)$ gives the exact coordinate coordinates of the intersection point where the arrowhead drawing terminates.

### ✦ Circular Viewport Mini-Map Navigation
A floating glass circular mini-map (`#miniMapContainer`) sits in the bottom-left corner.
*   **Scale Fitting**: Computes the coordinates bounding box containing all board items plus the user's viewport frame.
*   **Viewport Superimposition**: Renders a glowing neon cyan rectangle representing the user's current zoom/pan envelope.
*   **Reverse Pan-Mapping**: Click-dragging inside the mini-map reverse-translates points to center the main whiteboard panning vectors on the chosen spot instantly.

### ✦ Diagnostic Telemetry HUD Panel
A floating real-time stats card (`#telemetryHUD`) displays:
*   **FPS (Frames Per Second)**: Continuous performance delta analysis.
*   **Nodes Tracker**: Displays active board elements count.
*   **Payload Size (kB)**: Serializes canvas states to show exact JSON memory consumption in real-time.

### ✦ 3-Layer Starry Sky Background Parallax
Rather than static grids, the canvas renders three layers of stars. Moving the canvas shifts star layers by panning multipliers ($0.12$, $0.35$, $0.7$), creating depth-of-field parallax motion.

### ✦ Serverless Collaborative Synchronizations
Uses the browser's native **`BroadcastChannel` API** to broadcast operational payloads (`type: 'items-update'`, `type: 'pointer-move'`, `type: 'cursor-chat-type'`, `type: 'theme-change'`) locally. Cursors render with glowing particle trails and fading chat bubbles typing indicators.

### ✦ Native Audio Synthesizer (Zero-Asset Haptics)
Implements Web Audio API oscillators to generate audio feedback:
*   **Scribble strokes**: White noise filters.
*   **Placement pops**: Exponential sine pitch sweeps.
*   **Connector chimes**: Harmonic D5/A5 major chords.
*   **Theme pitches**: Adjusts sound multipliers based on the theme (e.g., deeper analog tones on Synthwave, higher-pitch digital ticks on Matrix).

### ✦ Companion AI Assistant & Speech Commands
*   **AI Brainstorm notes**: Deploys note clusters in circular coordinates offsets ($x = c_x + r\cos\theta, y = c_y + r\sin\theta$).
*   **Note Summarizer**: Collates Note values and renders an AI summary card.
*   **Voice Recognition Mic**: Uses native webkitSpeechRecognition to trigger tools and write notes hands-free.

---

## 3. Subsystem Architecture & Execution Lifecycles

### ✦ Architectural Data Flow (State Management)
Asteria maintains a unified client-side state object (`state` inside `src/main.js`) containing drawing tools, pan offsets, zoom parameters, peer collaborator maps, active board listings, and fading laser arrays.
*   **Transactional Commit Pipeline**: Mutations are applied through `commitItem(item)`. This inserts elements into the active board array, appends the action to the undo history stack, clears the redo buffer, and triggers a BroadcastChannel event payload transmission to sync peer sessions.
*   **Self-Healing Connected Anchors**: When a note or rectangle element is dragged, the state triggers an updates hook. It iterates all board connector elements, identifies lines linked to the dragged shape ID, updates their endpoint center calculations, and forces the drawing loop to recalculate slab intersections.

### ✦ Zero-Asset Audio Synthesis Pipeline
To keep assets loading instantaneous, Asteria contains no MP3 or WAV files. Sound triggers construct transient node graphs on the browser's Web Audio context dynamically:
*   **Noise Generator (Scribble sounds)**: Allocates an offscreen PCM audio buffer filled with random values between -1.0 and 1.0. Connects the sound buffer to a dynamic `BiquadFilterNode` modulated in a bandpass frequency sweep, feeding into a fading `GainNode` envelope to emulate real paper scribble friction.
*   **Harmonic Bell Resonance (Connection chimes)**: Spawns parallel `OscillatorNode` instances tuned to pentatonic intervals (D5/A5) with quick decay times.
*   **Theme-Based Acoustical Modulations**: The theme engine alters frequency scalars ($m$) dynamically, shifting pitch settings to reflect different workspace presets.

### ✦ BroadcastChannel Collaboration Sync Lifecycle
*   **Coordinate Broadcasting**: Pointer movements trigger coordinate broadcasts. Viewports serialize cursor position details, client name strings, and color variables.
*   **Heartbeat & Presence Control**: Synced peers register client IDs inside a mapping table. A cleanup loop sweeps the collaborator database periodically, removing visual cursors if no ping checks are received within 12 seconds.
*   **Cursor Chat Bubbles**: Pressing `/` toggles a focused overlay. Text values are broadcasted with transient timeouts that automatically fade out indicators after 5 seconds of keyboard silence.

---

## 4. Keyboard Shortcuts

- `V` Selection tool
- `P` Pen drawing
- `L` Fading Laser pointer
- `N` Sticky note placement
- `R` Constellation Rectangle shape
- `C` Smart Connection Arrow
- `/` Chat bubble to cursor
- `Ctrl + K` Command Palette overlay
- `Ctrl + Z` / `Ctrl + Shift + Z` Undo / Redo history
- `Space + Drag` or **Middle-Click Drag**: Canvas Panning
- **Mouse Wheel**: Zoom relative to cursor point

---

## 5. How to Run Locally

1.  **Install dependencies**:
    ```bash
    npm install
    ```
2.  **Start development server**:
    ```bash
    npm run dev
    ```
3.  **Compile production bundle**:
    ```bash
    npm run build
    ```

---

## 6. Suggested Submission Note

> I choose the collaborative whiteboard canvas track. Asteria Cosmos Edition demonstrates a browser-native workspace with cross-tab live cursor chats, downscaled image uploads, smart connector arrows, layers tracking, diagnostics telemetry overlay HUDs, circular mini-map viewports, synthesized sound FX haptics, voice commands recognition, and infinite coordinate zoom/pan offsets. All operations sync via BroadcastChannel and utilize client-side Web APIs for standalone deployment.


