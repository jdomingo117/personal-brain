# Halcyon HUD: Design System Specification
## A Premium Console-Inspired Visual Language for Personal Finance

Halcyon HUD is an aesthetic movement and design system that bridges high-end sci-fi gaming interfaces with the prestige and cleanliness of a premium financial application. Inspired by the iconic HUDs of *Halo 3*, *Halo 3: ODST*, and the *Master Chief Collection*, Halcyon HUD replaces standard SaaS layouts with an immersive, tactile, and responsive gaming console viewport.

---

## 1. Visual Philosophy & Core Principles

*   **Precision & Utility**: Every interface element serves a functional purpose. Financial metrics are presented like crucial combat telemetry. Thin gridlines, coordinate markers, and diagnostic brackets suggest data that is actively monitored and mission-critical.
*   **Refined Holography (Luxury Glassmorphic)**: Panels are not just boxes; they are floating holographic plates of tinted silica. The background bleeds through with a high-radius blur, while ultra-thin borders and glowing gradients convey a futuristic, premium feel.
*   **Multipolar HUD Colorways**: Information is categorized by wavelength. General operations hum in cobalt and cyan; wealth generation and savings glow in vibrant Spartan green; debts and budget warnings pulse in urgent warning amber/red; settings and configurations rest in deep ice blue.
*   **Tactile Animation**: Elements feel heavy yet responsive. Buttons pulse on interaction; cards tilt dynamically in 3D space to follow the user's cursor; screens transition kinetically within a locked viewport frame rather than sliding down a traditional webpage scroll.

---

## 2. Design Tokens (CSS Variables)

```css
:root {
  /* --- Typography --- */
  --font-header: 'Rajdhani', -apple-system, sans-serif;
  --font-mono: 'Share Tech Mono', monospace;

  /* --- Color Palette (Mixed MCC) --- */
  /* Backgrounds & Bases */
  --color-bg-base: #0a0c10;          /* Deep Space Void */
  --color-bg-panel: rgba(16, 20, 28, 0.65); /* Tinted Holographic Slate */
  --color-border-default: rgba(0, 240, 255, 0.15); /* Faint Cyan boundary */
  
  /* Functional States */
  --color-cyan-glow: #00f0ff;        /* General navigation / telemetry */
  --color-green-glow: #39ff14;       /* Savings, Investments, Income (Spartan) */
  --color-amber-glow: #ff9900;       /* Warning alerts, budget thresholds (Pelican) */
  --color-red-glow: #ff3333;         /* Over-budget, debt alerts */
  --color-blue-glow: #7df9ff;        /* Settings, profiles (Ice Blue) */

  /* Text Colors */
  --color-text-primary: #f0f4f8;     /* High-legibility technical text */
  --color-text-muted: #8a9ba8;       /* Diagnostic sub-text */
  
  /* --- Structural & Kinetic Effects --- */
  --glass-blur: blur(16px);
  --border-radius-chamfer: 6px;
  --transition-kinetic: cubic-bezier(0.19, 1, 0.22, 1); /* Rapid start, smooth settling */
}
```

---

## 3. Layout Architecture

Instead of a traditional scrolling document, Halcyon HUD enforces a **Locked Viewport View**. The browser window is treated as a monitor or helmet visor.

```
+-------------------------------------------------------------------+
|  [HUD HEADER] Spartan-117  //  NET WORTH: $124,500  //  [ONLINE]  |
+-------------------------------------------------------------------+
|  (SLIDING CHEVRON MENU)  |  [MAIN VIEWPORT CONTAINER]            |
|                          |                                       |
|  > Dashboard             |  +---------------------------------+  |
|    Income & Savings      |  | [CHAMFERED GLASS CARD]          |  |
|    Expenses              |  | Net Income: $8,450.00           |  |
|    Ingestion             |  | [||||||||||||||.......] 74%     |  |
|    Settings              |  +---------------------------------+  |
|                          |  | [3D TILTED CHART CARD]          |  |
|                          |  |                                 |  |
|                          |  |      / \   /\                   |  |
|                          |  |     /   \_/  \                  |  |
|                          |  +---------------------------------+  |
+-------------------------------------------------------------------+
|  [HUD FOOTER] SYSTEM STATE: NOMINAL   //   LATENCY: 14MS          |
+-------------------------------------------------------------------+
```

### 3.1 Fixed Viewport Frame
The root application grid is locked to `100vh` and `100vw`. Page scrolling is disabled at the window level. Instead, the main viewport shifts between states using CSS transitions inside a container.

### 3.2 Holographic Parallax Background
A persistent canvas rendering a slow-moving, wireframe 3D grid floats behind the glass cards.
- When transitioning menu states (e.g., sliding from Dashboard to Expenses), the background grid shifts rotation angles and moves on a parallax plane, giving the user a deep sense of motion.
- Floating dust particles/digital embers drift across the screen, rendering at different depths (`z-index` offsets).

---

## 4. Typography & Font Hierarchy

