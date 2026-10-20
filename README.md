# FitCoach AI

Application de coaching sportif qui s'adapte aux machines disponibles dans la salle.

| Partie | Dossier | Technologies |
| --- | --- | --- |
| API (serveur) | `backend/` | Node.js, Express, Sequelize, MySQL |
| Site web (sportif, gérant, administrateur) | `web/` | React (Vite) |
| Application mobile (sportif) | `mobile/` | React Native (Expo) |

Les trois parties sont en français et en arabe.

---

## 1. Ce qu'il faut installer (une seule fois)

1. **Node.js 20 ou plus récent** : https://nodejs.org (version « LTS »).
   Vérifier dans un terminal : `node -v`
2. **MySQL Server 8 et MySQL Workbench** : https://dev.mysql.com/downloads/installer/
   Pendant l'installation, notez le mot de passe de l'utilisateur `root`.
3. **Expo Go** sur votre téléphone (Play Store ou App Store), pour l'application mobile.
4. Un éditeur de code, par exemple **VS Code**.

---

## 2. Base de données et API

### 2.1 Configurer la connexion MySQL

Dans le dossier `backend`, copiez le fichier `.env.example` et renommez la copie en `.env`.
Ouvrez `.env` et mettez le mot de passe MySQL de `root` (le même que dans Workbench) :

```
DB_USER=root
DB_PASSWORD=votre_mot_de_passe
DB_NAME=fitcoach
```

Changez aussi `JWT_SECRET` par une phrase secrète de votre choix.

### 2.2 Installer et créer la base

Ouvrez un terminal dans le dossier `backend` :

```
npm install
npm run db:setup
```

`db:setup` crée la base `fitcoach`, toutes les tables (avec Sequelize) et les données de démonstration :
2 salles, 57 exercices en français et en arabe, des abonnés, 3 semaines de séances.

> Attention : `db:setup` efface et recrée les tables. Ne le relancez que pour repartir de zéro.

### 2.3 Lancer l'API

```
npm run dev
```

Le terminal affiche `API FitCoach AI : http://localhost:4000/api`. Laissez ce terminal ouvert.

### 2.4 Voir la base dans MySQL Workbench

1. Ouvrez la connexion « Local instance » dans Workbench.
2. Dans le panneau **Schemas**, cliquez sur l'icône d'actualisation : la base `fitcoach` apparaît avec ses 13 tables.
3. Pour le rapport : menu **Database > Reverse Engineer…**, choisissez `fitcoach`, et Workbench dessine le diagramme des tables avec leurs relations.

---

## 3. Site web

Ouvrez un **deuxième** terminal dans le dossier `web` :

```
npm install
npm run dev
```

Ouvrez http://localhost:5173 dans le navigateur.

### Comptes de démonstration

| Rôle | E-mail | Mot de passe |
| --- | --- | --- |
| Sportif | sportif@fitcoach.tn | Sportif123! |
| Gérant de salle | gerant@fitcoach.tn | Gerant123! |
| Administrateur | admin@fitcoach.tn | Admin123! |

---

## 4. Application mobile

L'API doit être lancée (étape 2.3). Le téléphone et l'ordinateur doivent être **sur le même Wi-Fi**.

Ouvrez un **troisième** terminal dans le dossier `mobile` :

```
npm install
npx expo install --fix
npx expo start
```

- `npx expo install --fix` aligne automatiquement les versions des paquets sur le SDK Expo installé.
- Scannez le QR code avec **Expo Go** (Android) ou avec l'appareil photo (iPhone).
- L'application trouve toute seule l'adresse de votre ordinateur. L'adresse utilisée s'affiche en bas de l'écran de connexion.

Si Expo Go affiche « Project is incompatible with this version of Expo Go » :

```
npm install expo@latest
npx expo install --fix
```

Si `npm install` affiche une erreur `ERESOLVE`, utilisez `npm install --legacy-peer-deps`.

---

## 5. Activer le coach IA (gratuit, facultatif)

Sans clé, l'application fonctionne en **mode simple** : le programme est créé par nos règles et le coach répond aux questions fréquentes (français, arabe, derja).

Pour activer Gemini :

1. Créez une clé gratuite sur https://aistudio.google.com/apikey (compte Google de plus de 18 ans).
2. Collez-la dans `backend/.env` : `GEMINI_API_KEY=votre_cle`
3. Relancez l'API (`Ctrl + C` puis `npm run dev`).

