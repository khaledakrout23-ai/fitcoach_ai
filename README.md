# Kammel (كمّل)

**Machine occupée ? Kammel.** Application web (PWA, installable sur le téléphone) pour les salles de sport en Tunisie :
le sportif suit son programme, et quand une machine est occupée, absente ou en panne, l'app propose tout de suite
3 exercices pour les mêmes muscles. L'équipe de la salle gère membres, entrées, paiements, machines et contenu.

| Partie | Dossier | Technologies |
| --- | --- | --- |
| API | `backend/` | Node.js 20+, Express, Sequelize, MySQL / MariaDB / TiDB |
| Application web (membres, équipe de la salle, administrateur) | `web/` | React 18, Vite 6, PWA |
| Ancienne application mobile (gelée, plus maintenue) | `mobile/` | Expo |

Langues : français, arabe (RTL, tunisien) et anglais. Thème sombre par défaut, clair au choix.

| Rôle | Connexion | Espace |
| --- | --- | --- |
| Membre (sportif) | numéro de téléphone | `/app` : accueil, entraînement, séance, repas + eau, coach IA, compte |
| Gérant · Accueil · Technicien · Coach | e-mail | `/salle` : chaque rôle ne voit que ses menus |
| Administrateur Kammel | e-mail | `/admin` : salles, catalogue d'exercices, utilisateurs |

---

## 1. Lancer l'application sur votre PC

### À installer une fois
- **Node.js 20 ou plus récent** (LTS) : https://nodejs.org
- **MySQL 8** (MySQL Workbench) **ou XAMPP** (MariaDB) : le serveur doit être démarré.

### API (premier terminal)
```
cd backend
copy .env.example .env      (Mac/Linux : cp .env.example .env)
npm install
npm run db:setup
npm run dev
```
- Dans `.env` : mettez le mot de passe MySQL (`DB_PASSWORD`) et un `JWT_SECRET` aléatoire :
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- `db:setup` **efface et recrée** la base `kammel` avec les données de démonstration (salle Kammel Gym Lac 2, équipe, membres, paiements, entrées…).
- L'API répond sur http://localhost:4000/api (vérification : http://localhost:4000/api/health).

### Site web (deuxième terminal)
```
cd web
npm install
npm run dev
```
Ouvrez http://localhost:5173. Sur le téléphone (même Wi-Fi) : `http://IP-du-PC:5173`.

### Comptes de démonstration (mot de passe `Kammel2026!`)
| Rôle | Identifiant |
| --- | --- |
| Membre (profil de référence) | `22 345 678` |
| Membre en arabe · membre expiré | `55 120 447` · `23 908 115` |
| Gérant Kammel Gym Lac 2 | `sami@kammelgym.tn` |
| Accueil · Technicien · Coach | `leila@kammelgym.tn` · `walid@kammelgym.tn` · `hichem@kammelgym.tn` |
| Administrateur | `admin@kammel.tn` |
| Nouveau membre (première connexion) | `24 117 590` + le mot de passe provisoire affiché par `db:setup` |

