# FitCoach AI — UI Analysis (for the rebuild)

Goal: one **mobile-first web app** (PWA) that people open in their phone's browser, with no app store.
The Expo app in `mobile/` is treated as a **feature reference only**. Everything ships from `web/`.

---

## 1. Current state at a glance

| | `web/` (keep) | `mobile/` (retire) |
| --- | --- | --- |
| Stack | React 18 + Vite + React Router 6, plain CSS (`styles.css`, ~1.2k lines) | Expo 57 / React Native, inline `StyleSheet` |
| Roles | Athlete, Gym manager, Admin | Athlete only (managers/admins get a WebView of the site) |
| Languages | FR + AR (RTL) | FR + AR (RTL) |
| Mobile layout | Sidebar → topbar + bottom tab bar under 820px | Native tabs |
| PWA | **No** (no manifest, no service worker, no install icon) | — |

**Main gap:** the **Meals / nutrition** feature (macro rings, meal photo scan, daily targets, evening alert) exists **only in mobile**. The web app has to gain it.

---

## 2. Screen inventory

### Public
| Route | Screen | Notes |
| --- | --- | --- |
| `/connexion` | Login | email + password, language switch |
| `/inscription` | Register | sends an email code |
| `/verification` | Verify email | 6-digit code |
| `/mot-de-passe-oublie` | Forgot password | code + new password |

### Athlete (`/app`), the main phone audience
| Route | Screen | Key UI |
| --- | --- | --- |
| `/app` | Home | greeting, subscription warning, "complete profile" / "no program" cards, **today's session card** (Start / Quick 30 min / Resume), week strip, live gym occupancy + check-in, report a breakdown |
| `/app/programme` | Program | generate (AI or rules), list of days → exercises |
| `/app/seance/:id` | **Session** (largest screen, 359 lines) | exercise cards, sets/reps entry, **Busy / Missing / Broken** buttons → 3 alternatives modal, "I'll wait" (postpone), finish/abandon |
| `/app/exercice/:id` | Exercise sheet | video/image, muscles, instructions |
| `/app/coach` | Coach chat | AI messages (FR/AR/derja) |
| `/app/progression` | Progress | charts (`Charts.jsx`) |
| `/app/profil` | Profile | body data, goal, level, injuries, gym, photo |
| `/app/panne` | Report machine | pick a machine + description |
| *(missing)* `/app/repas` | **Meals** | to port from `mobile/src/screens/MealsScreen.js` + `NutritionStats.js` |

### Manager (`/gerant`), mostly used on desktop/tablet
Dashboard (stats) · Members · Machines · Breakdown reports · Gym settings

### Admin (`/admin`), desktop
Dashboard · Gyms · Machines · Exercises library (largest admin screen) · Users

---

## 3. Design system today

- **Colors** (shared web/mobile): bg `#EEF2F1`, ink `#16232B`, brand teal `#1F6F78`, signal yellow `#F2B705` (= machine unavailable), danger `#C2410C`, ok `#2F855A`. Each has a `-soft` tint.
- **Fonts:** Barlow Condensed (headings), IBM Plex Sans Arabic (body + Arabic).
- **Components** (`components/ui.jsx`): `panel`, `btn` / `btn-ghost` / `btn-small`, `badge` (ok/warn/danger), `field`, `modal`, `toast`, `spinner`, `stat`.
- **Icons:** hand-written SVG paths in `Shell.jsx`, plus some emoji (🔒 📷 🍽 💡).
- **Radius:** 14 / 10 / 7px.

---

## 4. UI problems to fix in the rebuild

1. **Not installable.** No `manifest.webmanifest`, icons, or service worker, so users can't "Add to Home Screen" as a full-screen app.
2. **Desktop-first CSS.** The phone layout is added with `max-width` overrides (4 different breakpoints: 600/820/900px). Rebuild mobile-first with `min-width`.
3. **Bottom tab bar** scrolls horizontally (`overflow-x: auto`) and has no `env(safe-area-inset-bottom)` padding, so it sits under the iPhone home bar. Keep it to max 5 tabs.
4. **Header actions crammed.** The topbar holds language + password + logout. Move these into Profile/settings.
5. **Inline styles everywhere** (`style={{ color: '#fff', borderColor: ... }}` repeated in Shell, Session). Use tokens/variants instead.
6. **Emoji as icons.** They look inconsistent across phones. Use one icon set (e.g. Lucide).
7. **Session screen is overloaded.** Sets entry, substitution, and postpone all sit on one long page. On a phone it should show **one exercise at a time** with big tap targets (≥ 44px) and a sticky bottom action bar.
8. **No dark mode** (people train in dim gyms).
9. **Hand-written i18n file is huge** (`locales.js` 781 lines, duplicated in mobile). Keep one source and split it by page.
10. **Native-only features need web equivalents:**
    | Mobile feature | Web replacement |
    | --- | --- |
    | Camera meal scan (`expo-image-picker`) | `<input type="file" accept="image/*" capture="environment">` |
    | Meal reminders (`expo-notifications`) | Web Push via service worker (Android OK; iOS only once installed to the home screen, iOS 16.4+) |
    | AsyncStorage token | `localStorage` (already done on web) |
    | Android back button | browser history (React Router already handles it) |

---

## 5. Recommended rebuild plan (UI only)

**Stack:** keep React + Vite + React Router. Add:
- `vite-plugin-pwa` → manifest, icons, offline shell, install prompt
- Tailwind CSS (with `rtl:` variants) or CSS variables + a small component kit
- Lucide icons
- Optional: Recharts for progress/nutrition charts

**Athlete navigation (bottom bar, 5 tabs):**
`Home · Program · Meals · Coach · Profile`.
Progress moves inside Profile (or Home). Session and Exercise open full-screen over the tabs.

**Phone layout rules:**
- `viewport-fit=cover` + safe-area padding top/bottom
- Sticky bottom primary button on Session, Meals, and forms
- Bottom sheets instead of centered modals (alternatives picker, add meal)
- Skeleton loaders instead of a spinner
- Dark mode with `prefers-color-scheme` + a toggle
- RTL: use logical CSS properties (`margin-inline-start`, `padding-inline`) so Arabic works without hacks

**Priority order:**
1. PWA shell + bottom nav + design tokens (light/dark)
2. Login / Register / Verify (first impression)
3. Home + **Session** (core value: machine substitution)
4. **Meals** (ported from mobile)
5. Program, Coach, Progress, Profile
6. Manager + Admin. Keep them desktop-friendly with responsive tables → cards on phones.

**Then:** delete `mobile/` (or archive it) once the PWA has full feature parity.