Si Gemini ne répond pas (quota atteint, pas d'Internet), l'application repasse automatiquement en mode simple.

---

## 6. Où se trouve quoi (pour la soutenance)

```
backend/src/
  models/index.js              13 tables Sequelize et leurs relations
  services/substitution.js     ALGORITHME DE REMPLACEMENT (fonction principale)
  services/programGenerator.js génération du programme par règles
  services/coach.js            coach IA (Gemini) et validation de ses réponses
  services/coachFallback.js    réponses du coach en mode simple
  routes/                      les routes de l'API (une par espace)
  seed/                        données de démonstration (exercices FR/AR)
backend/test/logic.test.js     tests des algorithmes (npm test)

web/src/
  pages/athlete/Session.jsx    écran de séance + boutons Occupée / Absente / En panne
  pages/manager/               tableau de bord du gérant
  pages/admin/                 espace administrateur
  locales.js                   textes en français et en arabe

mobile/
  App.js                       navigation (onglets + écrans)
  src/screens/SessionScreen.js séance et remplacement sur le téléphone
```

### L'algorithme de remplacement en 4 étapes

Quand une machine est occupée, absente ou en panne (`services/substitution.js`) :

1. On garde les exercices qui travaillent **le même muscle principal**.
2. On enlève ceux qui demandent un matériel absent de la salle, ou la machine indisponible.
3. On enlève ceux qui sollicitent une **zone blessée** du sportif, ou trop difficiles pour son niveau.
4. On donne un score : même mouvement **+3**, chaque muscle secondaire commun **+1**, difficulté adaptée au niveau **+2**, exercice déjà pratiqué **+1**. On propose les **3 meilleurs**.

Exemple : presse à cuisses occupée → squat à la barre, goblet squat, fente bulgare.

### Règles de gestion appliquées dans le code

| Règle | Où |
| --- | --- |
| RG1 profil et salle obligatoires avant le programme | `routes/programs.js` |
| RG2 seulement des exercices faisables dans la salle | `services/substitution.js`, `services/coach.js` |
| RG3 le remplacement travaille le même muscle | `services/substitution.js` |
| RG4 3 remplacements au maximum | `services/substitution.js` |
| RG5 aucun exercice sur une zone blessée | `services/substitution.js` |
| RG6 machine en panne confirmée = plus proposée | `routes/manager.js` |
| RG7 un gérant ne gère que sa salle | `routes/manager.js` |
| RG8 montants en dinars tunisiens | `models/index.js`, `web/src/i18n.jsx` |

---

## 7. Liste des routes de l'API

| Méthode | Route | Rôle | Description |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | public | inscription d'un sportif |
| POST | `/api/auth/login` | public | connexion (renvoie un jeton JWT) |
| GET | `/api/auth/me` | connecté | utilisateur connecté |
| PUT | `/api/me/profile` | connecté | modifier son profil |
| GET | `/api/me/subscription` | sportif | mon abonnement |
| POST | `/api/me/checkin` · `/api/me/checkout` | sportif | arrivée / départ de la salle |
| POST | `/api/me/reports` | sportif | signaler une panne |
| GET | `/api/gyms` · `/api/gyms/:id` | public / connecté | salles et machines |
| GET | `/api/gyms/:id/occupancy` | connecté | affluence en direct |
| GET | `/api/exercises` · `/api/exercises/:id` | public | bibliothèque d'exercices |
| GET | `/api/exercises/:id/alternatives` | sportif | remplacements possibles |
| POST | `/api/programs/generate` | sportif | générer un programme (IA ou règles) |
| GET | `/api/programs/current` · `/api/programs/today` | sportif | programme et séance du jour |
| POST | `/api/sessions` | sportif | démarrer une séance (`quick30` : version 30 min) |
| PUT | `/api/sessions/:id/entries/:entryId` | sportif | enregistrer les séries |
| GET | `/api/sessions/:id/entries/:entryId/alternatives` | sportif | remplacements pendant la séance |
| POST | `/api/sessions/:id/entries/:entryId/substitute` | sportif | remplacer l'exercice |
| POST | `/api/sessions/:id/entries/:entryId/postpone` | sportif | « J'attends » |
| POST | `/api/sessions/:id/finish` | sportif | terminer la séance |
| GET | `/api/progress` | sportif | statistiques de progression |
| GET · POST | `/api/coach/messages` | sportif | discussion avec le coach |
| GET · PUT | `/api/manager/gym` | gérant | infos de la salle |
| GET · POST · PUT · DELETE | `/api/manager/machines` | gérant | équipements |
| GET · PUT | `/api/manager/reports` | gérant | pannes (confirmer, réparée, rejeter) |
| GET · POST | `/api/manager/members` | gérant | abonnés |
| GET · POST · PUT · DELETE | `/api/manager/subscriptions` | gérant | abonnements |
| GET | `/api/manager/stats` | gérant | statistiques de la salle |
| GET · POST · PUT · DELETE | `/api/admin/gyms` | admin | salles et comptes gérants |
| GET · PATCH | `/api/admin/users` | admin | utilisateurs (activer / désactiver) |
| POST · PUT · DELETE | `/api/admin/exercises` | admin | bibliothèque d'exercices |

Vous pouvez tester ces routes avec **Postman** : après `/api/auth/login`, ajoutez l'en-tête `Authorization: Bearer <jeton>`.

---

## 8. Problèmes fréquents

| Problème | Solution |
| --- | --- |
| `ER_ACCESS_DENIED_ERROR` | Mauvais mot de passe MySQL dans `backend/.env`. |
| `ECONNREFUSED 3306` | MySQL n'est pas démarré : Windows > Services > **MySQL80** > Démarrer. |
| Le site affiche « Serveur injoignable » | L'API n'est pas lancée : `npm run dev` dans `backend`. |
| Le téléphone n'arrive pas à se connecter | Même Wi-Fi ; autorisez **Node.js** dans le pare-feu Windows (réseaux privés). Sinon, écrivez l'adresse IP de votre PC dans `mobile/src/api.js` (`MANUAL_API_URL`). |
| Port 4000 déjà utilisé | Changez `PORT` dans `backend/.env`, la ligne `proxy` de `web/vite.config.js` et le port dans `mobile/src/api.js`. |