### Headings (Rajdhani)
*   **Weight**: Bold (700) or Medium (500)
*   **Transformation**: Uppercase
*   **Spacing**: `letter-spacing: 0.08em`
*   **Visual Accent**: Pair headings with technical prefixes (e.g. `// 01 / FINANCIAL_METRICS` or `[SYS.DASHBOARD]`).

### Numbers and Data (Share Tech Mono)
*   **Weight**: Normal (400)
*   **Transformation**: Monospace
*   **Use Cases**: Currency, transaction lists, timestamp readouts, chart tick values, percentage completion counters. Ensures alignment in tables and dynamic tickers.

---

## 5. UI Container Design: Luxury Chamfered Glass

Cards in the Halcyon design system are designed to look like high-precision, heavy-duty optical lenses.

### Key Specifications:
1.  **Backdrop Blur**: A heavy `backdrop-filter: blur(16px)` provides premium depth.
2.  **Thin Gradient Border**: A `0.75px` border that shifts from a glowing cyan (or green/amber based on state) to a transparent fade at the bottom.
3.  **Chamfered (Clipped) Corners**: Corners are clipped at a 45-degree angle to mimic physical console screens or armor plating.
4.  **Diagnostic Corner Brackets**: Small absolute-positioned crosshairs `+` or brackets `[ ]` in the corners of active cards to ground the gaming aesthetic.

### CSS Implementation:
```css
.chamfer-card {
  position: relative;
  background: var(--color-bg-panel);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  color: var(--color-text-primary);
  font-family: var(--font-header);
  padding: 1.5rem;
  
  /* Chamfered corners via CSS clip-path */
  clip-path: polygon(
    12px 0%, 
    100% 0%, 
    100% calc(100% - 12px), 
    calc(100% - 12px) 100%, 
    0% 100%, 
    0% 12px
  );
  
  border: 1px solid var(--color-border-default);
  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
  transition: border-color 0.25s var(--transition-kinetic),
              box-shadow 0.25s var(--transition-kinetic);
}

.chamfer-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  pointer-events: none;
  background: linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0) 100%);
}

.chamfer-card:hover {
  border-color: rgba(0, 240, 255, 0.4);
  box-shadow: 0 8px 32px 0 rgba(0, 240, 255, 0.08),
              inset 0 0 12px rgba(0, 240, 255, 0.03);
}
```

---

## 6. Interactive Behaviors & Animations

### 6.1 Hologram 3D Tilt (Vanilla JS)
Hovering over a card tilts it slightly towards the cursor, giving the illusion of a physically suspended holographic panel.

```javascript
// Simple, high-performance mouse parallax for cards
const cards = document.querySelectorAll('.tilted-card');

cards.forEach(card => {
  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const xc = rect.width / 2;
    const yc = rect.height / 2;
    
    // Max tilt angle = 8 degrees for premium restraint
    const angleX = (yc - y) / yc * 8; 
    const angleY = (x - xc) / xc * 8;
    
    card.style.transform = `perspective(1000px) rotateX(${angleX}deg) rotateY(${angleY}deg) scale3d(1.02, 1.02, 1.02)`;
  });
  
  card.addEventListener('mouseleave', () => {
    card.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
  });
});
```

### 6.2 HUD Scanline / Boot Sweep
When a panel loads, a fast horizontal laser-line sweeps down the container, revealing contents.

```css
@keyframes hud-sweep {
  0% { top: 0%; opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { top: 100%; opacity: 0; }
}

.scanline-reveal::after {
  content: '';
  position: absolute;
  left: 0;
  width: 100%;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--color-cyan-glow), transparent);
  box-shadow: 0 0 8px var(--color-cyan-glow);
  animation: hud-sweep 1.2s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
  pointer-events: none;
}
```

### 6.3 Sliding Chevron Selector
Menu items use a sliding glow-chevron selector.
- When hovering/focusing over a menu option, a neon chevron `>` slides from the left, shifting the menu text slightly to the right.
- On click, a quick neon white flash passes through the text.

```css
.hud-menu-item {
  position: relative;
  font-family: var(--font-header);
  font-size: 1.25rem;
  letter-spacing: 0.05em;
  padding-left: 1.5rem;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: color 0.2s var(--transition-kinetic), 
              transform 0.2s var(--transition-kinetic);
}

.hud-menu-item::before {
  content: '>';
  position: absolute;
  left: 0;
  opacity: 0;
  transform: translateX(-10px);
  color: var(--color-cyan-glow);
  text-shadow: 0 0 5px var(--color-cyan-glow);
  transition: opacity 0.2s var(--transition-kinetic),
              transform 0.2s var(--transition-kinetic);
}

.hud-menu-item:hover,
.hud-menu-item.active {
  color: var(--color-text-primary);
  transform: translateX(6px);
}

.hud-menu-item:hover::before,
.hud-menu-item.active::before {
  opacity: 1;
  transform: translateX(0);
}
```

---

## 7. Gamified Financial Components

### 7.1 The MJOLNIR Shield Recharge Bar (Budget Tracker)
Rather than a standard progress bar, budgets are tracked via a segmented energy meter.
- **Full Shield (Green)**: Budget is healthy (under 60% spent). The bar segments glow green and display a soft ambient hum.
- **Damaged Shield (Yellow/Amber)**: Budget is approaching limit (60%-90% spent). The bars blink slowly.
- **Shield Critical Depleted (Red)**: Over budget (>90% spent). The shield bar flashes rapidly in warning red, mimicking a Spartan shield recharge alert.

