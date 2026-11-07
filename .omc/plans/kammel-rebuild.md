# Kammel rebuild — shared plan (source of truth for every agent)

Design export (read-only reference): `C:/Users/DELL/AppData/Local/Temp/claude/c--FitCoach/b19f6ae7-7b1b-4ac2-ab05-6ca7f83be881/scratchpad/design/`
Rendered screenshots: `.../scratchpad/shots/athlete/*.png` (athlete app FR + AR), `.../scratchpad/shots/admin/*.png` (gym back-office desktop D* + phone M*).
Screen text dumps: `.../scratchpad/shots/admin.txt`. Brief: `.../scratchpad/design/uploads/kammel-design-prompt.md`.

## Product
FitCoach AI is renamed **Kammel** (كمّل). One web app (`web/`, React 18 + Vite 5 + React Router 6), installable as a PWA,
mobile-first for athletes, desktop + phone for gym staff. Backend `backend/` (Express 4 + Sequelize 6 + MySQL/MariaDB).
`mobile/` (Expo) is frozen and no longer maintained — do not edit it.

Languages FR (default), AR (RTL, Tunisian flavour as in the design), EN. Dark theme by default; light + system available.

## Roles
| Role | Who | Home |
| --- | --- | --- |
| SPORTIF | gym member, logs in with **phone number** | `/app` |
| GERANT | gym manager, all gym permissions | `/salle` |
| ACCUEIL | reception: members, payments, entries | `/salle` |
| TECHNICIEN | machines + breakdowns | `/salle` |
| COACH | exercises, programs, nutrition, coach settings | `/salle` |
| ADMIN | Kammel platform admin (all gyms, exercise catalogue) | `/admin` |

Permission matrix lives in `backend/src/services/permissions.js` and is mirrored in `web/src/lib/permissions.js`.
Server-side checks are mandatory; the client copy only hides navigation.

