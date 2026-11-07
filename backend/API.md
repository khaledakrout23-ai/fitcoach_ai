# API Kammel

The backend serves JSON under `/api`. Express 4 + Sequelize 6 + MySQL/MariaDB.
Every screen of the web app (`web/`) is built from this file.

## General rules

| Topic | Rule |
| --- | --- |
| Session | The `kammel_session` cookie is httpOnly, SameSite=Strict, `Path=/api`, 7 days. It is set by `POST /auth/login` and `POST /auth/first-password`, and sliding (renewed after 1 day). Calls use `credentials: 'include'`. No token is ever exposed to JS. |
| CSRF | Every `POST/PUT/PATCH/DELETE` must send the header `X-Requested-With: kammel`. Otherwise you get `403 CSRF`. A foreign `Origin` is also refused. |
| Errors | `{ "code": "UPPER_SNAKE", "message": "Message en français", "details"?: any }` with the HTTP status. The client translates `err.CODE`. |
| Common errors | `400 VALIDATION` (message `Champ invalide : <champ>`), `400 BAD_JSON`, `401 AUTH_REQUIRED`, `401 AUTH_INVALID` (session expired, account deactivated, password changed), `403 FORBIDDEN`, `403 PASSWORD_CHANGE_REQUIRED`, `403 CSRF`, `404 NOT_FOUND`, `409 DUPLICATE`, `413 TOO_LARGE`, `429 TOO_MANY_REQUESTS` (+ `Retry-After`), `500 SERVER_ERROR` |
| Temporary password | While `mustChangePassword` is true, every route except `GET /auth/me`, `POST /auth/first-password` and `POST /auth/logout` answers `403 PASSWORD_CHANGE_REQUIRED`. |
| Dates | `YYYY-MM-DD` = local day (Tunis). Timestamps are ISO 8601 UTC. Amounts are numbers in TND (3 decimals). |
| Days of the week | `0` = Monday … `6` = Sunday (`trainingDays`, `weekday`). |
| Photos | Data URL `data:image/jpeg|png|webp;base64,...`, at most 2 MB of image (3 MB of request). The type is checked on the bytes. Errors: `400 PHOTO_INVALID`, `413 TOO_LARGE`. Other requests are limited to 100 KB. |
| Rate limits | 600 req/min per IP overall; login 10/min per IP + 30/h per identifier; the other limits are given per route. |
| Labels | Every enum (`goal`, `issueType`, `status`…) has its FR/AR/EN label in `GET /meta`. |
| Field order | Fields can be added later: ignore unknown fields. |

Roles: `SPORTIF` (member, logs in by phone), `GERANT`, `ACCUEIL`, `TECHNICIEN`, `COACH` (gym staff, `/staff/*`), `ADMIN` (`/admin/*`).

---

## 1. Public and authentication

### `GET /health`
`{ "ok": true, "ai": false }` (other fields may be added).

### `GET /meta` (public)
FR/AR/EN labels: `{ muscles, patterns, injuryZones, issueTypes, reportStatuses, machineStatuses, goals, levels, activities, dietStyles, sexes, mealTypes, drinks, paymentMethods, planUnits, subscriptionStatuses, roles, weekdays, coachTopics, sessionMinutes: [30,45,60,90] }`.

- Every dictionary looks like `{ KEY: { fr, ar, en } }`. `weekdays` is a list of 7 entries (Monday first). `drinks.X.kcalPerMl` is also given.
- `injuryZones` keys: `epaule, genou, dos (lower back), poignet, coude, cheville, cou, haut_dos, hanche`.
- `issueTypes` keys: `NE_MARCHE_PAS, CABLE, REGLAGE, PIECE_CASSEE, BRUIT, ECRAN, AUTRE`.

### `POST /auth/login`
Body `{ identifier, password }`. `identifier` is a phone number in any format (`22 345 678`, `+216…`, `00216…`) or an e-mail address.

Returns `200` with the session payload (same shape as `GET /auth/me`) and sets the cookie.

Errors:
- `401 BAD_CREDENTIALS`: generic message, whether or not the account exists.
- `429 ACCOUNT_LOCKED`: after 5 failures the account is locked for 15 min.
- `403 ACCOUNT_DISABLED`
- `403 TEMP_PASSWORD_EXPIRED`
- `429 TOO_MANY_REQUESTS`

### `GET /auth/me`
Session payload. `gym.settings` is complete for staff and reduced for a member (`features`, `languages`, `live.calmThreshold`, `live.showCount`).

```json
{ "id": 9, "name": "Amine Ben Salah", "email": "amine.bensalah@gmail.com", "phone": "+21622345678", "role": "SPORTIF",
  "language": "fr", "theme": "dark", "mustChangePassword": false, "onboardedAt": "…", "healthConsent": true, "gymId": 1,
  "sex": "H", "birthYear": 1994, "age": 32, "weight": 85, "height": 175, "goalWeight": 76.3, "goal": "PERTE_POIDS", "level": "INTERMEDIAIRE",
  "activity": "SEDENTAIRE", "trainingDays": [0,1,3,5], "daysPerWeek": 4, "sessionMinutes": 60, "injuries": ["genou"], "dietStyle": "EQUILIBRE",
  "prefs": {…}, "accessActive": true, "active": true, "lastLoginAt": "…",
  "gym": { "id": 1, "name": "Kammel Gym Lac 2", "address": "…", "city": "Tunis", "phone": "+216 71 860 100", "capacity": 120,
           "hours": { "week": ["06:00","23:00"], "sat": ["07:00","21:00"], "sun": ["08:00","14:00"] }, "settings": {…} },
  "permissions": ["dashboard", "live", "…"] }
```

### `POST /auth/first-password`
First login with a temporary password.

- Body: `{ currentPassword, newPassword }`.
- Returns `200` with the session payload and a new cookie.
- Errors: `400 BAD_PASSWORD`, `400 WEAK_PASSWORD` (`details`: `MIN_LENGTH | MAX_LENGTH | LETTER_AND_DIGIT | TOO_COMMON | SAME_AS_TEMPORARY`), `400 NOT_REQUIRED`.

### `POST /auth/logout`
Body `{ everywhere?: true }`. Returns `{ ok: true }` and clears the cookie. `everywhere` invalidates every session of the account.

### `POST /auth/forgot-password` and `POST /auth/reset-password` (staff and admin)
- `forgot-password`: body `{ email }`. Always answers `{ ok: true }`.
- `reset-password`: body `{ email, code, password }`. Returns the session payload, or `400 CODE_INVALID`.
- Members do not use this flow: reception gives them a new temporary password.

---

## 2. Member account: `/me` (logged in)

Most `/me` routes are member-only (role `SPORTIF`, `403 FORBIDDEN` otherwise). These are open to every role: `GET/PUT /me/profile`, `GET/PUT /me/prefs`, `PUT /me/password`, `GET /me/notifications`, `POST /me/notifications/read`.

### `GET /me/profile`
Returns the session payload without `permissions`, with `gym` reduced to `{id,name,address,city,phone,capacity,hours}`, plus `initials`.

Members also get `computed` (Results screen):

```json
"computed": { "bmi": 27.8, "bmiCategory": "SURPOIDS", "healthyRange": [56.7, 76.3], "kgToChange": -8.7, "weeksToGoal": 18, "goalDate": "2027-03-13",
              "maintenance": 2147, "target": { "calories": 1647, "protein": 124, "carbs": 185, "fat": 46 },
              "waterMl": { "trainingDay": 3400, "restDay": 2800 } }
```

`bmiCategory` is `MAIGREUR | NORMAL | SURPOIDS | OBESITE`.

### `PUT /me/profile`
- Every role can send `name` (2–100), `language` (`fr|ar|en`) and `theme` (`dark|light|system`). For staff and admin, other fields are ignored.
- Members (partial update) can also send:

| Field | Values |
| --- | --- |
| `sex` | `H` · `F` · `NA` |
| `birthYear` | current year − 90 … current year − 12 |
| `weight` | 30–300 |
| `height` | 100–250 (integer) |
| `goalWeight` | 30–300 or `null` |
| `goal` | `PERTE_POIDS` · `PRISE_MASSE` · `FORME` · `FORCE` |
| `level` | `DEBUTANT` · `INTERMEDIAIRE` · `AVANCE` |
| `activity` | `SEDENTAIRE` · `LEGER` · `ACTIF` · `TRES_ACTIF` |
| `trainingDays` | 2 to 6 distinct days, 0–6 (sorted by the server; also sets `daysPerWeek`) |
| `sessionMinutes` | 30 · 45 · 60 · 90 |
| `injuries` | zone keys |
| `dietStyle` | `EQUILIBRE` · `PROTEINES` · `VEGETARIEN` · `LOW_CARB` |
| `healthConsent` | boolean |

