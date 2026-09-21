# Gunny · Chibi Arena — Product & Design Audit (Steve Jobs Persona Review)

Date: 2026-09-21  
Auditor Persona: Steve Jobs (Ruthless Taste, Simplicity, Craft, Market Leadership)  
Product Vision: **Industry-Leading Turn-Based Artillery MMO-Lite on the Open Web**

---

## The Verdict: Good Plumbing. No Soul.

> *"Most people make the mistake of thinking design is what it looks like. People think it’s this veneer — that the designers are handed this box and told, 'Make it look good!' That’s not what we think design is. It’s not just what it looks like and feels like. Design is how it works."*

Look at what you have built:
- **150 passing tests** in under 5 seconds.
- Deterministic 120 Hz fixed-step physics engine with crater deformation, terrain collisions, wind drift, and fall damage.
- Full server-authoritative netcode with reconnect token handshakes, sequence validation, snapshot interpolation, and lag compensation.
- Security-hardened admin RBAC, chat filtering, rate limiters, and PostgreSQL-ready schema migrations.

**From an engineering perspective, you built a remarkably solid transmission and engine.**  
**From a player perspective, you built a tech demo with programmer art.**

If your goal is to be **"a game that leads in its industry"** (surpassing modern Worms, ShellShock Live, and nostalgic Gunbound/Gunny), you cannot ship an engineering toy. Players don't launch a game to admire server state machines. They play to feel powerful, challenged, thrilled, and visually mesmerized.

---

## Core Product Positioning (Post-Grill Decisions)

Following our detailed design grill session, the game's direction is codified around five pillars:

1. **Category Identity**: **Deep Progression MMO-Lite**
   - Combines the instant reflex thrill of artillery shooting with long-term progression: co-op PvE dungeons, multi-phase boss raids, gear crafting, pet companions, and an expressive vanity wardrobe.
2. **Competitive Integrity**: **Stat-Normalized PvP with PvE-Only Gear Power**
   - PvP remains 100% skill-based (angles, wind math, delay tactics, terrain manipulation). All players enter PvP arenas with strictly normalized base stats.
   - Gear enhancements (+1 to +12), gem sockets, and raid boss weapons unleash their power exclusively in PvE dungeons and boss raids.
3. **Co-Op Boss Encounters**: **Multi-Phase Raids with Shifting Weak Points**
   - 2–4 player co-op raids featuring gigantic animated bosses with destructible armor plates, telegraphed ground hazard attacks, airborne adds, and enrage timers.
4. **Architecture**: **Zero-Install Web-First PWA (< 5MB initial load)**
   - Instant loading in desktop and mobile browsers (iOS Safari, Android Chrome). No app store gatekeeper, no 2GB download.
   - Canvas/WebGL rendering pipeline with progressive asset streaming.
5. **Fair Economy**: **Gold-Driven Battle Pass & Vanity Wardrobe**
   - Battle Pass, dungeon keys, cosmetic costumes, weapon skins, and titles are purchasable and unlocked using **in-game gold** earned through active gameplay, achievements, and raid victories. Zero pay-to-win.

---

## 1. The Visual & Audio Senses (Game "Juice" & Immersion)

### A. Screen Shake, Impact & Weight (Zero Game Feel)
* **Current State:** When a projectile explodes, the ground gets a circular crater cutout and a plain HP number floats up.
* **Why it fails:** No kinetic energy. A bazooka or lightning strike should make the player's teeth rattle.
* **What leadership requires:**
  * **Screen shake (Trauma-based camera impulse):** Directional shake proportional to explosive blast radius.
  * **Particle pyrotechnics:** Dynamic sparks, debris chunks flying off craters with gravity, lingering smoke trails from missiles, heat distortion.
  * **Hit stop / Micro-pause:** A 20–40ms frame freeze on direct critical hits to register sheer impact before ragdoll or crater explosion.

### B. Sound & Haptics (A Mute World)
* **Current State:** Rudimentary synth beeps or silence.
* **What leadership requires:**
  * Punchy compressed sound effects, sub-bass rumble on detonations, dynamic pitch-shifting on wind changes, whistling artillery shells descending from high arcs, and visceral countdown heartbeats when turn timers tick under 3 seconds.

### C. Art Style & Cohesion
* **Current State:** Flat 2D geometric canvas arcs, placeholder chibi sprites with minimal animation frames, generic UI cards.
* **What leadership requires:**
  * Multi-layer parallax environmental backdrops with weather effects (drifting cherry blossoms, driving rain, heat haze).
  * Expressive animated chibi characters (idle breathing, aiming recoil, triumph dance, panic when low on HP).

---

## 2. Core Game Mechanics & Tactical Depth

### A. Dynamic & Destructible Tactical Depth
* **Current State:** Static terrain with basic circular crater subtraction.
* **What leadership requires:**
  * **Interactive Environmental Hazards:** Explosive barrels that trigger chain reactions, crumbling bridges, rising water/acid basins (bungee/drowning mechanics), bouncy trampolines, lightning rods.
  * **Wind as an Emotion:** Visible atmospheric wind indicators (drifting leaves, swaying grass, fluttering flags) instead of just an abstract number on the HUD.

### B. Strategic Delay & Item System
* **Current State:** Simple delay counter.
* **What leadership requires:**
  * Rich strategic items (Dual Shot, Armor Piercer, Teleport Dart, Shield Barrier, Guidance Beacon) with clear delay penalties, allowing high-IQ tactical combos.

---

## 3. The Meta-Game & Progression (The MMO-Lite Loop)

### A. The Onboarding Hook (< 30 Seconds to Fun)
* **Rule:** A player clicking a link from a friend or an ad must be in a live match blasting something in **under 30 seconds**. Zero friction. Instant guest mode, instant zero-latency tutorial with satisfying instant gratification.

### B. PvE Dungeon & Raid Architecture
* Dedicated PvE match runner supporting cooperative encounters against boss entities with multi-phase action queues, weak point hitboxes, and loot tables.

### C. Vanity Wardrobe & In-Game Economy
* Full paperdoll avatar customizer: Hair, Hats, Glasses, Outfits, Weapon Skins, and Footprint Tracers.
* In-game gold reward loop for daily quests, clean dungeon clears, and ranked PvP victories.

---

## Strategic Roadmap to Industry Leadership

| Phase | Milestone | Focus Area | Key Deliverable |
|---|---|---|---|
| **Phase 1** | **Feel & Juice (Tactile Delight)** | Combat Polish | Screen shake (trauma system), particle VFX (sparks/smoke/debris), impact frames, Web Audio engine, dynamic wind visualization. |
| **Phase 2** | **Visual Identity & Atmosphere** | Art & Immersion | Multi-layer parallax environmental backdrops, animated chibi sprite states, modern sleek HUD. |
| **Phase 3** | **PvE Co-Op Boss Raids** | MMO-Lite Core | Boss state machine with weak points, telegraphed AOE zones, 2-4 player co-op room loop, dungeon reward loot drops. |
| **Phase 4** | **Progression, Wardrobe & Gold Shop** | Retention | Inventory system, gear enhancement for PvE (+1 to +12), gold-based Battle Pass and cosmetic vanity wardrobe. |
| **Phase 5** | **Ranked League & Social Network** | Community | Ranked MMR ladder with seasonal tiers, party lobbies, instant replay link sharing, spectator lounge. |