### Tests
```
cd backend
npm test                                                   # algorithmes et règles (sans base)
DB_NAME=kammel_test KAMMEL_API_TEST=1 npm run test:api     # API complète : sécurité, rôles, salles séparées
```
(`test:api` refuse de tourner sur une base dont le nom ne finit pas par `_test`. Créez-la d'abord avec `DB_NAME=kammel_test npm run db:setup`.)

### Coach IA et scan des repas (gratuit, facultatif)
Clé gratuite sur https://aistudio.google.com/apikey → `GEMINI_API_KEY=` dans `backend/.env`, puis relancez l'API.
Sans clé : programme créé par nos règles, coach en mode simple (français, arabe, derja), pas de scan photo.

---

## 2. Mettre l'application en ligne gratuitement

Voir **[DEPLOY.md](DEPLOY.md)** : Cloudflare Pages (site) + Render (API) + TiDB Cloud (base), 0 €, sans carte bancaire.

---

## 3. Sécurité (résumé)

- Session dans un cookie `HttpOnly`, `SameSite=Strict` (`Secure` en ligne), jeton signé HS256 de 7 jours ; coupée immédiatement si le compte est désactivé ou le mot de passe changé. « Rester connecté » décoché = session de 12 h (PC partagé de l'accueil).
- Les membres n'ont jamais de mot de passe commun : l'accueil reçoit un **mot de passe provisoire aléatoire** (affiché une seule fois) que le membre change à sa première connexion.
- Blocage du compte 15 min après 5 erreurs, limitation du débit par adresse IP et par identifiant, réponses identiques que le compte existe ou non.
- Protection CSRF (en-tête obligatoire + origine vérifiée), en-têtes de sécurité (CSP stricte, HSTS, anti-iframe), aucune pile d'erreur renvoyée.
- Chaque rôle n'accède qu'à ses fonctions, vérifié **côté serveur** ; un membre de l'équipe ne voit que sa salle ; l'accueil ne voit jamais les données de santé ; chaque action sur un membre, un paiement ou les réglages est enregistrée (journal).
- Photos vérifiées sur leurs octets (JPEG/PNG/WebP), servies uniquement aux personnes autorisées ; carte d'accès = QR signé qui change toutes les 30 s.
- Dépendances : `npm audit` → 0 vulnérabilité (web et API) ; aucune bibliothèque inutile.

---

## 4. Où se trouve quoi (pour la soutenance)

```
backend/src/
  models/index.js               toutes les tables et leurs relations
  middleware/                   session (auth.js), sécurité HTTP (security.js), erreurs
  services/permissions.js       matrice des rôles de l'équipe
  services/substitution.js      ALGORITHME DE REMPLACEMENT (fonction principale)
  services/targets.js           calories, macros, eau, IMC (Mifflin-St Jeor)
  services/occupancy.js         affluence en direct et habituelle
  services/accessPass.js        carte d'accès (QR qui change toutes les 30 s)
  routes/                       API membre ; routes/staff/ espace salle ; routes/admin.js
  seed/                         données de démonstration
backend/API.md                  toutes les routes de l'API
backend/test/                   tests (npm test, npm run test:api)

web/src/
  styles/                       design system (couleurs, typographie, composants)
  components/                   kit de composants (boutons, anneaux, feuilles…)
  features/                     un dossier par écran (session/, meals/, staff/ops/…)
  layouts/                      barre d'onglets du membre, menu de l'espace salle
```

### L'algorithme de remplacement en 4 étapes (`services/substitution.js`)
1. On garde les exercices qui travaillent **le même muscle principal**.
2. On enlève ceux qui demandent un matériel absent ou hors service, ou la machine indisponible.
3. On enlève ceux qui sollicitent une **zone douloureuse** du sportif, ou trop difficiles pour son niveau.
4. Score : même mouvement **+3**, muscle secondaire commun **+1**, difficulté adaptée **+2**, déjà pratiqué **+1** ; les alternatives choisies par le coach passent en premier. On propose les **3 meilleures**.

---

## 5. Problèmes fréquents

| Problème | Solution |
| --- | --- |
| `ER_ACCESS_DENIED_ERROR` | Mauvais `DB_USER` / `DB_PASSWORD` dans `backend/.env`. |
| `ECONNREFUSED 3306` | MySQL n'est pas démarré (Services Windows > MySQL80, ou XAMPP > MySQL > Start). |
| « La base date de l'ancienne version » | Ancienne base FitCoach : lancez `npm run db:setup`. |
| Le site affiche « Serveur injoignable » | L'API n'est pas lancée (`npm run dev` dans `backend`). |
| Port 4000 occupé | Changez `PORT` dans `backend/.env` et lancez le site avec `API_PORT=<port> npm run dev`. |