- Health data (`sex, birthYear, weight, height, goalWeight, injuries`) needs `healthConsent=true`. Sending it without consent → `400 CONSENT_REQUIRED`.
- `healthConsent:false` erases that data and the nutrition target.
- Changing a physical field, the goal, `activity`, `dietStyle`, `sessionMinutes` or `trainingDays` recomputes the nutrition target (formula).
- `gymId` in the body → `403 GYM_LOCKED` (only the gym can change it).
- Returns the same shape as `GET /me/profile`.

### `PUT /me/onboarding` (member)
- Required: `goal, sex, birthYear, height, weight, activity, level, trainingDays, sessionMinutes, dietStyle`, and `healthConsent: true` (`400 CONSENT_REQUIRED` otherwise).
- Optional: `name, language, goalWeight, injuries` (default `[]`).
- Sets `onboardedAt`, computes the target and generates the first program if there is none (gym template, otherwise AI/rules).
- Returns `{ profile, target, program }`. `target` is a NutritionTarget or `null`; `program` has the shape of `GET /programs/current`, or `null`.

### `GET /me/prefs` and `PUT /me/prefs`
Only the keys below are kept; any other key is ignored. `PUT` is partial and returns the full prefs.

```json
{ "notifications": { "sessions": true, "water": true, "gym": true, "meals": false }, "calmAlert": false,
  "waterTargetMl": null, "hotDay": false, "units": "METRIC",
  "waterReminders": { "enabled": true, "everyHours": 2, "quietFrom": "23:00", "quietTo": "07:00" }, "ramadan": false }
```

| Key | Values |
| --- | --- |
| `waterTargetMl` | `null` (calculated target) or 1000–6000 (rounded to 50) |
| `units` | `METRIC` · `IMPERIAL` |
| `everyHours` | 1–4 |
| `quietFrom` / `quietTo` | `HH:MM` |

### `PUT /me/password` (every role)
- Body: `{ currentPassword, newPassword }`.
- Returns `{ ok: true }`. The other sessions are logged out (`tokenVersion++`); this session gets a new cookie.
- Errors: `400 BAD_PASSWORD`, `400 WEAK_PASSWORD`, `400 SAME_PASSWORD`.

### `GET /me/subscription`

```json
{ "subscription": { "id": 7, "startDate": "2026-10-08", "endDate": "2026-11-07", "amount": 90, "paymentMethod": "ESPECES",
    "frozenFrom": null, "frozenUntil": null,
    "plan": { "id": 1, "nameFr": "Mensuel", "nameAr": "شهري", "nameEn": "Monthly", "duration": 1, "durationUnit": "MONTH", "price": 90 },
    "progress": 0.87, "status": "EXPIRE_BIENTOT", "daysLeft": 4, "graceDays": 3 },
  "status": "EXPIRE_BIENTOT", "gym": { "id": 1, "name": "Kammel Gym Lac 2", "phone": "…" }, "inAppPurchase": false,
  "todayCheckIn": { "at": "…", "checkOutAt": null, "status": "ENTREE" } }
```

- `status` is one of `ACTIF | EXPIRE_BIENTOT` (≤ 7 days) `| GRACE | EXPIRE | GELE | AUCUN`.
- `subscription` is `null` if the member has none.
- `todayCheckIn` is the latest accepted entry today, or `null`.

### `GET /me/payments`
`[{ id, createdAt, amount, method, kind: "ABONNEMENT|INSCRIPTION|SEANCE", label, plan: {id,nameFr,nameAr,nameEn}|null }]`

### `GET /me/access-pass` (member)
QR access card. The code changes every 30 s; refresh it before `expiresAt`.

```json
{ "code": "K1.9.59372541.Ab3…", "expiresAt": "…", "refreshSeconds": 30, "status": "EXPIRE_BIENTOT", "valid": true,
  "subscription": { "endDate": "2026-11-07", "daysLeft": 4, "frozenUntil": null, "plan": {…} },
  "member": { "id": 9, "name": "Amine Ben Salah", "initials": "AB" }, "gym": { "id": 1, "name": "Kammel Gym Lac 2" } }
```

- An expired or frozen subscription still gets a code, with `valid: false`: show "abonnement expiré". The scan will refuse it.
- Card disabled → `403 ACCESS_DISABLED`.

### Breakdown reports (member)

**`GET /me/reports`** returns the member's latest 50 reports.

**`POST /me/reports`** (10/h)
- Body: `{ machineId, issueType, description?: ≤500, notify?: boolean (default true), photo?: dataURL }`.
- `machineId` must belong to the member's gym (`404 NOT_FOUND` otherwise).
- The machine becomes `SIGNALEE` if it was `OK`. Another open report on the same machine still counts as a new report.
- Returns `201` with the item below plus `otherOpenReports`.
- Report feature disabled by the gym → `403 FEATURE_DISABLED`.

Item:

```json
{ "id": 12, "ticket": "P-00012", "machine": { "id": 9, "code": "09", "label": "Tirage vertical", "zone": "Machines" },
  "issueType": "CABLE", "description": "…", "status": "NOUVEAU", "notify": true, "hasPhoto": true, "createdAt": "…",
  "timeline": [ { "step": "ENVOYE", "at": "…", "done": true }, { "step": "VU", "at": null, "done": false },
                { "step": "REPARATION", "at": null, "done": false }, { "step": "REPAREE", "at": null, "done": false } ] }
```

**`GET /me/reports/:id/photo`** returns the image of the member's own report only (`404` otherwise). Usable as `<img src>`.

### Notifications

**`GET /me/notifications`** returns `{ items: [{ id, kind, title, body, link, createdAt, readAt }], unread }` (latest 50).
- `kind` is `MESSAGE | EXPIRY | CALM | REPAIRED | INACTIVE | WELCOME | SYSTEM`.
- `link` is an internal app route, for example `/app/account/subscription?s=7`, `/app/live`, `/app/training`, `/app/account/reports`, `/app/notifications`, `/app`.
- The title and body are already in the member's language.

**`POST /me/notifications/read`**
- Body `{ ids: [1,2] }` (≤ 100) or `{ all: true }`.
- Returns `{ updated, unread }`.

### `GET /me/export` (member)
JSON download (`Content-Disposition: attachment`) of the member's own data only:

`{ exportedAt, account, subscriptions, payments, checkins, programs, sessions, nutritionTarget, meals, water, foods, coachMessages, reports, notifications }`.

### `DELETE /me` (member)
- Body: `{ password }`. Returns `{ ok: true }` and clears the cookie.
- Errors: `400 BAD_PASSWORD`.
- Anonymizes the account:
  - The name becomes "Membre supprimé"; phone and e-mail are removed; health data and prefs are cleared; the account is deactivated.
  - Meals, water, chat, programs, sessions, notifications and personal foods are deleted.
  - Subscriptions, payments and check-ins are kept for the gym's records, linked to the anonymous account. Reports lose their description and photo.

---

## 3. Catalogue and the member's gym

### `GET /equipment` (logged in)
`[{ id, code, nameFr, nameAr, category: "MACHINE|LIBRE|POIDS_DU_CORPS" }]`