## Account rules (security decisions)
- Members never self-register. Reception creates the member (name, phone, plan, payment). The server generates a
  **random temporary password** (8 chars, no ambiguous chars), returns it **once** to the staff screen, stores only the bcrypt hash,
  sets `mustChangePassword=true` and `tempPasswordExpiresAt = now + 7 days`. (The design's universal `12345678` is a security hole and is NOT used.)
- First login with a temporary password → every API route except `GET /api/auth/me`, `POST /api/auth/first-password`, `POST /api/auth/logout`
  answers `403 PASSWORD_CHANGE_REQUIRED`.
- Forgotten password: members ask reception (`POST /api/staff/members/:id/reset-password` → new temporary password). Staff/admin use the e-mail code flow.
- Staff accounts are created by the gérant (Team screen) the same way (temporary password, must change). Gyms + first gérant are created by ADMIN.
- Password policy: ≥ 8 chars, at least one letter and one digit, not in the common-password list, different from the temporary one.
- Login: `POST /api/auth/login { identifier, password }` — identifier = phone (members) or e-mail (staff). 5 failed attempts → account locked 15 min; per-IP rate limit too. Generic error message (no account enumeration).
- Session = JWT (HS256, `iss=kammel`, 7 days) in an **httpOnly, SameSite=Strict cookie** `kammel_session` (Secure in production). No token in JS/localStorage.
  JWT carries `{ sub, tv }`; every request reloads the user and rejects if inactive, deleted, or `tokenVersion` changed (password change, logout-all, deactivation, role change → `tokenVersion++`).
- CSRF: state-changing requests must send header `X-Requested-With: kammel` (cross-site forms cannot) and, when present, `Origin` must be allowed.
- Health data (weight, injuries, goal…) visible to the member, GERANT and COACH only — not ACCUEIL/TECHNICIEN.
- Every staff action on members, payments, plans, team, settings is written to `AuditLog` with the actor.

## Data model (backend/src/models/index.js)
User, Gym (+settings JSON, hours JSON, capacity), Equipment, Machine (code, zone, status OK|SIGNALEE|REPARATION, outOfService, lastMaintenanceAt),
Exercise (+alternativeIds, defaultSets), Program (+weeks, startedAt), ProgramItem, ProgramTemplate, WorkoutSession (+rating, quick), SessionEntry,
Report (issueType, status NOUVEAU|VU|REPARATION|REPAREE|REJETE, notify, assignedToId, internalNote, photo blob, timestamps),
Plan, Subscription (+planId, frozenFrom, frozenUntil, freezeDaysUsed, createdById), Payment, CashSession, CheckIn (+status ENTREE|REFUSEE, refusalReason, source, byStaffId),
ChatMessage (+proposal JSON, proposalState), NutritionTarget (+waterMl, maintenance), Meal (+mealType, quantity, foodId), Food, WaterLog,
Notification, Campaign, AuditLog, EmailCode.
See the file for exact fields. Gym settings defaults: `backend/src/services/gymSettings.js`.

## Calculations (backend/src/services/targets.js — pure, unit-tested)
- BMR Mifflin-St Jeor: 10·kg + 6.25·cm − 5·age + (H: +5, F: −161, NA: −78)
- TDEE = BMR × activity (SEDENTAIRE 1.2, LEGER 1.375, ACTIF 1.55, TRES_ACTIF 1.725) → maintenance
- Target: PERTE_POIDS −500, PRISE_MASSE +300, FORME/FORCE 0
- Macros (% kcal): EQUILIBRE 30/45/25, PROTEINES 35/40/25, LOW_CARB 35/25/40, VEGETARIEN 25/50/25 (protein/carbs/fat; g = kcal/4 or /9)
- Water: 33 ml × kg + 10 ml × planned session minutes on training days (+500 hot day ≥30 °C, +750 ≥35 °C), rounded to 50 ml, clamped 1500–4000; manual override in prefs.
- BMI = kg / m²; healthy range 18.5–24.9; timeline = |kg to change| / 0.5 kg per week.
- Reference example (must hold in tests): male, 32 y, 175 cm, 85 kg, SEDENTAIRE, PERTE_POIDS, EQUILIBRE, 4×60 min
  → maintenance 2147, target 1647, P 124 g / C 185 g / F 46 g, water 3400 ml on training days, BMI 27.8, healthy 56.7–76.3 kg.

## API surface (all JSON, prefix /api)
Public: `GET /health`, `GET /meta`, `POST /auth/login`, `POST /auth/logout`, `POST /auth/forgot-password`, `POST /auth/reset-password`.
Auth: `GET /auth/me`, `POST /auth/first-password`.
Athlete (`SPORTIF`): `/me/*` (profile, onboarding, prefs, password, subscription, payments, access-pass, reports, notifications, export, delete),
`/gym/*` (own gym: live occupancy, machines), `/exercises/*`, `/programs/*`, `/sessions/*`, `/progress/*`, `/coach/*`, `/nutrition/*` (day, stats, meals, water, foods, analyze).
Staff (`GERANT|ACCUEIL|TECHNICIEN|COACH`, scoped to `req.user.gymId`): `/staff/*` — dashboard, live, checkins (scan), members, plans, payments, cash,
machines, reports (pannes), team, settings, campaigns/notifications, stats, exercises (read + gym alternatives), program-templates, foods, coach (settings + analytics), audit.
Admin (`ADMIN`): `/admin/*` (gyms + first gérant, machines/identify, equipment, exercises, users, stats).

Errors: `{ code, message }` with HTTP status. Codes are translated client-side (`err.CODE` keys), message is French fallback.

## Frontend conventions (web/src)
- `styles/tokens.css` (design tokens, dark default + light), `styles/base.css`, `styles/components.css`. Use classes + CSS variables; no hex colours in JSX.
- Components: `components/` (Icon, Button, Card, Chip, Field, Sheet, Toast, Skeleton, Ring, Gauge, Bars, Toggle, Segmented, Avatar, Status, Empty…). Reuse them.
- Icons: `<Icon name="dumbbell" />` from the Lucide data copied from the design (`components/icons-data.js`).
- i18n: every feature folder owns a `strings.js` exporting `{ fr: {...}, ar: {...}, en: {...} }` with keys prefixed by the feature (`home.`, `session.`…).
  They are merged automatically (`import.meta.glob`). `useI18n()` gives `t, lang, dir, fmt` helpers.
- API: `import { api } from '@/lib/api'` — `api.get(path)`, `api.post(path, body)`, `api.put`, `api.patch`, `api.del`. Cookie auth, CSRF header added automatically.
- Layouts: `AthleteLayout` (bottom tab bar Home · Training · Meals · Coach · Account), `StaffLayout` (sidebar desktop / bottom tabs phone), `AuthLayout`.
- Session + Gym live screens are always dark (`data-theme="dark"` on the screen root).
- Every data screen handles loading (skeleton), empty, error (with retry) and offline where relevant.
