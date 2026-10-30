# 🎧 Zen ASMR Lab — YouTube Playable

> An ultra-satisfying, high-fidelity ASMR sensory playground engineered specifically for **YouTube Playables**. Features 5 viral ASMR activities, procedural Web Audio binaural sound synthesis (left/right ear tingles), and full compliance with YouTube Playables SDK standards.

---

## 🌟 Features & ASMR Stations

### 1. 🔪 Kinetic Sand & Soap Slicer 3D
- **Visuals:** 2.5D layered blocks of kinetic sand, honeycomb soap, galaxy cake, and matcha cream. Interactive blade dynamically tilts with swipe angle, casting soft drop shadows.
- **Physics:** Sliced voxels detach into physics particles that tumble, bounce, and settle.
- **Audio:** High-frequency crispy micro-crackles and shaving friction with binaural stereo panning based on horizontal slice position.

### 2. 🍑 Squishy Jelly & Slime Lab
- **Visuals:** Organic soft-body spring mesh with Bezier curve smoothing, specular wet highlights, translucent gradient depth, and floating internal toppings (peaches, glitter, stars).
- **Physics:** Spring-damper perimeter nodes deform under finger/cursor pressure, creating realistic wobble, stretch, and inertia.
- **Audio:** Bubbly FM-synthesized squelch and plop sounds, with micro-bubble bursts on stretch and release.

### 3. 💖 Mega Silicone Pop-It & Infinite Bubble Wrap
- **Visuals:** Neumorphic 3D silicone pads (Rainbow Heart, Gamepad, Hexagon) and Infinite Bubble Wrap. 3D convex unpopped domes flip into recessed concave depressions with realistic shadows.
- **Mechanics:** Tap or swipe across bubbles to pop. Supports multi-touch! Features an auto-flip wave button and confetti celebration when all bubbles are popped.
- **Audio:** Dual-oscillator acoustic thump (sub-bass punch + snappy silicone ring) tuned across a musical scale.

### 4. 💥 Hydraulic Press Crusher
- **Visuals:** Polished steel hydraulic piston, cast iron anvil, and dynamic pressure dial gauge (0–100 Tons). Crushable objects include Rainbow Bath Bombs, Honeycomb, Amethyst Geodes, and Pastel Chalk.
- **Mechanics:** Drag the piston down to apply tons of pressure. Watch the object squash, develop progressive hairline stress fractures, and explosively shatter!
- **Audio:** Mechanical groaning friction and strain clicks that build up into an epic sub-bass boom, crunchy fracture burst, and ringing crystal sparkles.

### 5. 🔔 Zen Pentatonic Chime Spiral & Glass Marbles
- **Visuals:** Cascading tuned wooden xylophone bars and crystal chime bells. Marbles bounce with realistic trajectory reflections and radiant soundwave ripple rings.
- **Mechanics:** Tap to drop marbles or toggle "Auto Marbles" for continuous relaxation.
- **Audio:** Authentic acoustic bell partials tuned to the pentatonic scale ($C_4, D_4, E_4, G_4, A_4, C_5, D_5, E_5$) for a melodic, stress-relieving ambient song.

---

## 👂 Audio Architecture ("Sounds Good to Ear")

- **Zero-Latency Web Audio API:** Completely procedural audio synthesis with **0 external audio files to download**, guaranteeing instant loading and zero missing asset bugs.
- **Binaural 3D Stereo Panning:** Sound position dynamically maps screen X coordinates to stereo pan ($-1.0$ left ear to $+1.0$ right ear). Listening with headphones produces an intimate ASMR tingle sensation.
- **Velvety Master Dynamics Compressor:** Softens harsh high frequencies to deliver warm, soothing acoustics.
- **Ambient Rain Soundscape:** Toggleable pink noise warm summer rain sound for background relaxation.

---

## 📺 YouTube Playables Compliance & SDK Integration

This game complies strictly with the official **YouTube Playables SDK** specifications:

| Requirement | Implementation in Zen ASMR Lab |
| :--- | :--- |
| **SDK Injection** | Synchronous `<script src="https://www.youtube.com/game_api/v1"></script>` in `<head>` before game code. |
| **First Frame** | `ytgame.game.firstFrameReady()` triggered as soon as the interface mounts. |
| **Game Ready** | `ytgame.game.gameReady()` called once canvas context and stations are interactive. |
| **Audio Sync** | Listens to `ytgame.system.onAudioEnabledChange()` and checks `ytgame.system.isAudioEnabled()` to mute/unmute game audio with the YouTube shell. |
| **Pause / Resume** | Implements `ytgame.system.onPause()` and `ytgame.system.onResume()` to pause animations and mute audio when unfocused. |
| **Cloud Save** | Serializes player rank and satisfaction score using `ytgame.game.saveData()` and `ytgame.game.loadData()`. |
| **Local Fallback** | Safe mock adapter in `js/yt-sdk.js` allows seamless testing in standard browsers with `localStorage` fallback. |
| **Strict Network Policy** | **Zero external CDN libraries at runtime**. All code, shaders, physics, and sounds are 100% self-contained. |
| **Responsive Viewports** | Adapts dynamically to 9:16 (YouTube Shorts / Mobile App), 1:1 square, and 16:9 desktop widescreen. |
| **Input Parity** | Flawless touch, multi-touch, and mouse support with mobile haptic feedback (`navigator.vibrate`). |

---

## 🚀 How to Run & Test Locally

You can run the game with Python's built-in web server:

```bash
# In the project root directory:
python -m http.server 8080
```

Then open your browser at:
```
http://localhost:8080
```

---

## 📦 Packaging for YouTube Playables Developer Portal

To submit the game to YouTube Playables:
1. Ensure all files in the root directory are included (`index.html`, `style.css`, `js/` directory).
2. Zip the contents directly into a single archive (ensure `index.html` is at the root of the `.zip`).
3. Upload the `.zip` archive to the YouTube Playables Developer Portal.