### `GET /exercises` (logged in)
- Query: `?q=` (search FR/AR/EN), `?muscle=`, `?safe=1` (only exercises that do not load the member's pain zones).
- Returns a list of exercise summaries, plus `defaultSets` and `avoidForMe`.

Exercise summary (used everywhere):

```json
{ "id": 61, "nameFr": "Presse pectorale assise", "nameAr": "…", "nameEn": "Seated chest press", "primaryMuscle": "pectoraux",
  "secondaryMuscles": ["triceps","epaules"], "pattern": "poussee_horizontale", "difficulty": 1, "injuryZones": ["epaule"],
  "defaultReps": "10-12", "videoUrl": null,
  "equipment": { "id": 21, "code": "chest_press", "nameFr": "Presse pectorale", "nameAr": "…", "category": "MACHINE" },
  "machines": [ { "id": 4, "code": "04", "label": "Chest Press", "zone": "Machines", "status": "OK", "outOfService": false } ] }
```

`machines` lists the machines of the user's gym that provide this equipment.

### `GET /exercises/:id` (logged in)
The summary, plus:

| Field | Content |
| --- | --- |
| `accessories` | equipment codes |
| `defaultSets` | `{ DEBUTANT: "3x12", INTERMEDIAIRE: "3x10", AVANCE: "4x8" }` |
| `benefitsFr`, `benefitsAr`, `mistakesFr`, `mistakesAr` | lists of strings |
| `alternatives` | `[{id,nameFr,nameAr,nameEn}]`, the manual alternatives in order |
| `avoidForMe` | boolean |
| `personal` (members only) | `{ best: {weight, reps, date} \| null, history: [{date, maxWeight}] }` |

### `GET /exercises/:id/video` (logged in, 20/min)
`{ videoId: "abcdEFGhijk" | null, source: "ADMIN" | "SEARCH" | null }`.
- Embed `https://www.youtube-nocookie.com/embed/<videoId>`.
- `null` means no video: offer a YouTube search link instead.

### `GET /exercises/:id/alternatives?reason=OCCUPEE|ABSENTE|PANNE` (member)
`{ reason, alternatives: [Alternative] }` (3 at most).

Alternative:

```json
{ "exercise": {ExerciseSummary}, "score": 7, "reasons": ["SAME_PATTERN","SHARED_MUSCLES","LEVEL_MATCH","ALREADY_DONE"],
  "sharedMuscles": ["triceps"], "advice": "SAME_EFFORT|START_LIGHTER|BODYWEIGHT", "relaxed": false, "manual": true }
```

- `manual: true` means the alternative was chosen by the gym; those come first.
- Out-of-service machines (`outOfService` or `REPARATION`) are excluded.

### `GET /exercises/:id/explain/:altId?lang=` (logged in, 10/min)
`{ text }`: why this alternative fits (AI when available, otherwise a built sentence).

### `GET /gym/live` (member, own gym only, never an id from the client)
Feature disabled → `403 FEATURE_DISABLED`; no gym → `400 NO_GYM`.

```json
{ "gym": { "id": 1, "name": "Kammel Gym Lac 2", "city": "Tunis" }, "showCount": true,
  "count": 42, "capacity": 120, "level": "FREQUENTEE", "calmThreshold": 25,
  "deltaSince": { "count": 6, "since": "10:45" },
  "comparedToUsual": { "weekday": 1, "hour": 11, "usual": 51, "diff": -9, "trend": "CALMER" },
  "hourlyToday": [ { "hour": 6, "count": 14, "forecast": 12, "phase": "PAST", "open": true, "calm": false }, … { "hour": 23, … } ],
  "peak": { "hour": 19, "count": 96 }, "calmWindow": { "from": "14:00", "to": "16:00" },
  "open": true, "opening": { "open": "06:00", "close": "23:00" }, "updatedAt": "…",
  "brokenMachines": [ { "id": 9, "label": "Tirage vertical", "code": "09", "zone": "Machines", "status": "SIGNALEE", "outOfService": false } ],
  "calmAlert": true }
```

- `level` is `CALME` (< threshold), `PLEINE` (≥ 80 % of capacity), otherwise `FREQUENTEE`.
- `trend` is `CALMER | USUAL | BUSIER` (±15 %, at least 3 people).
- `hourlyToday` covers hours 6 to 23:
  - `phase` is `PAST` (measured at hh:30), `NOW` or `FUTURE`.
  - `count` is `null` in the future.
  - `forecast` is the average of the last 8 weeks.
- When `showCount` is false, `count` and `deltaSince` are `null`.
- The response never contains names.

### `GET /gym/plans` (member)
`[{ id, nameFr, nameAr, nameEn, duration, durationUnit, price, freezeDays, noteFr, noteAr, accessHours }]`: visible, non-archived plans.

### `GET /gym/machines` (member)
`[{ id, label, code, zone, status, outOfService, equipment: { id, code, nameFr, nameAr, category } }]`, sorted by zone and code.
The QR printed on each machine contains `KM.<gymId>.<machineId>`.

---

## 4. Program: `/programs` (member)

### `GET /programs/current` → program or `null`

```json
{ "id": 3, "title": "Perte de poids · 4 jours", "source": "MODELE", "goal": "PERTE_POIDS", "templateId": 1,
  "daysPerWeek": 4, "weeks": 8, "week": 3, "startedAt": "2026-10-19", "sessionsDone": 9, "sessionsTotal": 32,
  "days": [ { "dayIndex": 1, "labelFr": "Jambes", "labelAr": "…", "muscles": ["fessiers","ischios"], "exerciseCount": 5, "estMinutes": 60,
              "items": [ { "id": 31, "position": 1, "sets": 4, "reps": "10", "restSec": 90, "exercise": {ExerciseSummary} } ] } ],
  "schedule": [ { "weekday": 0, "date": "2026-11-02", "dayIndex": 1, "labelFr": "Jambes", "labelAr": "…", "status": "DONE" }, … 7 days ],
  "doneThisWeek": 1, "plannedThisWeek": 4, "restDays": [2,4,6], "createdAt": "…" }
```

- `source` is `MODELE | IA | REGLES`.
- `schedule.status` is `DONE | TODAY | PLANNED | MISSED | REST`.
- Program days are mapped onto `trainingDays` in order, and rotate from one week to the next when the program has more days than the member.

### `GET /programs/today`
Today's session, or the next planned one. Returns `null` without a program.

```json
{ "programId": 3, "programTitle": "…", "week": 3, "weeks": 8, "date": "2026-11-03", "weekday": 1, "isToday": true, "doneToday": false,
  "dayIndex": 2, "labelFr": "Push", "labelAr": "…", "muscles": ["pectoraux","epaules","triceps"], "exerciseCount": 6, "estMinutes": 60,
  "inProgressSessionId": null,
  "items": [ { "programItemId": 40, "position": 1, "sets": 4, "reps": "8", "restSec": 90, "exercise": {ExerciseSummary},
               "suggestedKg": 60, "lastPerformance": { "date": "…", "weight": 57.5, "reps": 8 } } ] }
```

`suggestedKg` is the last weight used, plus 2.5 kg when every set was completed twice in a row. It is `null` without history.

### `POST /programs/generate` (6/h)
- Body: `{ source?: "TEMPLATE" | "AI" | "RULES" }`.
- With no source (or `TEMPLATE`), the gym's published template that matches the goal is used: closest day count, compatible level. Exercises that load a pain zone or are impossible in the gym are replaced automatically.
- Otherwise AI, then rules.
- The number of exercises depends on `sessionMinutes`: 30 → 4, 45 → 5, 60 → 6, 90 → 7.
- Returns `201` with the shape of `GET /programs/current`.
- Errors: `400 PROFILE_INCOMPLETE` (missing goal, level, trainingDays or gym).

---

## 5. Sessions: `/sessions` (member)

Session (shape returned by every route below):

```json
{ "id": 77, "programId": 3, "status": "EN_COURS|TERMINEE", "quick": false, "dayIndex": 2, "dayLabelFr": "Push", "dayLabelAr": "…",
  "startedAt": "…", "finishedAt": null, "rating": null, "elapsedSec": 1104, "progress": { "done": 1, "total": 6 },
  "entries": [ { "id": 501, "position": 2, "targetSets": 3, "targetReps": "10", "restSec": 60, "reason": null,
                 "setsDone": [ { "reps": 10, "weight": 52.5 } ], "exercise": {ExerciseSummary}, "originalExercise": null,
                 "previous": { "date": "…", "sets": [ { "reps": 10, "weight": 50 } ] }, "suggestedKg": 52.5 } ] }
```

- `previous` holds the sets from the last finished session for this exercise ("Précédent" column).
- `reason` is `OCCUPEE | ABSENTE | PANNE | null`. It is filled when the exercise was replaced; `originalExercise` is then `{id,nameFr,nameAr,nameEn}`.

| Route | Effect |
| --- | --- |
| `GET /sessions` | latest 50 sessions (light rows) |
| `POST /sessions` `{ dayIndex?: 1..7, quick30?: true }` | `201` + Session. With no `dayIndex`, uses today's session. If a session is already in progress, returns that one (`200`). `quick30` keeps the first 3 exercises, at most 3 sets, rest ≤ 60 s. Errors: `400 NO_PROGRAM`, `400 DAY_NOT_FOUND`. |
| `GET /sessions/:id` | Session |
| `PUT /sessions/:id/entries/:entryId` `{ setsDone: [{ reps 0–200, weight 0–500 }] }` (≤ 10) | Session (`weight` rounded to 0.25). Errors: `400 VALIDATION`, `400 SESSION_FINISHED`. |
| `GET /sessions/:id/entries/:entryId/alternatives?reason=` | `{ reason, canWait: true, alternatives: [Alternative] }` |
| `POST /sessions/:id/entries/:entryId/substitute` `{ exerciseId, reason?, machineId? }` | Session + `reportId`. The safety check is done again (`400 INVALID_ALTERNATIVE`). With `reason: "PANNE"`, a report `NE_MARCHE_PAS` is created (at most once per day and per machine) and the machine becomes `SIGNALEE`. |
| `POST /sessions/:id/entries/:entryId/postpone` | Session: the exercise moves to the end ("J'attends") |
| `POST /sessions/:id/finish` | `{ session, stats }` (see below). Calling it again on a finished session returns the stats. |
| `PUT /sessions/:id/rating` `{ rating: 1–5 }` | `{ id, rating }`. Errors: `400 SESSION_NOT_FINISHED`. |
| `DELETE /sessions/:id` | Abandon: `{ ok: true }` (in-progress sessions only) |

`stats`:

```json
{ "durationMin": 64, "volumeKg": 8450, "sets": 22, "kcal": 453,
  "records": [ { "exerciseId": 1, "nameFr": "…", "nameAr": "…", "nameEn": "…", "weight": 62.5, "reps": 8, "previousBest": 60 } ] }
```

- `kcal` = 5 MET × weight × hours.
- `records` lists the personal records beaten in this session.

---

## 6. Progress: `/progress` (member)

### `GET /progress`
`{ totalSessions, thisWeekSessions, weeklyTarget, streakWeeks, weeks: [{ week: "YYYY-MM-DD" (Monday), sessions, volume }] (8 weeks), musclesThisWeek: { muscle: sets }, records: [{ exercise:{id,nameFr,nameAr,nameEn,primaryMuscle}, weight, reps, date }] }`

### `GET /progress/history`
`[{ id, date, startedAt, finishedAt, dayIndex, dayLabelFr, dayLabelAr, quick, rating, durationMin, volumeKg, sets, exercises, substitutions }]` (100 at most).

### `GET /progress/exercise/:id`
`[{ date, maxWeight }]`

### `GET /progress/series?days=7|30|90`
`{ span, days: [{ date, waterMl, calories, sessions }], weight, goalWeight }`.
No weight history is stored: only the current weight and the goal weight are returned.

---

## 7. Coach: `/coach` (member)

Coach disabled by the gym → `403 COACH_DISABLED` (except `DELETE`).

Message:

```json
{ "id": 1, "role": "user|assistant", "content": "…", "offline": true, "proposal": null, "proposalState": null, "createdAt": "…" }
```

Proposals (deterministic, never produced by the AI):
- `{ "type": "SWAP", "reason": "DOULEUR|OCCUPEE", "sessionId"?, "entryId"? | "programItemId"?, "fromExerciseId", "toExerciseId", "fromName": {fr,ar,en}, "toName": {fr,ar,en}, "sets": 3, "reps": "12" }`
- `{ "type": "ADD_PAIN", "zone": "epaule" }`

`proposalState` is `PENDING | APPLIED | DISMISSED`.

| Route | Effect |
| --- | --- |
| `GET /coach/messages` | `{ aiEnabled, messages: [Message] }` (latest 100, oldest first) |
| `POST /coach/messages` `{ content: ≤1000 }` (20/min) | `201 { question: Message, answers: [Message] }` (see below) |
| `POST /coach/messages/:id/proposal` `{ action: "APPLY" \| "DISMISS" }` | `{ message, applied }` (see below) |
| `DELETE /coach/messages` | `{ ok: true }` |

`POST /coach/messages`:
- `answers[0]` is the reply. It may carry a SWAP proposal when the member mentions pain, or a busy or broken machine, on an exercise from the session in progress or from today's session.
- `answers[1]` (optional) asks "J'ajoute « zone » à tes douleurs ?" with an ADD_PAIN proposal.
- Pain for more than 3 days → a referral to the gym's partner physio is added to the reply.
- The session context is computed by the server (never sent by the client).
- Reply language: Arabic script → derja; English detected → EN; otherwise the profile language.

`POST /coach/messages/:id/proposal` with `APPLY`:
- SWAP with `entryId` → substitution in the session in progress.
- SWAP with `programItemId` → that program day's exercise is replaced.
- ADD_PAIN → adds the zone to `injuries` (needs `healthConsent`).
- `applied` is `{ type: "SWAP", sessionId, entryId }`, `{ type: "SWAP", programItemId }` or `{ type: "ADD_PAIN", injuries }` (`null` for DISMISS).
- Errors: `404 NOT_FOUND`, `409 PROPOSAL_CLOSED`, `409 PROPOSAL_OUTDATED` (session changed, or the alternative is no longer allowed), `400 CONSENT_REQUIRED`.

---

## 8. Meals and water: `/nutrition` (member)

Meals feature disabled by the gym → `403 FEATURE_DISABLED`.

### `GET /nutrition/day?date=YYYY-MM-DD` (default: today)

```json
{ "date": "2026-11-03",
  "target": { "calories": 1647, "protein": 124, "carbs": 185, "fat": 46, "maintenance": 2147, "waterMl": 3400, "source": "REGLES", "advice": null },
  "meals": { "PETIT_DEJ": [ { "id": 1, "date": "…", "mealType": "PETIT_DEJ", "name": "Bsissa au lait", "quantity": "1 bol · 250 g",
                             "calories": 290, "protein": 11, "carbs": 38, "fat": 10, "foodId": 1, "createdAt": "…" } ],
             "DEJEUNER": [], "DINER": [], "COLLATION": […] },
  "totals": { "calories": 401, "protein": 15, "carbs": 55, "fat": 13, "drinksKcal": 0 },
  "remaining": { "calories": 1246, "protein": 109, "carbs": 130, "fat": 33 },
  "water": { "targetMl": 3400, "computedTargetMl": 3400, "manual": false, "trainingDay": true, "consumedMl": 1410, "pct": 41,
             "glasses": { "glassMl": 250, "total": 14, "filled": 5 }, "logs": [ { "id": 1, "date": "…", "ml": 250, "drink": "EAU", "kcal": 0, "createdAt": "…" } ] },
  "insight": { "code": "PROTEIN_GAP", "text": "Encore 109 g de protéines à prendre. Pense au poulet ou à une ojja ce soir." },
  "profileComplete": true }
```

- `target` is `null` if the profile is incomplete.
- The water target is the manual target from prefs, otherwise the formula (training day if that date is one of the `trainingDays`).
- `insight.code` is `START | PROTEIN_GAP | OVER | WATER | ON_TRACK`. The text is in the member's language.

### `GET /nutrition/stats?days=7|30&date=`
`{ span, goal, weight, target, maintenance, targetWeeklyKg, actualWeeklyKg, days: [{ date, meals, calories, protein, carbs, fat, waterMl, reached }], average, averageWaterMl, loggedDays, reachedDays, streak }`

### `POST /nutrition/target` (10/h)
Recomputes the target (formula, adjusted by the AI but never more than 30 % away). Returns the NutritionTarget, or `400 NUTRITION_PROFILE`.

### `POST /nutrition/analyze` `{ image: dataURL }` (15/h)
`{ name, items: [{ name, grams }], calories, protein, carbs, fat, confidence }`. Nothing is saved.
Errors: `503 NO_AI`, `503 AI_UNAVAILABLE`, `422 NOT_FOOD`, `400 PHOTO_INVALID`.

### Foods

**`GET /nutrition/foods?q=&tab=all|recent|mine`**
`[{ id, nameFr, nameAr, nameEn, portion, calories, protein, carbs, fat, source: "KAMMEL|GYM|MINE" }]`
- The list combines the Kammel catalogue, the gym's foods and the member's own foods (100 at most).
- `recent` = foods of the member's latest meals.

**`POST /nutrition/foods`**
- Body: `{ nameFr, nameAr?, nameEn?, portion, calories 0–3000, protein?, carbs?, fat? (0–400) }`.
- Returns `201` with a Food (`source: MINE`). Errors: `400 LIMIT_REACHED` (200 foods).

**`DELETE /nutrition/foods/:id`** deletes one of the member's own foods only.

### Meals

**`POST /nutrition/meals`**
- With a food: `{ foodId, servings?: 0.25–10, mealType?, quantity?, date? }`. Values = food × servings.
- Manual: `{ name, calories 0–5000, protein?, carbs?, fat?, mealType?, quantity?, date? }`.
- `mealType` is `PETIT_DEJ | DEJEUNER | DINER | COLLATION` (default `DEJEUNER`).
- `date` goes from 1 year ago to tomorrow.
- Returns `201` with a Meal.

**`DELETE /nutrition/meals/:id`** returns `{ ok: true }`.

### Water

**`POST /nutrition/water`**
- Body: `{ ml: 50–2000, drink?: "EAU|THE|CAFE|JUS|SHAKE", date? }`.
- Returns `201` with `{ id, date, ml, drink, kcal, createdAt }`. `kcal` is calculated by the server from `drinks`.

**`DELETE /nutrition/water/:id`** returns `{ ok: true }` (the undo toast).

---

## 9. Gym back-office: `/staff/*`

### Access rules
- Roles `GERANT | ACCUEIL | TECHNICIEN | COACH` attached to a gym. Any other role gets `403 FORBIDDEN`.
- Everything is limited to the gym of the logged-in account. An id from another gym → `404 NOT_FOUND`.
- Missing permission → `403 FORBIDDEN`.
- Writes on members, subscriptions, payments, plans, cash, team, settings, machines and reports are logged in `AuditLog`.

### Permission matrix (`services/permissions.js`)

| Permission | Roles |
| --- | --- |
| dashboard | all 4 |
| live | GERANT, ACCUEIL |
| members.read | GERANT, ACCUEIL, COACH |
| members.write | GERANT, ACCUEIL |
| members.health | GERANT, COACH |
| payments | GERANT, ACCUEIL |
| plans.read | GERANT, ACCUEIL |
| plans.write | GERANT |
| machines.read | all 4 |
| machines.write | GERANT, TECHNICIEN |
| reports.read | all 4 |
| reports.write | GERANT, TECHNICIEN |
| reports.create | all 4 |
| content | GERANT, COACH |
| notifications | GERANT, ACCUEIL |
| stats, team, settings, audit | GERANT |

### Common shapes

**Status of a member** (`status` field): `ACTIF | EXPIRE_BIENTOT | GRACE | EXPIRE | GELE | AUCUN`. Lists also use `DESACTIVE` for a deactivated account.

**SubscriptionView**:

```json
{ "id": 7, "startDate": "…", "endDate": "…", "amount": 90, "paymentMethod": "ESPECES", "frozenFrom": null, "frozenUntil": null, "freezeDaysUsed": 0,
  "plan": { "id": 1, "nameFr": "Mensuel", "nameAr": "شهري", "nameEn": "Monthly" }, "status": "EXPIRE_BIENTOT", "daysLeft": 4, "graceDays": 3 }
```

When there is no subscription: `{ "status": "AUCUN", "daysLeft": null }`.

### Dashboard and menu

**`GET /staff/nav-counts`** (any staff role; counts only)
`{ newReports?, openReports?, expiringSoon?, refusedToday? }`

| Field | Needed permission | Meaning |
| --- | --- | --- |
| `newReports` | `reports.read` | reports with status `NOUVEAU` |
| `openReports` | `reports.read` | `NOUVEAU`, `VU` or `REPARATION` |
| `expiringSoon` | `members.read` | active members whose latest subscription ends in 0–7 days, not frozen |
| `refusedToday` | `live` | refused entries today |

A field the role has no permission for is absent.

**`GET /staff/dashboard`** (`dashboard`)

```json
{ "date": "2026-11-03", "now": "…", "gym": { "id": 1, "name": "…", "city": "Tunis", "open": true, "opening": { "open": "06:00", "close": "23:00" } },
  "presentNow": { "count": 42, "capacity": 120, "level": "FREQUENTEE", "comparedToUsual": {…}, "deltaSince": {…} },
  "entriesToday": { "count": 118, "lastWeekSameTime": 106, "diff": 12 },
  "hourlyToday": [ … same as /gym/live … ], "peak": { "hour": 19, "count": 96 }, "calmWindow": { "from": "14:00", "to": "16:00" },
  "openReports": { "count": 8, "machines": 4, "new": 3, "newToday": 3 },
  "expiringSoon": { "count": 23 },
  "todo": { "count": 9, "items": [ … ] },
  "lastEntries": [ { "id": 1, "at": "…", "status": "ENTREE|REFUSEE", "refusalReason": null,
                     "member": { "id": 9, "name": "…", "initials": "AB" },
                     "subscription": { "status": "EXPIRE_BIENTOT", "daysLeft": 4, "endDate": "…", "plan": {…} } } ],
  "cashedToday": { "amount": 330, "count": 2 },
  "revenue": { "months": [ { "month": "2025-12", "total": 9420 }, … 12 ], "lastMonth": { "month": "2026-10", "total": 12840 }, "currentMonthToDate": { "month": "2026-11", "total": 2410 } } }
```

Each block appears only for some roles:

| Block | Shown when the role has |
| --- | --- |
| `openReports` and the report items of `todo` | `reports.read` |
| `expiringSoon`, `lastEntries` and the member items of `todo` | `members.read` or `live` |
| `cashedToday`, `revenue` | `payments` (absent for the technician and the coach) |

`todo.items` (10 at most, in this order), where `machine` is `{id, code, label, zone}`:

| `type` | Fields |
| --- | --- |
| `REPORT_NEW` | `reportId, machine, issueType, at, count` |
| `ENTRY_REFUSED` | `checkinId, member, at, reason, endDate` |
| `EXPIRES_TODAY` | `member, plan, endDate, lastVisitAt` |
| `IN_GRACE` | `member, plan, endDate, daysLate, lastVisitAt` |
| `REPORT_REPAIR` | `reportId, machine, issueType, at, assignedTo: {id,name}\|null, note, count` |

### Live gym and entries (`live`)

**`GET /staff/live`**
The `/gym/live` fields without `gym`, `brokenMachines` and `calmAlert`, plus:
- `entriesToday`, `refusedToday`
- `calmAlertMembers`: members who receive the calm alert
- `settings: { calmThreshold, alertAbove, showCount, autoCheckoutHours, capacity }`
- `heatmap: { weeks: 8, hours: [6..23], rows: [{ weekday, values: [avg per hour] }], max }`

The live settings are changed with `PUT /staff/settings` (gérant).

**`GET /staff/checkins?date=`**
`{ date, count, refused, items: [ { id, at, checkOutAt, status, refusalReason, source: "SCAN|MANUEL|LECTEUR", present, durationMin, member: {id,name,initials}, byStaff: {id,name}, subscription: { status, daysLeft, graceDays, endDate, plan } } ] }`

**`POST /staff/checkins`**
- Body: `{ code }` (QR of the access card) or `{ memberId }` (manual entry).
- Response (`201` new entry, `200` repeat scan within 2 min with `duplicate: true`):

```json
{ "result": "GRANTED|GRANTED_GRACE|REFUSED", "reason": null | "GRACE" | "EXPIRE" | "GELE" | "AUCUN" | "DESACTIVE" | "HORS_HORAIRES" | "CODE_INVALIDE",
  "duplicate": false, "checkin": { "id": 1, "at": "…", "status": "ENTREE|REFUSEE" },
  "member": { "id": 9, "name": "Amine Ben Salah", "initials": "AB", "plan": {…}, "endDate": "2026-11-07", "daysLeft": 4, "status": "EXPIRE_BIENTOT" } }
```

- An invalid, expired or other-gym code returns `200 { result: "REFUSED", reason: "CODE_INVALIDE", member: null, checkin: null }`. No entry is recorded and no information is given.
- A refusal records a `REFUSEE` entry with its reason.
- Grace period → `GRANTED_GRACE`.
- `HORS_HORAIRES`: an "off-peak" plan (`accessHours: OFF_PEAK`) is refused from 17:00 to 21:00.

**`POST /staff/checkins/:id/checkout`**
`{ id, at, checkOutAt }`

### Members

**`GET /staff/members`** (`members.read`)

| Query | Values |
| --- | --- |
| `q` | name, phone or e-mail |
| `status` | `all \| active \| expiring \| expired \| frozen` |
| `planId` | plan id |
| `sort` | `lastVisit \| name \| endDate` |
| `page`, `pageSize` | `pageSize` 5–100, default 20 |

```json
{ "total": 512, "page": 1, "pageSize": 20, "counts": { "all": 512, "active": 486, "expiring": 23, "expired": 19, "frozen": 7 },
  "items": [ { "id": 9, "name": "…", "initials": "AB", "phone": "+21622345678", "email": "…", "active": true, "accessActive": true,
               "mustChangePassword": false, "createdAt": "…", "plan": {…}, "subscription": {SubscriptionView}, "status": "EXPIRE_BIENTOT", "lastVisitAt": "…" } ] }
```

- `active` = ACTIF + EXPIRE_BIENTOT + GRACE.
- `expiring` = EXPIRE_BIENTOT + GRACE.
- `expired` = EXPIRE + AUCUN.
- `counts` are computed after the search.

**`GET /staff/members/export.csv`** (`members.write`)
- CSV with `;` separators and a UTF-8 BOM. Columns: Nom, Téléphone, E-mail, Formule, Début, Fin, Statut, Dernière visite.
- A cell that starts with `= + - @` gets a leading `'`. No health data.

**`GET /staff/members/:id`** (`members.read`)

```json
{ "member": { "id", "name", "initials", "phone", "email", "language", "createdAt", "active", "accessActive" },
  "account": { "hasLoggedIn": true, "lastLoginAt": "…", "mustChangePassword": false, "tempPasswordExpiresAt": null, "passwordChangedAt": "…", "onboarded": true },
  "subscription": {SubscriptionView}, "currentSubscriptionId": 7, "lastExpiryReminder": { "at": "…", "title": "…" } | null,
  "subscriptions": [SubscriptionView…],
  "stats": { "visits30": 14, "lastVisitAt": "…", "sessionsDone": 9, "sessionsTotal": 32, "streakDays": 5, "totalPaid": 720 },
  "recentVisits": [ { "id", "at", "checkOutAt", "inProgress": true, "durationMin": null } ],
  "reports": [ { "id", "machine": {id,code,label}, "issueType", "status", "createdAt" } ],
  "payments": [ { "id", "createdAt", "amount", "method", "kind", "label", "plan", "receivedBy": {id,name} } ],
  "profile": { "goal", "sex", "age", "birthYear", "weight", "goalWeight", "height", "injuries", "trainingDays", "sessionMinutes", "level", "activity", "dietStyle",
               "healthConsent": true, "program": { "id", "title", "week", "weeks" } } }
```

- `payments` appears only with the `payments` permission.
- `profile` appears only with `members.health`. Without the member's consent it is `{ healthConsent: false, program }`.

**`POST /staff/members`** (`members.write`): one transaction
- Body: `{ firstName, lastName, phone, email?, birthDate?, planId, paymentMethod, startDate? (−31 d … +60 d), chargeRegistrationFee?: true, language? }`.
- Creates the account (temporary password, valid 7 days), the subscription, the payment(s) (subscription + registration fee) and the welcome notification.
- Returns `201`:

```json
{ "member": { "id", "name", "initials", "phone", "email", "language" }, "login": "+21624117590",
  "temporaryPassword": "K7M4Q2X9", "temporaryPasswordExpiresAt": "…",
  "subscription": {SubscriptionView}, "payments": [ { "id", "amount", "method", "kind", "label" } ], "total": 260 }
```

- `temporaryPassword` is returned this one time only; only its hash is stored.
- Errors: `409 PHONE_TAKEN`, `409 EMAIL_TAKEN`, `404 PLAN_NOT_FOUND`, `400 PAYMENT_METHOD_DISABLED`, `400 VALIDATION`.

**`PUT /staff/members/:id`** (`members.write`)
- Body: `{ firstName?, lastName? | name?, phone?, email? (null to remove) }`.
- Returns `{ id, name, initials, phone, email }`. Errors: `409 PHONE_TAKEN`, `409 EMAIL_TAKEN`.

**`POST /staff/members/:id/renew`** (`members.write`)
- Body: `{ planId, method, start?: "AFTER" | "TODAY" }`.
- `AFTER` starts the day after the current end date (or today if it has expired).
- Returns `201 { subscription, payment: { id, amount, method, kind, label, createdAt } }`.

**`POST /staff/members/:id/freeze`** (`members.write`)
- Body: `{ days: 1–180, from?: today…+60 d }`.
- Pushes back the end date (and the renewals already recorded).
- Limits: the plan's `freezeDays` and `settings.rules.maxFreezeDaysPerYear`.
- Returns a SubscriptionView.
- Errors: `400 FREEZE_LIMIT` (`details.allowed`), `409 ALREADY_FROZEN`, `409 NO_ACTIVE_SUBSCRIPTION`.

**`POST /staff/members/:id/unfreeze`** (`members.write`)
Gives back the unused days. Returns a SubscriptionView, or `409 NOT_FROZEN`.

**`POST /staff/members/:id/reset-password`** (`members.write`)
`{ login, temporaryPassword, temporaryPasswordExpiresAt }`, shown once. The member's sessions are logged out.

**`POST /staff/members/:id/deactivate`** and **`/reactivate`** (`members.write`)
`{ id, active }`. Deactivating logs out the member's sessions.

**`PUT /staff/members/:id/access`** (`members.write`)
Body `{ accessActive: boolean }`. Returns `{ id, accessActive }`.

**`POST /staff/members/:id/message`** (`notifications`)
Body `{ title ≤120, body ≤500 }`. Returns `201 { id, createdAt }`.

### Plans

**`GET /staff/plans`** (`plans.read`)

```json
{ "month": "2026-10", "plans": [ { "id", "nameFr", "nameAr", "nameEn", "duration", "durationUnit", "price", "accessHours", "inApp", "freezeDays",
  "noteFr", "noteAr", "visible", "archived", "position", "activeMembers": 274, "salesLastMonth": 280, "revenueLastMonth": 6200, "revenueShare": 48 } ],
  "rules": { "registrationFee": 20, "graceDays": 3, "maxFreezeDaysPerYear": 30 } }
```

`revenueShare` is the share (%) of last month's plan revenue.

Write routes (`plans.write`):

| Route | Effect |
| --- | --- |
| `POST /staff/plans` | Body: `{ nameFr, nameAr, nameEn?, duration 1–365, durationUnit, price 0–100000, accessHours?, inApp?, freezeDays? 0–180, noteFr?, noteAr?, visible?, position? }`. Returns `201` with the plan. |
| `PUT /staff/plans/:id` | Same fields, partial. Returns the plan + `runningSubscriptions`. A new price only applies to future purchases. |
| `POST /staff/plans/:id/archive` / `unarchive` | Returns the plan. An archived plan is hidden. |
| `PUT /staff/plans-rules` | Body: `{ registrationFee?, graceDays?, maxFreezeDaysPerYear? }`. Returns the `rules`. |

### Payments and cash (`payments`)

**`GET /staff/payments`**

| Query | Values |
| --- | --- |
| `period` | `today \| week \| month \| lastMonth \| all` (default `week`) |
| `method` | payment method |
| `page`, `pageSize` | page number and size |

```json
{ "period": "week", "from": "…", "to": "…", "total": 11, "page": 1, "pageSize": 20,
  "items": [ { "id", "createdAt", "amount", "method", "kind", "label", "member": {id,name}|null, "plan": {…}|null, "receivedBy": {id,name}, "cashSessionId": null } ],
  "totals": { "today": { "amount": 330, "count": 2 }, "week": {…}, "month": {…},
              "lastMonth": { "month": "2026-10", "amount": 12840, "count": 150, "previousAmount": 12390, "deltaPct": 3.6 },
              "period": { "amount": 1410, "count": 11 } },
  "byMethod": { "month": "2026-10", "items": [ { "method": "ESPECES", "amount": 5900, "count": 70, "pct": 46 } ] },
  "byStaff": [ { "staff": { "id": 3, "name": "Leila Ben Amor" }, "amount": 900, "count": 6, "pct": 64 } ] }
```

- `byMethod` covers last month.
- `byStaff` covers the selected period.

**`GET /staff/payments/export.csv?period=`**
Columns: Date, Membre, Formule, Type, Moyen, Encaissé par, Montant (TND).

**`POST /staff/payments`**
- One-off payment: a visitor or a member buying a day plan.
- Body: `{ planId (DAY plan), method, label?, memberId? }`.
- Returns `201` with a payment. Errors: `404 PLAN_NOT_FOUND`.
- Payments are immutable: there is no route to update or delete one.

**`GET /staff/cash`**
`{ open: Cash | null, lastClosed: Cash | null }`

```json
{ "id": 9, "openedAt": "…", "openedBy": { "id": 3, "name": "Leila Ben Amor" }, "openingFloat": 50, "cashReceived": 0, "expected": 50,
  "closedAt": null, "closedBy": null, "countedCash": null, "difference": null, "note": null }
```

**`POST /staff/cash/open`**
Body `{ openingFloat: 0–10000 }`. Returns `201` with the Cash, or `409 CASH_ALREADY_OPEN`.

**`POST /staff/cash/close`**
Body `{ countedCash, note? }`. Returns the Cash with `difference = counted − expected`, or `409 CASH_NOT_OPEN`.

Cash payments are linked to the open cash session.

### Machines

**`GET /staff/machines?zone=&status=`** (`machines.read`)

```json
{ "zones": ["Machines","Poids libres","Cardio"],
  "counts": { "all": 38, "byZone": { "Machines": 16 }, "signalees": 3, "reparation": 1, "outOfService": 1 },
  "items": [ { "id", "code": "09", "label": "Tirage vertical", "zone": "Machines", "status": "OK|SIGNALEE|REPARATION", "outOfService": false,
               "lastMaintenanceAt": "2026-10-02", "equipment": { "id", "code", "nameFr", "nameAr", "category" }, "reports30d": 1, "openReports": 1 } ] }
```

| Route | Effect |
| --- | --- |
| `GET /staff/equipment` (`machines.read`) | equipment types |
| `GET /staff/machines/qr` (`machines.read`) | `[{ id, code, label, zone, qr: "KM.<gymId>.<machineId>" }]` |
| `POST /staff/machines` (`machines.write`) | Body: `{ label, code?, zone (from settings.zones), equipmentId, status?, outOfService?, lastMaintenanceAt? }`. `code` is letters, digits and `-`, without `#`, unique in the gym (`409 CODE_TAKEN`). Returns `201` with the machine. |
| `PUT /staff/machines/:id` (`machines.write`) | Same fields, partial |
| `DELETE /staff/machines/:id` (`machines.write`) | `{ ok: true }` |
| `POST /staff/machines/identify` `{ image }` (`machines.write`, 20/h) | `{ equipmentId, label, confidence }`. Errors: `422 NOT_RECOGNIZED`, `503 NO_AI`. |

### Breakdowns (reports)

**`GET /staff/reports`** (`reports.read`)

```json
{ "columns": { "nouveaux": [Group], "enCours": [Group], "reparees": [Group] },
  "counts": { "nouveaux": 2, "enCours": 2, "reparees": 2, "openReports": 7, "openMachines": 4 },
  "assignees": [ { "id": 5, "name": "Walid Khelifi", "role": "TECHNICIEN" } ] }
```

Columns:
- `nouveaux`: status `NOUVEAU`.
- `enCours`: `VU` or `REPARATION`.
- `reparees`: `REPAREE` repaired in the last 7 days.

Group (one per machine and column):

```json
{ "mainReportId": 12, "reportIds": [12], "machine": { "id", "code", "label", "zone", "status", "outOfService" }, "status": "NOUVEAU",
  "issueType": "CABLE", "latestAt": "…", "firstAt": "…", "count": 1, "hasPhoto": true, "assignedTo": {id,name,role}|null,
  "internalNote": null, "repairStartedAt": null, "repairedAt": null, "notified": 1 }
```

**`GET /staff/reports/:id`** (`reports.read`)

```json
{ "id", "machine", "issueType", "description", "status", "notify", "hasPhoto", "createdAt", "seenAt", "repairStartedAt", "repairedAt",
  "author": {id,name,role}, "assignedTo": {…}|null, "internalNote",
  "reporters": [ { "reportId", "author", "at", "issueType", "description", "notify", "hasPhoto", "status" } ] }
```

`reporters` lists the open reports for the same machine.

**`GET /staff/reports/:id/photo`** (`reports.read`) returns the image.

**`POST /staff/reports`** (`reports.create`, 60/h)
Body `{ machineId, issueType, description?, photo? }`. Returns `201` with the detail.

**`PUT /staff/reports/:id`** (`reports.write`)
- Body: `{ status?: "NOUVEAU|VU|REPARATION|REPAREE|REJETE", assignedToId?: id|null, outOfService?: boolean, internalNote?: ≤500 }`.
- The status applies to every open report for the same machine (one incident), except `REJETE`, which applies to this report only.
- Dates are filled in: `seenAt`, `repairStartedAt`, `repairedAt`.
- Machine status follows the report:

| Report status | Machine |
| --- | --- |
| `VU` | `SIGNALEE` |
| `REPARATION` | `REPARATION` |
| `REPAREE` | `OK`, `outOfService: false`, `lastMaintenanceAt` = today. Every reporter with `notify: true` gets a REPAIRED notification if that automation is on. |

- `assignedToId` must be an active technician or gérant of the gym (`400 INVALID_ASSIGNEE`).
- Returns the detail plus `notified` (number of members notified).

### Team (`team`)

**`GET /staff/team`**
`{ members: [ { id, name, initials, email, role, active, lastLoginAt, online (login < 10 min), pendingInvitation, invitationExpiresAt, createdAt } ], roles: [...], permissions: { permission: [roles] } }`

| Route | Effect |
| --- | --- |
| `POST /staff/team` `{ name, email, role }` | `201 { member, login, temporaryPassword, temporaryPasswordExpiresAt }`. The password is shown once. Errors: `409 EMAIL_TAKEN`. |
| `PUT /staff/team/:id` `{ role }` | Returns the member. The person's sessions are logged out. Errors: `400 SELF`, `409 LAST_MANAGER`. |
| `POST /staff/team/:id/deactivate` / `reactivate` | Same errors (`400 SELF`, `409 LAST_MANAGER`). |
| `POST /staff/team/:id/reset-password` | `{ login, temporaryPassword, temporaryPasswordExpiresAt }` |

### Settings and audit log

**`GET /staff/settings`** (`settings`)
`{ gym: { id, name, address, city, phone, capacity, hours }, settings: {…} }`.
The full `settings` object comes from `services/gymSettings.js` DEFAULTS:
- `features { live, alternatives, reports, coach, meals, painProgram, inAppPurchase }`
- `languages { fr, ar, en, default }`
- `paymentMethods { ESPECES, CARTE, D17, FLOUCI, VIREMENT }`
- `live { calmThreshold, alertAbove, showCount, autoCheckoutHours }`
- `rules { registrationFee, graceDays, maxFreezeDaysPerYear }`
- `zones []`
- `coach { proposeChanges, addPainWithConsent, languages {fr, derja, en}, safety {notMedical, physioAfter3Days, noSupplements}, physio {name, phone} }`
- `automations { expiry {enabled, daysBefore, hour}, calm {enabled}, repaired {enabled}, inactive {enabled, days}, welcome {enabled} }`
- `privacy { checkinRetentionMonths }`

**`PUT /staff/settings`** (`settings`)
- Body: `{ gym?: { name?, address?, city?, phone?, capacity 1–5000?, hours? }, settings?: { …partial } }`.
- `hours` is `{ week: ["HH:MM","HH:MM"] | null, sat, sun, ramadan?: {week, sat, sun} }`, where `null` means closed and opening must be before closing.
- Unknown keys are dropped and types are checked.
- Returns the same shape as `GET`.

**`GET /staff/audit?page=&action=`** (`audit`)
`{ total, page, pageSize: 50, items: [ { id, action, targetType, targetId, details, createdAt, actor: {id,name,role} } ] }`.
Example actions: `member.create`, `member.renew`, `member.freeze`, `member.reset_password`, `payment.create`, `cash.open`, `cash.close`, `plan.update`, `team.role`, `settings.update`, `machine.update`, `report.update`, `campaign.create`.

### Notifications (`notifications`)

**`GET /staff/campaigns/audiences`**
`[{ audience: "ALL|EXPIRING|INACTIVE|NEW|EXPIRED", count }]`

| Audience | Members |
| --- | --- |
| `ALL` | current subscription, including grace and frozen |
| `EXPIRING` | ≤ 7 days left |
| `INACTIVE` | active, no entry for `automations.inactive.days` (14) |
| `NEW` | created this month |
| `EXPIRED` | expired subscription |

**`GET /staff/campaigns`**
`{ items: [Campaign], automations: {…}, smsAvailable: false }`

```json
{ "id", "audience", "kind": "MESSAGE|EXPIRY|CALM|REPAIRED|INACTIVE|WELCOME", "auto": false, "channel": "APP", "titleFr", "bodyFr", "titleAr", "bodyAr",
  "scheduledAt", "sentAt", "status": "SENT|SCHEDULED", "recipients": 486, "readRate": 49, "createdBy": {id,name}|null, "createdAt" }
```

**`POST /staff/campaigns`** (20/h per gym)
- Body: `{ audience, titleFr ≤120, bodyFr ≤500, titleAr?, bodyAr?, channel?: "APP"|"SMS", scheduledAt?: ISO (now … +30 d) }`.
- Sends now, or later through the background jobs. Each member gets the Arabic version if their language is `ar` and it exists, otherwise French.
- Returns `201` with the Campaign.
- Errors: `400 SMS_NOT_CONFIGURED` (unless `SMS_PROVIDER` is set).

**`DELETE /staff/campaigns/:id`** cancels a scheduled campaign that has not been sent.

**`PUT /staff/campaigns/automations`**
Body `{ expiry?: {enabled, daysBefore 1–30, hour 6–21}, calm?: {enabled}, repaired?: {enabled}, inactive?: {enabled, days 3–90}, welcome?: {enabled} }`. Returns `automations`.

### Reports (`stats`)

**`GET /staff/stats?month=YYYY-MM`** (default: last month)

```json
{ "month": "2026-10", "previousMonth": "2026-09",
  "revenue": { "total": 12840, "previous": 12390, "deltaPct": 3.6 },
  "activeMembers": { "count": 486, "previous": 468, "delta": 18 },
  "newMembers": { "count": 41, "departures": 23 },
  "renewals": { "rate": 78, "previousRate": 80, "deltaPoints": -2 },
  "visitsPerMemberWeek": { "value": 2.6, "previous": 2.6, "delta": 0 },
  "revenueByMonth": [ { "month": "2025-12", "total": 9420 }, … 12, up to the current month ],
  "revenueByPlan": [ { "plan": {id,nameFr,nameAr,nameEn}, "amount": 6200, "count": 70, "pct": 48 } ],
  "entriesByWeekday": [ { "weekday": 0, "average": 212 }, … 7 ],
  "appUsage": { "openedThisWeekPct": 71, "sessionsLogged": 1932, "mealsLogged": 4610, "alternativesChosen": 388 } }
```

### App content (`content`)

**`GET /staff/content/exercises?q=&muscle=`** returns `{ total, items: [Item] }`; **`GET /staff/content/exercises/:id`** returns one Item.

```json
{ "id", "nameFr", "nameAr", "nameEn", "primaryMuscle", "secondaryMuscles", "pattern", "difficulty", "equipment": {…},
  "machines": [ { "id", "code", "label", "status" } ], "availableInGym": true, "injuryZones": ["epaule"],
  "defaultSets": { "DEBUTANT": "3x12", … }, "defaultReps": "10-12",
  "alternatives": [ { "id", "nameFr", "nameAr", "nameEn" } ], "alternativesCount": 3, "videoUrl": null }
```

The global catalogue is edited only by the admin.

**Program templates**

| Route | Effect |
| --- | --- |
| `GET /staff/content/programs` | `[Template]` |
| `POST /staff/content/programs` | Body: `{ nameFr, nameAr, goal, level?: null\|level, daysPerWeek 1–6 (= days.length), weeks 1–52, published?, days: [ { labelFr, labelAr, focusFr?, focusAr?, items: [ { exerciseId, sets 1–10, reps ("10", "8-12", "40 s", "10 min"), restSec? 0–600 } ] (1–12) } ] }`. Unknown exercise → `400 UNKNOWN_EXERCISE`. Returns `201` with a Template. |
| `PUT /staff/content/programs/:id` | partial |
| `POST /staff/content/programs/:id/publish` `{ published?: true }` | Returns the Template |
| `DELETE /staff/content/programs/:id` | `{ ok: true }` |

Template:
`{ id, nameFr, nameAr, goal, level, daysPerWeek, weeks, published, membersCount, days: [ { labelFr, labelAr, focusFr, focusAr, items: [ { exerciseId, sets, reps, restSec, exercise: {id,nameFr,nameAr,nameEn,primaryMuscle} } ] } ], updatedAt }`

**Foods**

| Route | Effect |
| --- | --- |
| `GET /staff/content/foods?q=&source=all\|kammel\|gym` | `{ total, items: [ { id, nameFr, nameAr, nameEn, portion, calories, protein, carbs, fat, source: "KAMMEL"\|"GYM", editable } ] }` (200 at most) |
| `POST /staff/content/foods` | same body as `POST /nutrition/foods`; creates a gym food |
| `PUT /staff/content/foods/:id` | updates a gym food (Kammel foods cannot be edited) |
| `DELETE /staff/content/foods/:id` | deletes a gym food |

**`GET /staff/content/nutrition-rules`**
`{ formula: "MIFFLIN_ST_JEOR", activityFactors, goalDelta, macroSplit, water, kgPerWeek, example: { profile, maintenance: 2147, calories: 1647, protein: 124, carbs: 185, fat: 46, waterMl: 3400, bmi: 27.8, healthyRange: [56.7, 76.3] } }`

**Coach**

**`GET /staff/content/coach`**

```json
{ "settings": { "enabled": true, "proposeChanges": true, "addPainWithConsent": true, "languages": {…}, "safety": {…}, "physio": { "name": "Cabinet du Lac", "phone": "+216 71 860 214" } },
  "analytics": { "days": 7, "conversations": 1248, "membersUsing": 302, "questions": 1500, "proposalsApplied": 186, "physioReferrals": 7,
                 "topics": [ { "topic": "REMPLACER", "count": 510, "pct": 34 } ], "painZones": [ { "zone": "genou", "count": 41 } ] } }
```

- `conversations` counts each member and day that had at least one question.
- The analytics never include message contents.

**`PUT /staff/content/coach`**
Body `{ enabled?, proposeChanges?, addPainWithConsent?, languages?, safety?, physio? }`. Returns `settings`.

---

## 10. Administrator: `/admin/*` (role ADMIN)

| Route | Effect |
| --- | --- |
| `GET /admin/stats` | `{ sportifs, staff, gyms, exercises, sessions, sessionsToday, aiEnabled }` |
| `GET /admin/gyms` | `[ { id, name, address, city, phone, capacity, hours, createdAt, members, machines, liveCount, manager: {id,name,email,active,mustChangePassword}\|null } ]` |
| `POST /admin/gyms` `{ name, address?, city?, phone?, capacity?, hours?, managerName, managerEmail }` | `201` + gym + `{ manager, login, temporaryPassword, temporaryPasswordExpiresAt }`. The password is shown once. Errors: `409 EMAIL_TAKEN`. |
| `PUT /admin/gyms/:id` | same gym fields |
| `DELETE /admin/gyms/:id` | `{ ok: true }`. Refused while the gym has members (`409 GYM_NOT_EMPTY`). Staff accounts are detached and deactivated. |
| `GET /admin/gyms/:id/machines` / `POST` `{ equipmentId, label, code?, zone?, newExercises? }` | gym machines (AI exercises kept by the admin are added to the catalogue) |
| `POST /admin/machines/identify` `{ image }` (30/h) | `{ equipmentId, label, confidence }` or `{ equipmentId: null, newType, label, confidence }` |
| `GET /admin/equipment/:id/exercises`, `POST /admin/equipment`, `GET /admin/equipment/:id/suggestions` (30/h) | equipment types and AI suggestions |
| `GET /admin/users?q=&role=&gymId=&page=` | `{ total, page, pageSize: 50, items: [ { id, name, email, phone, role, active, gymId, lastLoginAt, mustChangePassword, createdAt, gym: {id,name}, initials } ] }` |
| `PATCH /admin/users/:id` `{ active }` | `{ id, name, role, active }`. Sessions are logged out (`tokenVersion++`). Errors: `400 SELF`. |
| `GET /admin/exercises` | full catalogue |
| `POST /admin/exercises` / `PUT /admin/exercises/:id` | Exercise fields + `defaultSets: { DEBUTANT: "3x12", … }` (format `\d+x\d+`, `×` accepted) + `alternativeIds` (existing exercises, ≠ itself, at most 6). Errors: `400 VALIDATION`, `400 UNKNOWN_EXERCISE`. |
| `DELETE /admin/exercises/:id` | `409 IN_USE` if the exercise is used |

---

## 11. Background jobs (`services/jobs.js`)

Every 10 minutes (first run 30 s after start), no duplicates:

| Job | Rule |
| --- | --- |
| Scheduled campaigns | Sent once (atomic claim). |
| Expiry reminder | `automations.expiry.daysBefore` days ahead, from hour `hour`. Once per subscription (`link …?s=<subscriptionId>`). Not sent if renewed or frozen. |
| Inactive members | After `inactive.days` without an entry (from 10:00). Once per absence. |
| Calm gym | When the gym drops back under `calmThreshold`, during opening hours. Only to members with `prefs.calmAlert` (and `notifications.gym` not false). At most once a day per member. |
| Check-in purge | Older than `privacy.checkinRetentionMonths`, once a day. |

Every automatic send creates a `Campaign` with `auto: true`, shown in the history.

## 12. Demo data (`npm run db:setup`)

- Refused when `NODE_ENV=production`.
- A remote database requires `npm run db:setup -- --yes`.
- Every demo account uses the password `Kammel2026!`. Accounts:

| Account | Login | Note |
| --- | --- | --- |
| Admin | `admin@kammel.tn` | |
| Gérant | `sami@kammelgym.tn` | |
| Accueil | `leila@`, `mariem@` | |
| Technicien | `walid@` | |
| Coach | `hichem@` | |
| Ennasr gérant | `nizar@kammelgym.tn` | |
| Sousse gérant | `olfa@kammelgym.tn` | coach disabled |
| Members | Amine `+216 22 345 678` (reference), Yasmine `55 120 447` (AR), Salma `23 908 115` (expired) | |
| New member | Youssef `+216 24 117 590` | temporary password `K7M4Q2X9` |