```html
<!-- Budget Shield Level -->
<div class="shield-meter-wrapper">
  <div class="shield-label-row">
    <span class="shield-title">BUDGET SHIELD // OVERALL OUTLAYS</span>
    <span class="shield-percentage font-mono">78% NOMINAL</span>
  </div>
  <div class="shield-grid" data-shield-status="warning">
    <!-- Active segments -->
    <div class="shield-segment active"></div>
    <div class="shield-segment active"></div>
    <div class="shield-segment active"></div>
    <div class="shield-segment active"></div>
    <div class="shield-segment active"></div>
    <div class="shield-segment active"></div>
    <div class="shield-segment active"></div>
    <!-- Inactive / Depleted segments -->
    <div class="shield-segment"></div>
    <div class="shield-segment"></div>
    <div class="shield-segment"></div>
  </div>
</div>
```

```css
.shield-grid {
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: 4px;
  height: 14px;
  margin-top: 8px;
}

.shield-segment {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: background-color 0.3s ease;
}

/* Color States mapping to game HUD shields */
.shield-grid[data-shield-status="healthy"] .shield-segment.active {
  background-color: var(--color-green-glow);
  box-shadow: 0 0 6px var(--color-green-glow);
}

.shield-grid[data-shield-status="warning"] .shield-segment.active {
  background-color: var(--color-amber-glow);
  box-shadow: 0 0 6px var(--color-amber-glow);
  animation: warning-pulse 1.5s infinite alternate;
}

.shield-grid[data-shield-status="critical"] .shield-segment.active {
  background-color: var(--color-red-glow);
  box-shadow: 0 0 8px var(--color-red-glow);
  animation: critical-flash 0.5s infinite alternate;
}

@keyframes warning-pulse {
  0% { opacity: 0.6; }
  100% { opacity: 1; }
}

@keyframes critical-flash {
  0% { opacity: 0.3; }
  100% { opacity: 1; }
}
```

### 7.2 Spartan Rank (Financial Milestones)
The user's net worth or monthly savings rate is tied to a military-style rank indicator. 
- Level milestones are updated inside a premium badge container.
- Ranks: `Recruit` -> `Specialist` -> `Sergeant` -> `Lieutenant` -> `Commander` -> `Noble Spartan`.
- A small progress ticker shows the "XP to Next Rank" (e.g., `$2,450 till Commander level`).

### 7.3 Halo Achievement Unlocks
When a major goal is met (e.g., paying off a credit card, maxing out an IRA, hitting a 3-month emergency fund), a toast notification animates onto the screen mimicking the classic Xbox/Halo banner.
- **Animation**: Slides down from the top center.
- **Sound**: Visual representation of the famous chime with a circular glowing icon pulsing outwards.
- **Style**: Black satin background, gold border, and gold text showing:
  `ACHIEVEMENT UNLOCKED`
  `Debt-Free Specialist - 100G`

---

## 8. UX Guidelines & Accessibility Rules

To ensure the app maintains a **luxury** feel and doesn't devolve into a cluttered gaming mockup, the following rules must be enforced:

1.  **Strict Contrast Control**: Neon glowing text on a dark background must meet a minimum `4.5:1` contrast ratio. Use solid white or light-grey (`#f0f4f8`) for primary body text, reserving the neon cyan/green/orange colorways *strictly* for active outlines, highlights, charts, and system status tags.
2.  **No Emoji Icons**: All icons must be unified geometric SVGs (e.g., from Lucide or custom HUD vectors). Emojis are strictly banned from the layout to prevent breaking the high-precision cinematic tone.
3.  **Mouse-Interaction Stability**: Cards tilting in 3D must not alter their physical dimensions or push adjacent grid elements. The tilt is applied via absolute visual transform scaling (`scale3d(1.02, 1.02, 1.02)`), leaving layout dimensions untouched.
4.  **Graceful Accessibility Off-switch**: Users who prefer static, non-moving layouts must be able to toggle "HUD Motion Effects" off. The CSS must respect the `@media (prefers-reduced-motion)` query:
    ```css
    @media (prefers-reduced-motion: reduce) {
      .chamfer-card:hover, .tilted-card {
        transform: none !important;
        transition: none !important;
      }
      .scanline-reveal::after {
        display: none !important;
      }
    }
    ```
5.  **Touch Target Size**: On mobile or touch devices, interactive button HUD cards must hold a minimum tap surface of `44px x 44px`.

---

## 9. Conceptual DNA (Halo 3 / ODST Menu Soul)

The "Soul" of the menu navigation is kinetic weight. The user is not reading a webpage; they are operating a ship console or tactical helmet. The subtle lines, background parallax, and scanlines anchor the user in a continuous virtual space. The primary goal is to make managing finance feel like navigating a high-stakes tactical simulation. Every dollar allocated is a round loaded, and every debt resolved is an objective cleared.
