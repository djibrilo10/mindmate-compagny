# Audit du projet — Portail Employé (mindmate)

> Ce document explique **tout** ce qui a été construit dans ce projet, depuis la Phase 1 jusqu'à aujourd'hui, avec assez de détail pour reconstruire l'application à partir de zéro sans rien oublier. Il sera mis à jour après chaque tâche future (voir la section 13, tout en bas).
>
> Dernière mise à jour : **24 septembre 2026**.

---

## 0. Comment utiliser ce document

- Les sections 1 à 6 décrivent les **fondations** (vision, stack, base de données, sécurité, structure de fichiers) — elles ne changent presque jamais.
- La section 7 décrit **chaque fonctionnalité** telle qu'elle existe aujourd'hui : à qui elle sert, quelles routes API elle expose, quelles règles métier elle applique, et pourquoi certains choix ont été faits.
- La section 12 donne l'**ordre exact** pour reconstruire le projet de zéro.
- La section 13 est un **journal** : chaque tâche future y ajoute une entrée datée (nouvelle fonctionnalité, correction de bug, changement de schéma). Ne jamais réécrire l'historique de ce journal — seulement l'allonger.

---

## 1. Vue d'ensemble & vision

Le projet est une **plateforme SaaS multi-tenant de portail employé** : n'importe quelle entreprise ("organisation") peut créer son propre espace, avec ses employés, gérants et admin, complètement isolé des autres entreprises clientes qui utilisent la même application.

Nom de code interne : **mindmate** (aussi appelé "Minmate Compagny" pendant les tests). Le nom affiché dans l'interface est **"Portail employé"**.

Vision d'origine (telle qu'exprimée par le porteur du projet) :
- Inscription d'une entreprise + création de son organisation
- Invitation des employés (modèle de données prêt, flux pas encore construit — voir section 11)
- Dashboard admin
- Signalement de problème employé → gérant/admin
- Déclaration d'absence
- Documents partagés par l'admin, visibles par tous
- Annonces générales
- Postes ouverts + candidature interne
- Avis employés (anonymes)
- Messagerie admin → employé spécifique
- Liste des nouvelles recrues
- Désactivation d'employé par l'admin (jamais de suppression réelle)

Roadmap en 4 phases telle que planifiée :
- **Phase 1 (MVP)** : inscription, invitation, auth, dashboard admin simple, signalements, absences, upload de fichiers
- **Phase 2** : annonces, messagerie ciblée, nouvelles recrues, désactivation d'employé
- **Phase 3** : postes ouverts + candidatures, avis
- **Phase 4** (en cours) : statistiques ✅, notifications ✅, export de rapports ✅, PWA ✅, facturation

**État actuel : Phases 1, 2 et 3 terminées. Phase 4 en cours** : tableau de bord statistiques (7.14), notifications en app (7.15), export de rapports CSV/PDF (7.16) et PWA installable (7.17) livrés. Reste : facturation.

---

## 2. Stack technique

| Domaine | Choix | Version exacte (au 23 sept. 2026) |
|---|---|---|
| Framework web | Next.js (App Router, Turbopack) | 16.3.5 |
| UI | React + Tailwind CSS 4 | react 19.2.8, tailwindcss ^4 |
| Langage | TypeScript | ^5 |
| ORM | Prisma | ^6.19.3 (`@prisma/client` + `prisma`) |
| Base de données | PostgreSQL, hébergée sur **Neon** (base `neondb`) | — |
| Authentification | NextAuth.js, provider Credentials, stratégie JWT | ^4.24.15 |
| Hachage mot de passe | bcryptjs, 12 rounds | ^3.0.3 |
| Validation de formulaires | zod | ^4.6.5 |
| Stockage de fichiers | **Directement dans Postgres** (colonnes `Bytes`/`bytea`) — pas de S3/R2/Supabase Storage (voir section 5.5 pour le pourquoi) | — |
| Hébergement cible | Vercel (Serverless Functions Node.js) | — |
| Seed / données de test | `prisma/seed.ts`, lancé avec `npx prisma db seed` | — |

Le projet a été initialisé avec `create-next-app` (d'où la présence de fichiers par défaut inutilisés : `app/page.tsx`, `app/layout.tsx` avec les polices Geist, `README.md` générique — ils ne sont jamais affichés à l'utilisateur, qui atterrit toujours sur `/login`, `/register` ou `/dashboard`).

`AGENTS.md` et `CLAUDE.md` à la racine sont générés automatiquement par Next.js/Turbopack (pas du contenu de projet à maintenir).

---

## 3. Variables d'environnement

Fichier `.env` à la racine (**jamais commité** — déjà dans `.gitignore` par défaut de `create-next-app`). Variables requises :

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | Chaîne de connexion PostgreSQL (Neon), format `postgresql://user:password@host/db?sslmode=require&channel_binding=require` |
| `NEXTAUTH_URL` | URL de base de l'app (`http://localhost:3000` en dev) |
| `NEXTAUTH_SECRET` | Secret utilisé par NextAuth pour signer les JWT de session — générer une valeur aléatoire forte, différente entre dev/prod |

> ⚠️ Ne jamais mettre les vraies valeurs de ces variables dans ce document, dans le code commité, ou dans une conversation publique. Ce sont des secrets.

---

## 4. Modèle de données

Fichier : `prisma/schema.prisma`. **Règle d'or, répétée en commentaire en tête du fichier** : presque chaque table contient `organizationId`, et aucune requête ne doit jamais lire/écrire sans filtrer par cette colonne — c'est ce qui garantit l'isolation entre les entreprises clientes (le "multi-tenant").

### 4.1 Enums

```prisma
enum Role { SUPER_ADMIN  ORG_ADMIN  MANAGER  EMPLOYEE }
enum ReportStatus { NEW  SEEN  IN_PROGRESS  RESOLVED }
enum AbsenceStatus { PENDING  APPROVED  REJECTED }
enum JobPostingStatus { OPEN  CLOSED }
enum ApplicationStatus { RECEIVED  IN_REVIEW  ACCEPTED  REJECTED }
enum UserStatus { ACTIVE  DISABLED }
```

- `SUPER_ADMIN` : réservé au porteur du produit (gère toutes les organisations clientes) — pas encore de dashboard "super admin" séparé construit ; le rôle existe dans le modèle mais n'a pas d'interface propre aujourd'hui.
- `ORG_ADMIN` : l'admin/RH d'une entreprise cliente — créé automatiquement à l'inscription.
- `MANAGER` : chef de département/gérant — mêmes droits que `ORG_ADMIN` sur Signalements et Absences, mais PAS sur la désactivation de comptes employés, les Documents, Annonces, Postes ouverts ou Avis (voir tableau de permissions en section 7).
- `EMPLOYEE` : rôle par défaut.

### 4.2 Modèles

Chaque modèle ci-dessous est décrit avec : son rôle, ses champs clés, et pourquoi il est fait ainsi.

**`Organization`** — un tenant (une entreprise cliente).
`id, name, slug (unique), plan (default "free"), inviteCode (unique, nullable), createdAt, updatedAt`. Le `slug` sert d'identifiant textuel utilisé à la connexion (voir 7.1). `plan` existe déjà pour préparer la facturation (Phase 4), pas encore utilisé. `inviteCode` est le code d'auto-inscription employé (ex. `"XK7P-2QRT"`, voir `lib/invite-code.ts` et 7.18) — nullable pour les organisations créées avant cette fonctionnalité, généré à la volée au premier affichage de `/dashboard/settings` ou premier appel à `GET /api/organization/invite-code`.

**`Department`** — département au sein d'une organisation. `organizationId, name`. Contrainte `@@unique([organizationId, name])` : deux départements ne peuvent pas porter le même nom dans la même entreprise (mais le même nom peut exister dans deux entreprises différentes).

**`User`** — un employé/gérant/admin. Champs clés : `organizationId, departmentId?, email, passwordHash, firstName, lastName, role, status (UserStatus), avatarUrl?, hireDate?`.
Points importants :
- `email` est unique **par organisation** via `@@unique([organizationId, email])`, pas globalement unique — la même adresse peut être utilisée par deux personnes dans deux entreprises différentes.
- `status: DISABLED` remplace toute suppression réelle : voir section 5.3 (soft-delete).
- `hireDate` sert à la fonctionnalité "Nouvelles recrues" (tri par date d'embauche décroissante).
- Relations nommées (car un `User` peut être lié à une même table de plusieurs façons) : `ReportSubmitter`, `MessageSender`/`MessageReceiver`, `AnnouncementAuthor`, `FileUploader`.

**`Invitation`** — pensé pour inviter un employé par lien/email avant qu'il ait un compte (`email, role, token (unique), expiresAt, acceptedAt?`). **Le modèle existe mais le flux d'invitation n'a jamais été construit** (voir section 11 — dette technique connue). Aujourd'hui, les comptes employés sont créés via `prisma/seed.ts` ou manuellement en base ; il n'y a pas d'UI "inviter un employé".

**`Report`** (Signalements) — `submitterId, title, description, isAnonymous (default false), status (ReportStatus)`. Un employé signale un problème à son gérant/admin, avec option d'anonymat.

**`AbsenceRequest`** (Absences) — `userId, startDate, endDate, reason, status (AbsenceStatus, default PENDING)`.

**`FileUpload`** (Documents partagés) — `uploaderId, fileName, mimeType, fileSize, data (Bytes), category (default "other"), weekLabel?`. Fichier stocké **directement en base** (voir 5.5). `category` vaut `"schedule" | "policy" | "other"` (convention de valeurs, pas un enum Prisma). **Ce modèle a été remanié le 23 sept. 2026** : à l'origine il avait un champ `fileUrl` pensé pour un stockage externe (S3/R2/Supabase) — jamais utilisé en pratique, remplacé par `data Bytes` + `mimeType` + `fileSize` avant la construction de la fonctionnalité Documents, pour rester cohérent avec le choix fait pour les pièces jointes des annonces.

**`Announcement`** (Annonces) — `authorId, title, content`. Relation `attachments AnnouncementAttachment[]`.

**`AnnouncementAttachment`** — fichier joint à une annonce. `announcementId, fileName, fileType (MIME), fileSize, data (Bytes)`. `onDelete: Cascade` sur `announcementId` : supprimer une annonce supprime ses pièces jointes automatiquement.

**`JobPosting`** (Postes ouverts) — `title, description, status (JobPostingStatus, default OPEN)`. Relation `applications JobApplication[]`.

**`JobApplication`** (Candidatures) — `jobPostingId, applicantId, status (ApplicationStatus, default RECEIVED), message?`. Contrainte **`@@unique([jobPostingId, applicantId])`** : un employé ne peut postuler qu'une seule fois par poste — c'est la base de données elle-même qui l'empêche (violation gérée côté API, voir 7.9).

**`Review`** (Avis) — `authorId, rating (Int, 1 à 5), comment, isAnonymous (default true)`. Anonyme **par défaut**, contrairement aux signalements qui sont non-anonymes par défaut.

**`Message`** (Messagerie ciblée) — `senderId, receiverId, content, isRead (default false)`. Pas de notion de "conversation" comme table séparée : une conversation est reconstruite à la volée en groupant les messages par (expéditeur, destinataire) — voir 7.8.

**`AuditLog`** (Historique d'activité) — `actorId? (String, PAS de relation Prisma vers User — juste un id texte), action (String libre), targetId? (String), metadata? (Json), createdAt`. C'est la table de traçabilité : **chaque mutation importante ailleurs dans l'app y écrit une ligne**. Voir 5.4 pour le détail du pattern, et 7.11 pour la page qui l'affiche.
⚠️ Point d'attention (bug déjà rencontré) : comme `actorId` n'est qu'un champ texte et non une vraie relation Prisma, on ne peut PAS faire `include: { actor: ... }` dans une requête — il faut résoudre les noms via une requête `User.findMany({ where: { id: { in: [...] } } })` séparée. Voir 7.11 et 13 (journal, entrée du 23 sept.) pour le détail de ce bug et son correctif.

**`Notification`** (Phase 4, voir 7.15) — `userId` (destinataire, **vraie** relation Prisma vers `User`, contrairement à `AuditLog.actorId`), `type` (String, mêmes valeurs que `AuditLog.action`), `title`, `body?`, `link?`, `isRead` (default `false`), `createdAt`. Volontairement un modèle séparé d'`AuditLog` : une notification cible **un seul utilisateur** et représente un état lu/non lu pour lui, alors qu'`AuditLog` trace toutes les actions de l'organisation pour l'admin (traçabilité). `type` réutilise délibérément les mêmes chaînes que `AuditLog.action` (ex. `"REPORT_CREATED"`) pour réutiliser `actionCategory()`/`CATEGORY_ICONS` de `lib/activity-log.ts` côté affichage, sans dupliquer le mapping icône/catégorie.

### 4.3 Schéma complet (référence)

Le fichier `prisma/schema.prisma` fait ~360 lignes. Il contient tous les modèles ci-dessus, avec pour chacun les index (`@@index([organizationId])` quasi systématique) qui gardent les requêtes filtrées-par-tenant rapides. En cas de reconstruction, le fichier réel sur le projet fait foi — cette section en est le résumé explicatif, pas une copie ligne à ligne à resynchroniser manuellement.

### 4.4 Historique des migrations Prisma

```
20260917052536_init                              — schéma complet initial (quasi tous les modèles dès le départ)
20260922053135_add_announcement_attachments      — ajout du modèle AnnouncementAttachment
20260923021353_file_upload_direct_storage        — refonte de FileUpload (fileUrl -> data/mimeType/fileSize/category)
20260924______add_notifications                  — ajout du modèle Notification (Phase 4, 7.15) ; nom exact (horodatage)
                                                    à confirmer une fois `npx prisma migrate dev --name add_notifications`
                                                    exécuté localement — mettre à jour cette ligne à ce moment-là.
20260924______add_organization_invite_code       — ajout du champ Organization.inviteCode (7.18) ; nom exact (horodatage)
                                                    à confirmer une fois `npx prisma migrate dev --name add_organization_invite_code`
                                                    exécuté localement — mettre à jour cette ligne à ce moment-là.
```

Point important : **JobPosting, JobApplication, Message et Review existaient déjà dans le schéma initial** (`init`). Construire ces fonctionnalités plus tard n'a donc demandé AUCUNE migration — seulement du code applicatif (routes API + pages). Ne pas supposer qu'une nouvelle fonctionnalité = nouvelle migration : vérifier d'abord si le modèle existe déjà dans le schéma.

---

## 5. Architecture & patterns de sécurité

### 5.1 Isolation multi-tenant (la règle la plus importante du projet)

`organizationId` doit **toujours** venir du token de session signé côté serveur (`ctx.organizationId`, voir 5.2), **jamais** d'une donnée envoyée par le client (body JSON, query string, etc.). Chaque requête Prisma de lecture ou d'écriture doit filtrer par cet `organizationId`. C'est ce qui empêche l'Entreprise A de voir ou modifier les données de l'Entreprise B.

Deux niveaux de défense :
1. **`middleware.ts`** — bloque tout accès non authentifié à `/dashboard/*` et aux routes `/api/*` listées dans `matcher` (voir 5.6). Première barrière, grossière (authentifié ou non).
2. **`lib/session-guard.ts`** — vérifié dans CHAQUE route API et CHAQUE page serveur, indépendamment du middleware. Barrière fine (authentifié + bon rôle + bonne organisation).

### 5.2 `lib/session-guard.ts` — le cœur de la sécurité applicative

```typescript
export type AuthContext = {
  userId: string;
  organizationId: string;
  departmentId: string | null;
  role: Role;
};

export class UnauthorizedError extends Error {}
export class ForbiddenError extends Error {}

export async function requireAuth(): Promise<AuthContext> {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError("Non authentifié");
  const user = session.user as any;
  return {
    userId: user.id,
    organizationId: user.organizationId,
    departmentId: user.departmentId ?? null,
    role: user.role,
  };
}

export function requireRole(ctx: AuthContext, allowedRoles: Role[]): void {
  if (!allowedRoles.includes(ctx.role)) throw new ForbiddenError("Accès refusé pour ce rôle");
}

export function handleAuthError(error: unknown): Response | null {
  if (error instanceof UnauthorizedError) return Response.json({ error: error.message }, { status: 401 });
  if (error instanceof ForbiddenError) return Response.json({ error: error.message }, { status: 403 });
  return null;
}
```

**Le pattern à copier pour chaque route API** (répété tel quel dans les ~20 routes du projet) :

```typescript
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();               // étape 1 : authentifié ?
    requireRole(ctx, ADMIN_ROLES);                  // étape 2 : bon rôle ? (seulement si la route est restreinte)
    // étape 3 : la requête Prisma filtre TOUJOURS par ctx.organizationId, jamais par une valeur du body
    const result = await prisma.xxx.create({ data: { organizationId: ctx.organizationId, ... } });
    return Response.json({ result }, { status: 201 });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
```

Pour une page serveur (Server Component), le pattern équivalent redirige vers `/login` plutôt que de renvoyer un JSON 401 :

```typescript
let ctx;
try {
  ctx = await requireAuth();
} catch (error) {
  if (error instanceof UnauthorizedError) redirect("/login");
  throw error;
}
```

Et pour une page **entièrement réservée à l'admin** (contrairement aux pages où tout le monde voit une vue différente selon son rôle) :

```typescript
if (!ADMIN_ROLES.includes(ctx.role)) redirect("/dashboard");
```

(utilisé pour `/dashboard/activity`, voir 7.11).

### 5.3 Soft-delete des comptes utilisateurs

Un compte n'est **jamais supprimé** en base — `User.status` passe de `ACTIVE` à `DISABLED`. Raisons : traçabilité (l'historique des signalements/absences/messages d'un employé désactivé reste consultable), et pour ne pas casser les relations Prisma qui pointent vers cet utilisateur (`onDelete: Cascade` supprimerait tout son historique). Réservé à `ORG_ADMIN`/`SUPER_ADMIN` (pas `MANAGER`), et un admin ne peut pas se désactiver lui-même (vérifié explicitement dans `app/api/users/[id]/route.ts`).

### 5.4 Journal d'audit (`AuditLog`)

Chaque route qui modifie une donnée sensible écrit une ligne dans `AuditLog` juste après la mutation principale :

```typescript
await prisma.auditLog.create({
  data: {
    organizationId: ctx.organizationId,
    actorId: ctx.userId,
    action: "ANNOUNCEMENT_CREATED",   // constante en SCREAMING_SNAKE_CASE
    targetId: announcement.id,        // optionnel
    metadata: { count: 3 },           // optionnel, Json libre
  },
});
```

Liste complète des `action` utilisées aujourd'hui (voir `lib/activity-log.ts` pour le mapping vers des libellés français) :

`ANNOUNCEMENT_CREATED, ANNOUNCEMENT_DELETED, ANNOUNCEMENT_ATTACHMENT_ADDED, ANNOUNCEMENT_ATTACHMENT_DELETED, FILE_UPLOADED, FILE_DELETED, JOB_POSTING_CREATED, JOB_POSTING_CLOSED, JOB_POSTING_REOPENED, JOB_APPLICATION_SUBMITTED, JOB_APPLICATION_STATUS_UPDATED, REPORT_CREATED, REPORT_STATUS_UPDATED, ABSENCE_REQUESTED, ABSENCE_STATUS_UPDATED, MESSAGE_SENT, REVIEW_SUBMITTED, REVIEW_DELETED, USER_DISABLED, USER_REACTIVATED, USER_JOINED, USER_INVITE_CODE_REGENERATED`.

**Convention à respecter pour toute nouvelle fonctionnalité** : préfixer l'action par le nom du domaine (`XXX_`), c'est ce préfixe qui sert de catégorie de filtre dans la page Historique (`action.split("_")[0]`).

### 5.5 Pourquoi les fichiers sont stockés directement dans Postgres

Décision explicite du porteur du projet (pas un choix par défaut) : plutôt que S3/R2/Supabase Storage, les fichiers (pièces jointes d'annonces, documents partagés) sont stockés en base via une colonne `Bytes` (mappée sur `bytea` côté Postgres). Avantages : aucun service externe à configurer/payer, cohérent avec le reste (une seule base à sauvegarder). Contrepartie acceptée : adapté à des fichiers de quelques Mo, pas à du stockage massif — si le volume grossit beaucoup, ce choix pourra migrer vers un stockage externe sans changer le reste du code (seule la lecture/écriture du champ `data` changerait).

**Contrainte technique clé qui en découle** : Vercel limite le corps d'une requête à une Serverless Function Node.js à **4,5 Mo, fixe, non configurable, sur tous les plans**. D'où les constantes dans `lib/attachments.ts` :

```typescript
export const MAX_TOTAL_ATTACHMENTS_SIZE = 3.5 * 1024 * 1024; // 3,5 Mo au TOTAL par envoi (marge pour les en-têtes multipart)
export const MAX_ATTACHMENTS_PER_UPLOAD = 5;
export const ALLOWED_ATTACHMENT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
```

⚠️ Piège déjà rencontré et corrigé une fois : la limite doit porter sur le **total** des fichiers d'un même envoi, pas fichier-par-fichier (5 fichiers × 4 Mo chacun = 20 Mo, largement au-dessus de la limite Vercel). Toujours vérifier `files.reduce((sum, f) => sum + f.size, 0)` contre `MAX_TOTAL_ATTACHMENTS_SIZE`, en plus du nombre de fichiers.

Pattern de lecture/écriture (identique pour Annonces et Documents) :
- **Upload** : lire TOUS les octets de TOUS les fichiers (`Buffer.from(await file.arrayBuffer())`) AVANT d'écrire quoi que ce soit en base, puis créer toutes les lignes dans un seul `prisma.$transaction(...)` — pour ne jamais laisser une ligne partielle si un fichier pose problème en cours de route.
- **Liste** (GET) : ne **jamais** sélectionner la colonne `data` dans une liste — seulement les métadonnées (`id, fileName, fileType/mimeType, fileSize`).
- **Téléchargement** (GET par id) : renvoyer une `Response` brute avec le bon `Content-Type`, `Content-Length`, et `Content-Disposition: inline; filename="..."; filename*=UTF-8''...` (encodage RFC 5987 pour les noms de fichiers avec accents).

### 5.6 `middleware.ts`

```typescript
export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    if (req.nextUrl.pathname.startsWith("/dashboard/admin") && token?.role === "EMPLOYEE") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    return NextResponse.next();
  },
  { callbacks: { authorized: ({ token }) => !!token } }
);

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/api/reports/:path*",
    "/api/absences/:path*",
    "/api/announcements/:path*",
    "/api/files/:path*",
    "/api/jobs/:path*",
    "/api/messages/:path*",
    "/api/reviews/:path*",
    "/api/users/:path*",
    "/api/notifications/:path*",
    "/api/exports/:path*",
    "/api/organization/:path*",
  ],
};
```

**Règle à ne jamais oublier** : chaque fois qu'un nouveau groupe de routes `/api/xxx` est créé, il faut l'ajouter à `matcher`. C'était un oubli réel dans ce projet (corrigé le 23 sept. 2026, voir section 13) — `session-guard.ts` protégeait quand même ces routes en interne, donc ce n'était pas une brèche de sécurité, mais une incohérence de défense en profondeur.

### 5.7 Authentification (`lib/auth.ts`)

NextAuth avec `CredentialsProvider`. Trois champs à la connexion : **email + mot de passe + `organizationSlug`** (obligatoire, car l'email n'est unique que par organisation, pas globalement). Le slug est normalisé en minuscules des deux côtés (inscription ET connexion) — un vrai bug de connexion a été causé une fois par une différence de casse entre ce qui était stocké et ce qui était affiché dans les outils d'administration de la base.

`authorize()` : cherche l'organisation par `slug`, puis l'utilisateur par `(organizationId, email)`, vérifie `status === "ACTIVE"`, puis `bcrypt.compare`. Message d'erreur volontairement générique ("Identifiants invalides") dans tous les cas d'échec — ne jamais révéler si c'est l'entreprise, l'email ou le mot de passe qui est faux.

Callbacks `jwt`/`session` : au login, `role`, `organizationId`, `departmentId`, `id` sont gravés dans le token signé, puis recopiés vers `session.user` à chaque requête. C'est cette session (`getServerSession(authOptions)`) que lit `requireAuth()`.

Session JWT, durée de vie **8h** (`maxAge: 8 * 60 * 60`).

### 5.8 Design pattern des composants

- Les **Server Components** (`app/dashboard/xxx/page.tsx`) font directement la requête Prisma (pas d'appel API depuis le serveur vers lui-même) et passent les données déjà sérialisées (dates en `.toISOString()`) à un Client Component.
- Les **Client Components** (`"use client"`, dans `components/dashboard/`) gèrent l'interactivité : `fetch()` vers l'API, mise à jour optimiste de l'état local, puis `router.refresh()` pour resynchroniser avec le serveur. En cas d'échec de la requête, l'état optimiste est annulé (retour à l'état précédent).
- Convention de nommage : `XxxForm.tsx` pour la création, `XxxList.tsx` pour l'affichage/la gestion.

---

## 6. Structure des dossiers

```
mon-projet/
├── middleware.ts                  # barrière d'authentification (5.6)
├── public/
│   ├── manifest (servi par app/manifest.ts, pas un fichier statique ici)
│   ├── sw.js                       # service worker minimal (7.17)
│   ├── offline.html                 # page de secours hors-ligne, HTML statique (7.17)
│   ├── icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png  # icônes PWA (7.17)
│   └── favicon.ico, *.svg          # restes du boilerplate create-next-app, non utilisés
├── prisma/
│   ├── schema.prisma               # modèle de données complet (section 4)
│   ├── seed.ts                     # données de test (2 entreprises)
│   └── migrations/                 # historique des migrations (4.4)
├── lib/
│   ├── prisma.ts                   # singleton PrismaClient (évite d'épuiser le pool en dev)
│   ├── auth.ts                     # config NextAuth (5.7)
│   ├── session-guard.ts            # requireAuth/requireRole/handleAuthError (5.2)
│   ├── password.ts                 # hash/verify bcrypt + règle de robustesse
│   ├── slug.ts                     # slugify() pour les noms d'organisation
│   ├── attachments.ts              # constantes fichiers (5.5)
│   ├── activity-log.ts             # libellés/catégories du journal d'activité (7.11), réutilisé par 7.15 et 7.16
│   ├── notifications.ts            # notifyUser/notifyUsers/notifyRoles/notifyOrganization (7.15)
│   ├── csv.ts                      # toCsv() générique (7.16)
│   ├── pdf.ts                      # renderTablePdf() via pdfkit (7.16)
│   └── validations/auth.ts         # schémas zod (inscription/connexion)
├── app/
│   ├── layout.tsx                  # layout racine (métadonnées, manifest lié auto, <PwaRegister/>) — 7.17
│   ├── manifest.ts                 # manifest PWA, servi à /manifest.webmanifest (7.17)
│   ├── (auth)/                     # route group : layout à 2 colonnes, pages publiques
│   │   ├── layout.tsx
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── dashboard/                  # route group protégé (layout vérifie la session)
│   │   ├── layout.tsx              # sidebar + topbar, injecte le rôle pour le filtrage du menu
│   │   ├── page.tsx                # tableau de bord (encore un squelette, voir 11)
│   │   ├── employees/page.tsx
│   │   ├── departments/page.tsx
│   │   ├── reports/page.tsx
│   │   ├── absences/page.tsx
│   │   ├── announcements/page.tsx
│   │   ├── files/page.tsx          # "Documents"
│   │   ├── jobs/page.tsx           # "Postes ouverts"
│   │   ├── reviews/page.tsx        # "Avis"
│   │   ├── messages/page.tsx
│   │   ├── new-hires/page.tsx      # "Nouvelles recrues"
│   │   ├── activity/page.tsx       # "Historique", admin seulement
│   │   ├── notifications/page.tsx  # "Notifications" (7.15)
│   │   └── exports/page.tsx        # "Exports", admins/gérants (7.16)
│   └── api/
│       ├── auth/[...nextauth]/route.ts   # handler NextAuth
│       ├── auth/register/route.ts        # inscription entreprise + premier admin
│       ├── users/[id]/route.ts           # PATCH activer/désactiver
│       ├── reports/, absences/, announcements/, files/, jobs/, messages/, reviews/
│       │   → chacun avec route.ts (collection) et [id]/route.ts (élément), voir section 7
│       ├── notifications/route.ts, notifications/[id]/route.ts   # 7.15
│       └── exports/employees|absences|reports|activity/route.ts  # GET ?format=csv|pdf (7.16)
├── components/
│   ├── PwaRegister.tsx              # enregistre le service worker (7.17), monté dans app/layout.tsx
│   ├── auth/                       # FormField, LoginForm, RegisterForm, OrgIllustration
│   └── dashboard/                  # DashboardShell, Sidebar, Topbar, nav-items.ts, SignOutButton,
│                                    # + un Form/List par fonctionnalité (voir section 7)
```

---

## 7. Fonctionnalités — détail par domaine

Pour chaque fonctionnalité : qui y a accès, quelles routes API, quelles règles métier, et les décisions de design notables.

### Tableau récapitulatif des permissions

| Fonctionnalité | Tout le monde | MANAGER | ORG_ADMIN / SUPER_ADMIN |
|---|---|---|---|
| Employés (voir liste) | ✅ lecture | ✅ lecture | ✅ lecture + activer/désactiver |
| Départements | ✅ lecture | ✅ lecture | ✅ lecture |
| Signalements | ✅ créer (option anonyme) | ✅ + voir tous + changer statut | ✅ + voir tous + changer statut |
| Absences | ✅ créer + voir les siennes | ✅ + voir toutes + approuver/rejeter | ✅ + voir toutes + approuver/rejeter |
| Documents | ✅ lecture/téléchargement | ❌ | ✅ + téléverser/retirer |
| Annonces | ✅ lecture | ❌ | ✅ + publier/retirer + pièces jointes |
| Postes ouverts | ✅ lecture + postuler (1×/poste) | ❌ | ✅ + publier/fermer + gérer candidatures |
| Avis | ✅ créer + voir les siens | ❌ | ✅ + voir tous (jamais l'auteur si anonyme) + retirer |
| Messagerie | ✅ répondre seulement | ✅ + initier une conversation | ✅ + initier une conversation |
| Nouvelles recrues | ✅ lecture (mur d'accueil) | ✅ | ✅ |
| Historique d'activité | ❌ (page bloquée, redirection) | ❌ | ✅ seul rôle avec accès |
| Notifications | ✅ lecture + marquer comme lu (les siennes) | ✅ idem | ✅ idem |
| Export de rapports | ❌ (page bloquée, redirection) | ✅ Employés/Absences/Signalements | ✅ + Historique d'activité |
| Paramètres / Code d'invitation | ❌ (page bloquée, redirection) | ❌ (page bloquée, redirection) | ✅ seul rôle avec accès (voir/régénérer) |

### 7.1 Authentification & inscription (Phase 1)

- **`POST /api/auth/register`** : body `{ organizationName, firstName, lastName, email, password }` (validés par `registerSchema`, zod). Génère un `slug` unique à partir du nom d'entreprise (`slugify()` + suffixe numérique en cas de collision, jusqu'à 50 tentatives). Crée, **dans une seule transaction Prisma** : l'organisation, un département "Général" par défaut, et le premier utilisateur avec `role: ORG_ADMIN`. Pas de vérification de doublon d'email a priori (l'organisation n'existe pas encore) — la contrainte `@@unique([organizationId, email])` gère ça au niveau base si jamais.
- **Connexion** : `signIn("credentials", { organizationSlug, email, password, redirect: false })` côté client (`LoginForm.tsx`), qui appelle `authorize()` dans `lib/auth.ts` (voir 5.7).
- Pas encore de flux "mot de passe oublié" ni de vérification d'email.

### 7.2 Dashboard admin — squelette (Phase 1/2)

`app/dashboard/layout.tsx` vérifie la session (`getServerSession`), récupère le nom de l'organisation, et rend `DashboardShell` (sidebar + topbar responsive, menu mobile repliable). Depuis le 23 sept. 2026, le layout lit aussi le **rôle** de l'utilisateur et le transmet à `DashboardShell` → `Sidebar`, qui filtre les entrées de menu marquées `adminOnly: true` dans `components/dashboard/nav-items.ts` (utilisé pour cacher "Historique" aux non-admins).

### 7.3 Employés & Départements (Phase 2)

- `app/dashboard/employees/page.tsx` : liste triée par nom, avec département/rôle/statut/date d'embauche. `canManage = ADMIN_ROLES.includes(ctx.role)` (MANAGER exclu). Le bouton Activer/Désactiver appelle **`PATCH /api/users/[id]`** `{ status: "ACTIVE" | "DISABLED" }` — refuse si `id === ctx.userId` (impossible de se désactiver soi-même) et si le rôle n'est pas `ORG_ADMIN`/`SUPER_ADMIN`.
- `app/dashboard/departments/page.tsx` : lecture seule pour l'instant (liste + nombre d'employés par département via `_count`). Pas de création/édition de département depuis l'UI — seul le département "Général" créé à l'inscription existe, les autres viennent du seed ou de la base directement.

### 7.4 Signalements (Phase 1)

- **`POST /api/reports`** : tout utilisateur connecté. Body `{ title, description, isAnonymous }`. `isAnonymous` par défaut **`false`** (contrairement aux Avis, par défaut `true`).
- **`PATCH /api/reports/[id]`** : réservé à `["ORG_ADMIN", "MANAGER", "SUPER_ADMIN"]`. Body `{ status }` parmi `NEW/SEEN/IN_PROGRESS/RESOLVED`.
- Règle de confidentialité : un signalement anonyme masque son auteur **même pour l'admin/gérant** qui consulte la liste (le `submitter` est mis à `null` côté serveur avant sérialisation, jamais juste caché côté UI).
- Liste visible seulement par `ORG_ADMIN/MANAGER/SUPER_ADMIN` ; un simple employé ne voit que son propre formulaire de création, pas la liste.

### 7.5 Absences (Phase 1)

- **`POST /api/absences`** : tout utilisateur. Body `{ startDate, endDate, reason }`, validation `start <= end` et dates valides.
- **`PATCH /api/absences/[id]`** : réservé à `["ORG_ADMIN", "MANAGER", "SUPER_ADMIN"]`. Body `{ status: "APPROVED" | "REJECTED" }`.
- Visibilité : admin/gérant voient toutes les demandes de l'organisation ; un employé ne voit que les siennes (même logique `where` dupliquée entre la page serveur et la route API GET, volontairement — la page fait sa propre requête Prisma directe plutôt que d'appeler l'API interne).

### 7.6 Désactivation d'employé (Phase 2)

Voir 5.3 (soft-delete). Route : **`PATCH /api/users/[id]`**, réservé à `["ORG_ADMIN", "SUPER_ADMIN"]` (PAS `MANAGER` — seule exception dans le projet où un gérant a moins de droits qu'un admin sur une action de gestion RH). Log `USER_DISABLED` ou `USER_REACTIVATED`.

### 7.7 Annonces + pièces jointes (Phase 2)

- **`POST /api/announcements`** : admin only. Body `{ title, content }`.
- **`GET /api/announcements`** : tout le monde, inclut `author` et les métadonnées des pièces jointes (`{id, fileName, fileType, fileSize}`, jamais `data`).
- **`DELETE /api/announcements/[id]`** : admin only, cascade sur les pièces jointes.
- **`POST /api/announcements/[id]/attachments`** : admin only, upload multipart (`FormData`, champ `files`, plusieurs fichiers). Voir 5.5 pour les règles de taille/type/transaction.
- **`GET /api/announcements/[id]/attachments/[attachmentId]`** : tout le monde, stream le fichier.
- **`DELETE /api/announcements/[id]/attachments/[attachmentId]`** : admin only, retire un seul fichier sans supprimer l'annonce.
- Décision produit : pour une liste de présence hebdomadaire récurrente, **publier une nouvelle annonce chaque semaine** plutôt que d'éditer une annonce existante (plus simple, garde l'historique visible).

### 7.8 Messagerie ciblée (Phase 2)

Modèle "admin/gérant initie, l'employé répond seulement" :
- **`POST /api/messages`** : body `{ receiverId, content }`. Un `MANAGEMENT_ROLES` (`ORG_ADMIN/MANAGER/SUPER_ADMIN`) peut écrire à n'importe quel employé de son organisation. Un `EMPLOYEE` ne peut répondre **que** si une conversation a déjà été commencée par ce destinataire précis (vérifié par une requête `Message.findFirst` cherchant un message antérieur dans le sens inverse) — sinon `ForbiddenError`. Auto-message interdit.
- **`GET /api/messages/[counterpartId]`** : renvoie le fil complet bidirectionnel avec cette personne, et **marque comme lus** (`isRead: true`) les messages entrants non lus (effet de bord du GET, assumé).
- Page serveur (`app/dashboard/messages/page.tsx`) reconstruit les "conversations" en mémoire : regroupe tous les messages où l'utilisateur est expéditeur OU destinataire par `counterpart.id`, garde le plus récent comme aperçu, cumule un `unreadCount`.
- `MessagesShell.tsx` (client) : UI deux colonnes (liste des fils / fil ouvert), responsive (empile sur mobile avec bouton retour), Entrée pour envoyer, mise à jour optimiste.

### 7.9 Nouvelles recrues (Phase 2)

Page purement lecture, **visible par tous les employés** (pensée comme un "mur d'accueil", pas un outil admin — les mêmes infos sont déjà visibles sur la page Employés pour tout le monde). `app/dashboard/new-hires/page.tsx` : top 20 utilisateurs `ACTIVE` triés par `hireDate desc`, badge "🆕 Nouveau" si embauché il y a ≤ 30 jours (`NEW_BADGE_WINDOW_DAYS`).

### 7.10 Postes ouverts + candidatures (Phase 3)

- **`POST /api/jobs`** : admin only. Body `{ title, description }`.
- **`PATCH /api/jobs/[id]`** : admin only. Body `{ status: "OPEN" | "CLOSED" }` — jamais de suppression de poste (garde l'historique des candidatures qui y sont rattachées).
- **`POST /api/jobs/[id]/apply`** : tout utilisateur connecté. Vérifie que le poste est `OPEN`. Catch spécifique de l'erreur Prisma `P2002` (violation de la contrainte unique `[jobPostingId, applicantId]`) → message clair "Tu as déjà postulé à ce poste" (409) plutôt qu'une 500 générique.
- **`PATCH /api/jobs/[id]/applications/[applicationId]`** : admin only. Body `{ status }` parmi `RECEIVED/IN_REVIEW/ACCEPTED/REJECTED`.
- Page : admin voit toutes les candidatures par poste (avec sélecteur de statut inline) ; employé voit uniquement le statut de sa propre candidature (ou un bouton "Postuler" avec message de motivation facultatif si le poste est ouvert et qu'il n'a pas encore postulé).

### 7.11 Documents (Phase 3)

Miroir exact du pattern "Annonces + pièces jointes" (5.5), mais en fichiers autonomes (pas rattachés à un autre objet) :
- **`POST /api/files`** : admin only, upload multipart avec `category` (`schedule`/`policy`/`other`) et `weekLabel` optionnel (pertinent seulement pour `schedule`).
- **`GET /api/files`** : tout le monde, métadonnées seulement.
- **`GET /api/files/[id]`** : tout le monde, stream le fichier.
- **`DELETE /api/files/[id]`** : admin only.

### 7.12 Historique d'activité (Phase 3, ajouté au-delà de la roadmap initiale)

Page **réservée à l'admin** (`redirect("/dashboard")` pour tout le reste — la seule page du projet entièrement bloquée plutôt que partiellement adaptée par rôle). Affiche les 250 dernières lignes de `AuditLog` de l'organisation, avec filtres par catégorie (`lib/activity-log.ts` déduit la catégorie du préfixe de l'action, ex. `ANNOUNCEMENT_*` → "Annonces").

Comme `AuditLog.actorId` n'a pas de relation Prisma (juste un `String?`), la page résout les noms d'acteurs — et, pour certaines actions (`MESSAGE_SENT` → nom du destinataire dans `metadata.receiverId`, `USER_DISABLED/REACTIVATED` → nom de la cible dans `targetId`) — via **une seule requête groupée** `prisma.user.findMany({ where: { id: { in: [...] } } })`, jamais une requête par ligne. **Bug déjà rencontré une fois** : une première version utilisait `include: { actor: ... } }`, qui a planté (`PrismaClientValidationError`) car cette relation n'existe pas dans le schéma — corrigé le jour même (voir section 13).

### 7.13 Avis (Phase 3)

- **`POST /api/reviews`** : tout utilisateur. Body `{ rating (1-5), comment, isAnonymous }`. `isAnonymous` par défaut **`true`** (`isAnonymous !== false`, donc explicitement refuser l'anonymat est le seul moyen de signer son avis).
- **`GET /api/reviews`** : admin voit tous les avis de l'organisation ; employé ne voit que les siens. **Règle stricte : le nom de l'auteur n'est jamais renvoyé si `isAnonymous === true`, même à l'admin** (`author: review.isAnonymous ? null : review.author`).
- **`DELETE /api/reviews/[id]`** : admin only (modération de contenu inapproprié).
- Page admin affiche aussi la note moyenne (`reviews.reduce(...) / reviews.length`).

### 7.14 Tableau de bord / Statistiques (Phase 4)

`app/dashboard/page.tsx` — n'est plus un squelette texte (voir ancienne section 10) : vue d'ensemble chiffrée, en lecture seule (aucune route API, tout est lu directement par le Server Component via Prisma, comme les autres pages du projet).

Les cartes affichées suivent **exactement** le tableau de permissions ci-dessus, pas un rôle générique "admin" :
- **Tout le monde** (y compris `EMPLOYEE`) : Employés actifs, Nouvelles recrues (30 j), Postes ouverts, Documents partagés, Mes messages non lus, Mes absences en attente (personnelles, `userId: ctx.userId`) ; plus la liste des Annonces récentes et, si pas `MANAGEMENT_ROLES`, la liste des Postes ouverts récents.
- **`MANAGEMENT_ROLES` (`ORG_ADMIN`/`MANAGER`/`SUPER_ADMIN`)** : en plus, Signalements à traiter (statut `NEW`/`SEEN`/`IN_PROGRESS`) et Absences en attente **de toute l'organisation** — même accès que les pages Signalements/Absences elles-mêmes — plus un bloc "À traiter" avec liens directs.
- **`STRICT_ADMIN_ROLES` (`ORG_ADMIN`/`SUPER_ADMIN`, PAS `MANAGER`)** : en plus, Candidatures reçues (`JobApplication.status = RECEIVED`, filtré via la relation `jobPosting: { organizationId }` car ce modèle n'a pas de colonne `organizationId` directe), Note moyenne des avis (`Review.aggregate`), et un bloc "Activité récente" (6 dernières lignes d'`AuditLog`, même pattern de résolution des noms d'acteur que la page Historique, voir 7.12).

Aucune nouvelle route API, aucun nouveau modèle Prisma — uniquement des requêtes de lecture (`count`, `findMany`, `aggregate`) filtrées par `organizationId` (et par `userId` pour les cartes personnelles). Rien à ajouter à `middleware.ts` (pas de nouvelle route `/api/*`).

### 7.15 Notifications (Phase 4)

Alertes en app, personnelles (jamais visibles par un autre utilisateur, même dans la même organisation), déclenchées par les mêmes événements que ceux déjà tracés dans `AuditLog` — voir le nouveau modèle `Notification` en section 4.2.

**Génération (`lib/notifications.ts`)** : quatre fonctions, appelées juste après l'écriture dans `AuditLog` (jamais à sa place) dans chaque route concernée :
- `notifyUser(organizationId, userId, content)` — un seul destinataire.
- `notifyUsers(organizationId, userIds, content)` — plusieurs destinataires (`createMany`).
- `notifyRoles(organizationId, roles, content, excludeUserId?)` — tous les utilisateurs `ACTIVE` ayant l'un des rôles donnés ; `excludeUserId` sert à ne pas notifier l'auteur de l'action lui-même.
- `notifyOrganization(organizationId, content, excludeUserId?)` — diffusion à tous les employés `ACTIFS` de l'organisation.

**Événements déclencheurs** (fichier touché → qui est notifié → `type` utilisé, identique à l'action `AuditLog` correspondante) :
- `POST /api/reports` → `notifyRoles` sur `["ORG_ADMIN","MANAGER","SUPER_ADMIN"]` (exclut l'auteur) → `REPORT_CREATED`.
- `PATCH /api/reports/[id]` → `notifyUser` sur `submitterId` (même si le signalement est anonyme pour les autres : l'auteur sait déjà que c'est le sien) → `REPORT_STATUS_UPDATED`.
- `POST /api/absences` → `notifyRoles` sur les mêmes rôles → `ABSENCE_REQUESTED`.
- `PATCH /api/absences/[id]` → `notifyUser` sur `userId` de la demande → `ABSENCE_STATUS_UPDATED`.
- `POST /api/messages` → `notifyUser` sur `receiverId` → `MESSAGE_SENT`.
- `POST /api/jobs/[id]/apply` → `notifyRoles` sur `["ORG_ADMIN","SUPER_ADMIN"]` **uniquement** (pas `MANAGER` — même restriction que la gestion des candidatures elle-même) → `JOB_APPLICATION_SUBMITTED`.
- `PATCH /api/jobs/[id]/applications/[applicationId]` → `notifyUser` sur `applicantId` → `JOB_APPLICATION_STATUS_UPDATED`.
- `POST /api/announcements` → `notifyOrganization` (diffusion, exclut l'auteur) → `ANNOUNCEMENT_CREATED`.

Pas de notification pour les Documents, Postes ouverts (création), ou Avis — jugé secondaire pour cette première version ; à ajouter plus tard si le besoin se confirme (voir aussi section 10).

**Lecture (`GET /api/notifications`)** : les 50 dernières notifications de l'utilisateur connecté, toujours filtrées par `userId` **et** `organizationId` — personne ne peut lire celles d'un autre, même dans la même organisation.

**Marquer comme lu** : `PATCH /api/notifications/[id]` (une notification, `where` combine `id` + `userId` + `organizationId`, donc impossible de marquer comme lue la notification de quelqu'un d'autre même en devinant son id) et `POST /api/notifications` (toutes les non-lues de l'utilisateur — "Tout marquer comme lu").

**UI** : icône 🔔 dans `Topbar.tsx` avec badge (nombre de non-lues, calculé dans `app/dashboard/layout.tsx` via `prisma.notification.count(...)` et passé en prop à travers `DashboardShell`), lien vers `/dashboard/notifications`. Page dédiée avec `NotificationsList.tsx` (client, pattern optimiste identique à `ReportsList.tsx` — voir 5.8) : cliquer une notification la marque lue puis navigue vers son `link`, et appelle `router.refresh()` pour resynchroniser le badge du Topbar (Server Component re-exécuté).

⚠️ Choix assumé : pas d'email, uniquement en app. Pas de pagination au-delà des 50 dernières (assez pour ce stade). Aucune notification n'écrit dans `AuditLog` (et inversement) : ce sont deux mécanismes distincts avec des buts différents (traçabilité globale vs alerte personnelle), volontairement non fusionnés.

### 7.16 Export de rapports (Phase 4)

Page **`/dashboard/exports`**, réservée aux admins/gérants (`MANAGEMENT_ROLES` au niveau page — `redirect("/dashboard")` pour un `EMPLOYEE`, même pattern que 7.12). Quatre cartes (`ExportCard`), chacune avec deux boutons "Télécharger en CSV"/"Télécharger en PDF" qui sont de simples liens `<a href="/api/exports/xxx?format=csv|pdf">` (téléchargement direct par le navigateur, pas de fetch/JS) :
- **Employés** — `GET /api/exports/employees`, `MANAGEMENT_ROLES`. Nom, prénom, courriel, rôle, département, statut, date d'embauche, triés par nom.
- **Absences** — `GET /api/exports/absences`, `MANAGEMENT_ROLES`. Historique complet de l'organisation (pas seulement les siennes) : employé, dates, motif, statut, date de la demande.
- **Signalements** — `GET /api/exports/reports`, `MANAGEMENT_ROLES`. **Même règle de confidentialité que la page Signalements (7.4)** : un signalement anonyme reste anonyme dans l'export (`author: "Anonyme"`), y compris pour l'admin.
- **Historique d'activité** — `GET /api/exports/activity`, **`STRICT_ADMIN_ROLES` seulement** (pas `MANAGER`, même restriction que la page Historique elle-même, 7.12). Les 1000 dernières lignes d'`AuditLog` (`MAX_ENTRIES`), avec le même pattern de résolution des noms d'acteur (une requête groupée `User.findMany`) et les mêmes helpers `actionCategory`/`actionLabel`/`actionDetail`/`CATEGORY_LABELS` de `lib/activity-log.ts` que la page Historique — réutilisés, pas dupliqués. La 4ᵉ carte n'est affichée sur la page que si `STRICT_ADMIN_ROLES.includes(ctx.role)`.

**Génération des fichiers** (aucune route n'appelle l'autre — chaque route API construit ses `rows`/`columns` puis appelle directement l'un des deux helpers) :
- **CSV (`lib/csv.ts`)** : `toCsv(rows, columns)`, zéro dépendance externe. Échappe les champs contenant virgule/guillemet/retour à la ligne (`"..."` avec guillemets doublés), et préfixe la sortie d'un BOM UTF-8 (`﻿`) — sans ça, Excel (très probable ici vu l'usage RH) interprète mal les accents français.
- **PDF (`lib/pdf.ts`)** : `renderTablePdf({title, subtitle?, columns, rows})`, via le package **`pdfkit`** (nouvelle dépendance — pur JS, fonctionne en Serverless Vercel, contrairement à Puppeteer qui a besoin de Chromium). Tableau dessiné "à la main" (colonnes à largeur fixe en points, pas de plugin de mise en page automatique) avec pagination manuelle (`doc.addPage()` + ré-affichage de l'en-tête quand `y` dépasse le bas de page). Retourne un `Buffer` (les deux formats sont ensuite renvoyés via `new Response(buffer/string, { headers: { "Content-Disposition": 'attachment; filename="..."' } })`).

⚠️ **Nouvelle dépendance npm** : `pdfkit` (+ `@types/pdfkit` en dev). Pas encore installée au moment de la rédaction — voir section 13 pour la commande exacte à lancer avant de tester cette fonctionnalité.

Aucun nouveau modèle Prisma, aucun changement de schéma — uniquement des requêtes de lecture déjà utilisées ailleurs (Employés, Absences, Signalements, Historique), reformatées en CSV/PDF plutôt qu'en JSON pour une page.

### 7.17 PWA installable (Phase 4)

L'app peut être **installée** (icône sur l'écran d'accueil/bureau, ouverture en fenêtre autonome sans barre d'adresse) depuis Chrome/Edge (desktop et Android) et via "Partager → Sur l'écran d'accueil" sur iOS Safari. Accessible à **tout le monde** (pas une fonctionnalité liée à un rôle) — pas de nouvelle route API, pas de nouveau modèle Prisma, rien ajouté à `middleware.ts`.

**Pièces du puzzle :**
- **`app/manifest.ts`** — fichier de métadonnées Next.js (convention App Router), servi automatiquement à `/manifest.webmanifest` avec le `<link rel="manifest">` injecté dans le `<head>` sans rien à faire manuellement. `name`/`short_name` "Portail employé", `start_url: "/dashboard"` (un visiteur non connecté qui ouvre l'app installée est redirigé vers `/login` par le middleware, comme en navigateur normal), `display: "standalone"`, `theme_color: "#2F6F5E"` (vert du design system, 8).
- **Icônes** (`public/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`) — monogramme "PE" blanc sur fond vert `#2F6F5E`, générées pour ce projet (pas de logo existant). La variante *maskable* garde le glyphe dans la zone de sécurité centrale à 80 % (les OS Android appliquent leur propre découpe — cercle, squircle, etc. — sur cette version). `apple-touch-icon.png` est référencé séparément dans `app/layout.tsx` (`icons.apple`) car iOS ignore le manifest web et lit ce lien directement.
- **`app/layout.tsx`** (layout racine, jusque-là inchangé depuis `create-next-app`) — remplacement du titre/description `"Create Next App"` par les vraies métadonnées, `lang="en"` → `"fr"`, ajout de `viewport.themeColor` et de `metadata.appleWebApp`. Ce nettoyage était de toute façon en dette technique (section 10) ; fait ici car directement lié aux métadonnées PWA.
- **`components/PwaRegister.tsx`** — composant client minimal (`"use client"`, pas d'UI, juste un `useEffect` qui appelle `navigator.serviceWorker.register("/sw.js")`), monté dans `app/layout.tsx` donc actif sur tout le site. Échoue silencieusement si `serviceWorker` n'existe pas (vieux navigateurs) ou si l'enregistrement rate — la PWA est un bonus, jamais bloquant.
- **`public/sw.js`** — service worker **volontairement très limité**. Il ne met en cache QUE `offline.html` et les icônes à l'installation (`precache`). Il n'intercepte QUE les requêtes de navigation (`request.mode === "navigate"`) : réseau d'abord, et s'il échoue, affiche `offline.html` au lieu de l'écran d'erreur natif du navigateur. **Aucune page `/dashboard/*`, aucune route `/api/*`, `/login` ou `/register` n'est jamais mise en cache** — ce sont des pages dynamiques et propres à un utilisateur/une organisation (isolation multi-tenant, 5.1) ; les mettre en cache pourrait montrer les données d'un compte à la personne suivante sur un poste partagé.
- **`public/offline.html`** — page 100 % statique (HTML/CSS inline, aucune dépendance externe puisqu'elle doit s'afficher sans réseau), pas une route Next.js : un service worker ne peut pas déclencher un rendu serveur, donc le fallback hors-ligne doit être un fichier déjà en cache.

⚠️ **Choix assumé, à ne pas confondre avec une vraie PWA "offline-first"** : cette implémentation rend l'app **installable** et affiche un écran propre en cas de coupure réseau, mais **aucune donnée n'est consultable hors-ligne** (pas de synchronisation locale des signalements/absences/etc.). Si un vrai mode hors-ligne devient un besoin, ce sera un chantier séparé, plus lourd (stockage local, file d'attente de synchronisation).

### 7.18 Auto-inscription employé via code d'organisation (Phase 4)

Objectif : permettre à une entreprise cliente d'onboarder ses employés (potentiellement des centaines) sans que l'admin ait à créer chaque compte manuellement — décision produit explicite de l'utilisateur, à distinguer du modèle `Invitation` (10) qui reste, lui, non branché.

**Principe** : chaque organisation a **un seul code d'invitation partagé** (`Organization.inviteCode`, ex. `"XK7P-2QRT"`), régénérable par l'admin. N'importe quel employé qui connaît ce code peut créer son propre compte, **actif immédiatement** (pas d'étape d'approbation admin) — modèle "lien d'invitation Slack", décision explicite de l'utilisateur après question posée directement (le code d'invitation dédié plutôt que le `slug` public, et l'activation immédiate plutôt qu'une file d'attente à approuver).

- **`lib/invite-code.ts`** : `generateInviteCode()` (alphabet sans caractères ambigus — pas de `0/O/1/I/L` — format `"XXXX-XXXX"`) et `normalizeInviteCode(input)` (nettoie ce qu'un employé tape — espaces, minuscules, tiret oublié — vers exactement le format stocké en base, pour que la recherche par égalité fonctionne à tous les coups).
- **`GET /api/organization/invite-code`** et **`POST /api/organization/invite-code`** (régénère) : réservées à `["ORG_ADMIN", "SUPER_ADMIN"]` (pas `MANAGER` — même exception que 7.6). Génération paresseuse : une organisation créée avant cette fonctionnalité (donc `inviteCode` encore `null`) se voit attribuer un code au premier accès, sans migration de données à lancer manuellement. Régénérer invalide immédiatement l'ancien code (recherché par égalité stricte, donc plus jamais trouvé). Log `USER_INVITE_CODE_REGENERATED`.
- **`app/dashboard/settings/page.tsx`** (nouvelle page, réservée admin, même pattern de redirection totale que 7.12) + **`components/dashboard/InviteCodeCard.tsx`** (client) : affiche le code, bouton copier, bouton régénérer avec confirmation en deux temps (pas de `window.confirm()`, cohérent avec le reste de l'UI). `nav-items.ts` : entrée "Paramètres" ajoutée, `adminOnly: true`.
- **`POST /api/auth/join`** (route **publique**, comme `/api/auth/register` — volontairement absente de `middleware.ts`) : miroir de `/api/auth/register`, mais rattache le nouvel utilisateur à une organisation **existante** trouvée via `normalizeInviteCode()` plutôt que d'en créer une. Vérifie explicitement l'unicité `(organizationId, email)` (contrairement à `/register`, l'organisation existe déjà et peut déjà contenir cet email). Rattache au département "Général" s'il existe encore, sinon `departmentId: null` (assignable ensuite depuis Employés). Crée le `User` avec `role: EMPLOYEE, status: ACTIVE` directement — pas de statut intermédiaire "en attente". Log `USER_JOINED`, puis `notifyRoles` vers `["ORG_ADMIN","MANAGER","SUPER_ADMIN"]` (7.15).
- **`app/(auth)/join/page.tsx`** + **`components/auth/JoinForm.tsx`** : même famille que Login/Register (`FormField`, layout `(auth)`). Après un `POST /api/auth/join` réussi, le formulaire appelle directement `signIn("credentials", ...)` avec le `organizationSlug` renvoyé par l'API et les identifiants que la personne vient de choisir — connexion immédiate, sans repasser par `/login` où elle devrait retaper un identifiant d'entreprise qu'elle ne connaît pas (seul le code d'invitation lui a été communiqué). Liens croisés ajoutés sur `/login` et `/register` vers `/join`, et de `/join` vers `/register`.
- Aucune notion d'expiration ou de nombre d'utilisations maximum sur le code — volontairement simple pour cette première version (à réévaluer si un besoin de contrôle plus fin apparaît, voir section 10).

---

## 8. Design system

- Couleurs principales : `#1C2438` (marine, texte fort), `#2F6F5E` (vert, accent/boutons primaires), `#E2E4E9` (bordures), `#F7F8FA` (fond), `#5B6478` (texte atténué), `#9AA1B2` (texte très atténué), `#8A3B3B`/`#FDECEC` (erreur/destructif, texte/fond), `#E7F3EF` (fond vert clair, succès/actif).
- Typographie : `Fraunces` (variable `--font-display`) pour les titres, `Inter` (variable `--font-body`) pour le texte courant. Chargées via `next/font/google` dans les layouts (`(auth)/layout.tsx` et `dashboard/layout.tsx` — dupliqué dans les deux, jamais factorisé dans un layout racine commun).
- Composants de liste : cartes blanches (`bg-white`) à bordure `#E2E4E9`, badges de statut en pilule (`rounded-full`) avec couleur de fond pâle + texte foncé de la même teinte.

---

## 9. Limites connues et contraintes techniques

- **Corps de requête Vercel : 4,5 Mo max, fixe.** → limite applicative de 3,5 Mo au total par envoi de fichiers (voir 5.5).
- **Types de fichiers acceptés** (annonces + documents) : PDF, JPG, JPEG, PNG, WEBP uniquement.
- Session NextAuth : 8h, JWT (pas de session base de données).
- Pas de rate-limiting sur les routes API (aucune protection contre le brute-force sur `/api/auth` au-delà de ce que fournit NextAuth par défaut).
- Pas de validation zod côté serveur sur toutes les routes (certaines, comme `/api/reports` ou `/api/absences`, valident "à la main" plutôt qu'avec un schéma zod comme le fait `/api/auth/register` — incohérence mineure, pas un risque de sécurité vu que les champs sont simples).

---

## 10. Ce qui existe mais n'est pas branché (dette technique connue)

- **`Invitation` (modèle Prisma)** : table prête (`email, role, token, expiresAt, acceptedAt`) mais **aucune route API ni page ne l'utilise**. Depuis le 24 sept. 2026, l'onboarding employé réel passe par un mécanisme différent et plus simple : le code d'invitation partagé par organisation (`Organization.inviteCode`, voir 7.18) — pas de token nominatif par email. `Invitation` resterait pertinent pour un besoin différent (inviter UNE personne précise par email, avec expiration) si ce besoin se confirme un jour ; à ne pas confondre avec 7.18.
- **Code d'invitation (7.18) sans expiration ni limite d'utilisation** : n'importe qui en possession du code peut créer un compte, indéfiniment, jusqu'à régénération manuelle par l'admin. Acceptable pour la première version (décision explicite de l'utilisateur : simplicité avant tout) ; à réévaluer si un contrôle plus fin (expiration, nombre d'usages, codes à usage unique) devient nécessaire.
- **Rôle `SUPER_ADMIN`** : existe dans l'enum et dans toutes les vérifications de rôle admin, mais il n'y a pas d'interface dédiée pour gérer plusieurs organisations clientes à la fois (facturation, etc. — Phase 4).
- **Notifications (7.15)** : pas d'email, pas de notifications pour Documents/Postes ouverts (création)/Avis — à réévaluer si le besoin se confirme à l'usage.
- **Polices Geist par défaut sur `app/layout.tsx`** : jamais remplacées par Fraunces/Inter (chargées séparément dans `(auth)/layout.tsx` et `dashboard/layout.tsx`, voir 8) — sans impact visible puisque ces classes de police ne sont utilisées nulle part dans l'app, mais à nettoyer un jour par hygiène.
- **Validation zod partielle** : voir section 9.

---

## 11. Pour reconstruire ce projet à partir de zéro

Ordre exact suivi (et à suivre en cas de reconstruction complète) :

1. **`create-next-app`** avec TypeScript + Tailwind CSS 4 + App Router.
2. Installer les dépendances : `@prisma/client`, `prisma`, `next-auth`, `bcryptjs`, `zod` (voir section 2 pour les versions).
3. Écrire **`prisma/schema.prisma`** en entier dès le départ (section 4) — dans ce projet, presque tous les modèles (y compris ceux des phases 2/3) existaient déjà dans la toute première migration `init`. C'est un choix délibéré : penser le modèle de données complet avant de coder les fonctionnalités évite des migrations douloureuses plus tard.
4. `npx prisma migrate dev --name init`, puis `lib/prisma.ts` (singleton).
5. `lib/password.ts` (bcrypt), `lib/slug.ts`, `lib/validations/auth.ts` (zod).
6. `lib/auth.ts` (NextAuth Credentials + callbacks jwt/session) et `app/api/auth/[...nextauth]/route.ts`.
7. `lib/session-guard.ts` (le pattern central, section 5.2) — l'écrire tôt, tout le reste en dépend.
8. `middleware.ts` (section 5.6) — **penser à lister CHAQUE nouveau groupe de routes API au fur et à mesure**, c'est l'erreur déjà commise une fois dans ce projet.
9. Pages `(auth)` : layout à 2 colonnes, `register`/`login` + leurs formulaires + `app/api/auth/register/route.ts`.
10. `app/dashboard/layout.tsx` (vérifie la session, lit le rôle, rend `DashboardShell`), `DashboardShell`/`Sidebar`/`Topbar`/`nav-items.ts`.
11. Fonctionnalités Phase 1 : Employés (lecture), Départements (lecture), Signalements, Absences (chacune : route(s) API + page serveur + Form/List client — copier le pattern section 5.2/5.8).
12. Désactivation d'employé (`PATCH /api/users/[id]`).
13. `lib/attachments.ts` (constantes, section 5.5) puis Annonces + pièces jointes (le pattern de stockage-en-base à répliquer pour toute fonctionnalité fichiers future).
14. Messagerie ciblée, Nouvelles recrues.
15. Postes ouverts + candidatures, Documents (réutilise `lib/attachments.ts`), Avis.
16. `lib/activity-log.ts` + page Historique — en dernier, car elle a besoin que les autres fonctionnalités écrivent déjà dans `AuditLog` pour avoir quelque chose à afficher.
17. `prisma/seed.ts` pour des données de test (2 entreprises, comme dans ce projet) — utile dès l'étape 11 en pratique, listé ici en dernier seulement parce que ce n'est pas une dépendance stricte.

À chaque étape : écrire la route API en suivant strictement le pattern à 3 étapes (5.2), vérifier la syntaxe TypeScript, puis la page/composant qui la consomme.

---

## 12. Comment ce document doit être maintenu

Ce fichier vit **avec le code**, dans le dossier du projet (`AUDIT.md` à la racine), pas comme un document séparé. Après chaque tâche future :
1. Ajouter une entrée au journal (section 13) : date, ce qui a été fait, pourquoi, fichiers touchés.
2. Si un nouveau modèle Prisma est ajouté/modifié → mettre à jour la section 4.
3. Si une nouvelle route API est ajoutée → l'ajouter à `middleware.ts` (5.6) ET à la section 7 correspondante.
4. Si une nouvelle fonctionnalité est ajoutée → lui donner une sous-section en section 7 et une ligne dans le tableau de permissions.
5. Ne jamais réécrire les entrées passées du journal — seulement corriger une erreur factuelle si on la découvre, en le signalant explicitement.

---

## 13. Journal des mises à jour

### 23 septembre 2026
- Rédaction de cet audit complet (Phases 1 à 3), à la demande explicite de l'utilisateur, avant d'attaquer la Phase 4.
- **Correctif de sécurité/cohérence** : `middleware.ts` ne listait pas `/api/jobs`, `/api/messages`, `/api/reviews`, `/api/users` dans son `matcher` — ajouté. Chaque route restait protégée en interne par `session-guard.ts`, donc ce n'était pas une brèche, mais une incohérence de défense en profondeur découverte en documentant la section 5.6.
- Écarts documentés (dette technique, section 10) : modèle `Invitation` jamais branché à une UI, `app/dashboard/page.tsx` toujours un squelette, `app/page.tsx`/`app/layout.tsx` racine encore le boilerplate `create-next-app`.

### 24 septembre 2026
- **Phase 4 démarrée : Tableau de bord / Statistiques** (voir 7.14). `app/dashboard/page.tsx` transformé du squelette texte en vue d'ensemble chiffrée, avec des cartes filtrées par rôle en suivant exactement le tableau de permissions (section 7) — pas de nouvelle route API, pas de nouveau modèle Prisma, uniquement des requêtes de lecture (`count`/`findMany`/`aggregate`) filtrées par `organizationId`/`userId`.
- Fichier touché : `app/dashboard/page.tsx` (seul fichier modifié — réutilise `lib/session-guard.ts` et `lib/activity-log.ts` existants sans les modifier).
- Dette technique (section 10) mise à jour : la ligne sur `app/dashboard/page.tsx` retirée puisque résolue. Reste : `Invitation` jamais branché à une UI, `app/page.tsx`/`app/layout.tsx` racine encore le boilerplate `create-next-app`, rôle `SUPER_ADMIN` sans interface dédiée multi-organisations.
- **Phase 4 : Notifications** (voir 7.15). Nouveau modèle Prisma `Notification` (relations ajoutées sur `User` et `Organization`) — **migration à exécuter localement** : `npx prisma migrate dev --name add_notifications` (pas encore lancée au moment de la rédaction de cette entrée ; mettre à jour la ligne de la section 4.4 avec le nom exact du dossier de migration une fois fait). Nouveau fichier `lib/notifications.ts` (notifyUser/notifyUsers/notifyRoles/notifyOrganization). Notifications déclenchées dans `app/api/reports/route.ts`, `reports/[id]/route.ts`, `absences/route.ts`, `absences/[id]/route.ts`, `messages/route.ts`, `jobs/[id]/apply/route.ts`, `jobs/[id]/applications/[applicationId]/route.ts`, `announcements/route.ts`. Nouvelles routes `app/api/notifications/route.ts` (GET liste + POST tout marquer lu) et `app/api/notifications/[id]/route.ts` (PATCH marquer lu/non lu), ajoutées à `middleware.ts`. Nouvelle page `app/dashboard/notifications/page.tsx` + `components/dashboard/NotificationsList.tsx` (pattern optimiste identique à `ReportsList.tsx`). `Topbar.tsx`/`DashboardShell.tsx`/`app/dashboard/layout.tsx` modifiés pour afficher le badge de notifications non lues (🔔). `nav-items.ts` : entrée "Notifications" ajoutée.
- **Phase 4 : Export de rapports** (voir 7.16). Nouvelle page `app/dashboard/exports/page.tsx` (Employés/Absences/Signalements pour `MANAGEMENT_ROLES`, + Historique d'activité pour `STRICT_ADMIN_ROLES` seulement). Nouveaux fichiers `lib/csv.ts` (`toCsv()`, zéro dépendance) et `lib/pdf.ts` (`renderTablePdf()`, via **`pdfkit`** — nouvelle dépendance npm). Nouvelles routes `app/api/exports/employees|absences|reports|activity/route.ts` (`GET ?format=csv|pdf`), ajoutées à `middleware.ts`. `components/dashboard/Sidebar.tsx` : nouveau filtre `managementOnly` (en plus de `adminOnly` existant) ; `nav-items.ts` : entrée "Exports" ajoutée avec `managementOnly: true`. Aucun changement de schéma Prisma. **Action requise avant de tester** : `npm install pdfkit` puis `npm install --save-dev @types/pdfkit`.
- **Phase 4 : PWA installable** (voir 7.17). Nouveau `app/manifest.ts` (metadata route Next.js → `/manifest.webmanifest`), nouvelles icônes `public/icon-192.png`/`icon-512.png`/`icon-maskable-512.png`/`apple-touch-icon.png` (monogramme "PE" généré, vert `#2F6F5E`), nouveau service worker `public/sw.js` (précache uniquement `offline.html` + icônes, intercepte seulement les navigations pour un fallback hors-ligne — ne met jamais en cache `/dashboard/*`/`/api/*` par souci d'isolation multi-tenant, voir 5.1) et `public/offline.html` (page statique). Nouveau composant `components/PwaRegister.tsx` (enregistre le service worker). `app/layout.tsx` nettoyé au passage (titre/description/`lang` réels au lieu du boilerplate `create-next-app`, `viewport.themeColor`, `appleWebApp`) — dette technique section 10 mise à jour en conséquence. Aucun changement de schéma Prisma, aucune route API, rien à ajouter à `middleware.ts`.
- Reste en Phase 4 : facturation.
- **Correctif hors-phase** : `app/page.tsx` (racine `/`) affichait encore la page d'accueil par défaut de `create-next-app` — un utilisateur qui atterrissait sur `/` (au lieu de `/login`/`/dashboard`) tombait dessus, source de confusion. Remplacé par un simple `redirect("/dashboard")` (qui lui-même renvoie vers `/login` si non connecté, via le middleware). Dette technique (section 10) mise à jour : il ne reste que les polices Geist par défaut, jamais remplacées, dans `app/layout.tsx`.
- **Bug corrigé (texte illisible dans les champs de saisie sur poste en mode sombre)** : `app/globals.css` contenait encore le bloc `@media (prefers-color-scheme: dark)` par défaut de `create-next-app`, qui bascule `--foreground` (couleur de texte héritée par `body`) vers un gris quasi blanc (`#ededed`) quand le système d'exploitation est en mode sombre. Aucun `<input>`/`<textarea>`/`<select>` du projet (tous dans `components/dashboard/*Form.tsx` et `MessagesShell.tsx`) ne fixe explicitement sa propre couleur de texte — ils héritent donc tous de `body`, d'où un texte saisi presque invisible (gris clair sur fond blanc) pour n'importe quel utilisateur en mode sombre, repéré dans le champ de message de `/dashboard/messages` mais touchant en réalité **tous** les formulaires de l'app. Corrigé à la racine : suppression du bloc `prefers-color-scheme: dark` et ajout de `color-scheme: light` sur `:root` (l'app n'a jamais eu de thème sombre conçu — toutes ses couleurs sont des hex codés en dur, voir section 8 — donc ce bloc n'avait pas lieu d'exister). Un seul fichier touché, corrige tous les formulaires d'un coup plutôt qu'un correctif au cas par cas sur chaque champ.
- **Refonte esthétique lancée (voir section 14)** : à la demande explicite de l'utilisateur ("ça parait un peu trop classique, avec les emojis on dirait directement que c'est une IA"), démarrage d'une passe visuelle complète — nouvelle dépendance `lucide-react` (icônes SVG en remplacement des emojis), fondations d'animation dans `app/globals.css`, puis application à l'écran de connexion/inscription, au menu latéral et au tableau de bord. Approche validée par l'utilisateur : par étapes, avec confirmation avant de continuer sur le reste de l'app.
- **Étape 1 validée par l'utilisateur, logo réel intégré** : l'utilisateur a validé la direction visuelle et fourni le vrai logo "Mindmate Compagny" (monogramme "DN"). Badge texte "PE" remplacé par ce logo (`public/logo-mark-white.png`) dans `app/(auth)/layout.tsx` et `DashboardShell.tsx` ; icônes PWA régénérées avec ce même monogramme sur fond vert de marque (voir 14, "Logo réel"). Poursuite de la refonte sur le reste de l'app en cours.
- **Refonte esthétique terminée sur l'ensemble de l'app** (voir section 14) : après le logo, tous les écrans restants sont passés — Employés, Départements, Nouvelles recrues, Signalements, Absences, Documents, Annonces, Postes ouverts, Avis, Messages, Notifications, Historique, Exports. Dernier dictionnaire d'emojis du projet (`CATEGORY_ICONS` dans `lib/activity-log.ts`) supprimé au profit du composant `CategoryIcon` (icônes `lucide-react`). Purement visuel de bout en bout : aucun changement de schéma Prisma, de route API, ni de `middleware.ts` sur l'ensemble de cette passe. Reste à faire côté utilisateur : `npm install lucide-react` (toujours pas fait à ce stade) puis valider le rendu sur l'ensemble des écrans.
- **Discussion stratégie commerciale** (pas de code) : questions posées par l'utilisateur sur la vente de l'application à des entreprises clientes, l'onboarding de leurs employés, le déploiement, et les modèles de tarification courants pour ce type de logiciel. Conclusion actionnable : construire l'auto-inscription par code d'organisation en priorité, avant le déploiement et la facturation.
- **Phase 4 : Auto-inscription employé via code d'organisation** (voir 7.18), à la demande explicite de l'utilisateur, avec deux décisions de design confirmées par lui après question directe : (1) un code d'invitation dédié et régénérable, distinct du `slug` public de l'organisation ; (2) activation immédiate du compte employé, sans approbation admin. Nouveau champ Prisma `Organization.inviteCode` (`String? @unique`) — **migration à exécuter localement** : `npx prisma migrate dev --name add_organization_invite_code` (pas encore lancée au moment de la rédaction ; mettre à jour la ligne de la section 4.4 avec le nom exact une fois fait). Nouveau fichier `lib/invite-code.ts` (génération/normalisation du code). Nouvelles routes `GET`/`POST /api/organization/invite-code` (voir/régénérer, admin only), ajoutées à `middleware.ts`. Nouvelle route publique `POST /api/auth/join` (volontairement absente de `middleware.ts`, comme `/api/auth/register`). Nouvelle page admin `app/dashboard/settings/page.tsx` + `components/dashboard/InviteCodeCard.tsx` ; `nav-items.ts` : entrée "Paramètres" ajoutée (`adminOnly: true`). Nouvelle page publique `app/(auth)/join/page.tsx` + `components/auth/JoinForm.tsx` (connexion automatique après inscription, voir 7.18) ; liens croisés ajoutés sur `/login` et `/register`. `lib/activity-log.ts` : deux actions ajoutées (`USER_JOINED`, `USER_INVITE_CODE_REGENERATED`), catégorisées "Employés" comme le reste des actions `USER_*`. Notification (7.15) déclenchée vers les admins/gérants à chaque nouvelle auto-inscription.

---

## 14. Refonte esthétique (en cours)

### Contexte

L'utilisateur a jugé le rendu visuel de l'app "trop classique", avec des emojis qui trahissent immédiatement une interface générée par IA, et a demandé une passe complète : couleurs, frontend, animations — au point qu'un humain qui voit l'app dise "wow". Vu l'ampleur (~20 écrans), l'approche retenue avec l'utilisateur est **itérative** : poser les fondations visuelles et les appliquer d'abord aux écrans les plus visibles (connexion/inscription, menu, tableau de bord), obtenir sa validation, **puis seulement** dérouler le même traitement sur le reste de l'app. Ne pas dérouler plus loin sans confirmation explicite de l'utilisateur sur cette première étape.

**Nouvelle dépendance npm requise** : `lucide-react` (bibliothèque d'icônes SVG légère, remplace les emojis). **Pas encore installée** — action requise avant de tester : `npm install lucide-react`.

### Fondations (`app/globals.css`)

Nouveau bloc d'animations et utilitaires ajouté à la fin du fichier (n'affecte rien d'existant) :
- Keyframes : `fade-in-up`, `fade-in`, `scale-in`, `pulse-soft`, `float-blob`/`float-blob-alt` (fonds animés flottants), `shimmer` (effet chargement), `draw-line` (tracé de trait SVG).
- Classes utilitaires : `.animate-fade-in-up`, `.animate-fade-in`, `.animate-scale-in`, `.animate-pulse-soft`, `.animate-float-blob(-alt)`, `.shimmer-bg`, `.stagger-1` à `.stagger-10` (délais d'apparition échelonnés pour les listes/grilles de cartes).
- Scrollbar personnalisée (`::-webkit-scrollbar`).
- `@media (prefers-reduced-motion: reduce)` : désactive toutes les animations pour les utilisateurs qui le demandent au niveau système (accessibilité).

### Écrans traités

**Connexion / Inscription** (`app/(auth)/layout.tsx`, `login/page.tsx`, `register/page.tsx`, `components/auth/*`) :
- Colonne latérale : dégradé sombre (`from-[#1C2438] via-[#1A3129] to-[#1F4A3D]`) avec deux formes floues animées en fond (`animate-float-blob`/`-alt`), badge logo "PE", texte avec apparition échelonnée (`animate-fade-in-up` + `stagger-*`).
- `components/auth/OrgIllustration.tsx` réécrit : illustration SVG dont les traits se dessinent à l'ouverture (technique `pathLength={1}` + `strokeDasharray`/`strokeDashoffset` + keyframe `draw-line`, fonctionne quelle que soit la longueur réelle du tracé), nœuds qui apparaissent en cascade (`animate-scale-in`).
- `components/auth/FormField.tsx` : nouvelle prop `icon` (icône Lucide positionnée dans le champ), coins arrondis, anneau de focus vert doux, transition au survol.
- `LoginForm.tsx`/`RegisterForm.tsx` : icônes Lucide (`Building2`, `Mail`, `Lock`, `User`) dans chaque champ, bouton de soumission en dégradé vert avec effet de survol (léger soulèvement + ombre) et icône `Loader2` animée pendant l'envoi.
- Zone principale (formulaire) : fond en dégradé radial doux au lieu d'un blanc plat.

**Menu latéral / structure du tableau de bord** (`components/dashboard/Sidebar.tsx`, `Topbar.tsx`, `DashboardShell.tsx`, `nav-items.ts`) :
- `nav-items.ts` : chaque entrée porte maintenant une icône Lucide (`icon: LucideIcon`) au lieu de rien — 14 icônes importées (Bell, Briefcase, Building2, CalendarDays, Download, FileText, Flag, History, LayoutDashboard, Megaphone, MessageSquare, Star, UserPlus, Users).
- `Sidebar.tsx` : rendu de l'icône par entrée, item actif en dégradé vert avec ombre portée, léger décalage au survol.
- `Topbar.tsx` : cloche 🔔 remplacée par l'icône Lucide `Bell` (badge non-lus avec `animate-pulse-soft`), menu hamburger remplacé par l'icône `Menu`, ajout d'un avatar rond avec initiales (`initialsFrom()`), en-tête en verre dépoli (`bg-white/90 backdrop-blur-sm`).
- `DashboardShell.tsx` : aside en dégradé avec ombre, badge logo (voir "Logo réel" ci-dessous), overlay mobile avec fondu + flou.

**Tableau de bord** (`app/dashboard/page.tsx`) :
- `StatCard` réécrit : icône Lucide + teinte de badge douce (`TINTS` : vert/ambre/bleu/rouge/violet) + délai d'apparition échelonné, au lieu du texte/emoji brut précédent.
- Nouveau composant `components/dashboard/CategoryIcon.tsx` : associe chaque `ActivityCategory` (de `lib/activity-log.ts`) à une icône Lucide, pour remplacer `CATEGORY_ICONS` (emojis) **sans toucher** à `lib/activity-log.ts` lui-même. Utilisé dans "Activité récente".
- Liens "Voir tout →" avec icône `ArrowRight` animée au survol.

### Logo réel (remplace le monogramme temporaire "PE")

L'utilisateur a fourni le vrai logo "Mindmate Compagny" (monogramme "DN" stylisé + wordmark). Traité en plusieurs assets à partir de l'image fournie (recadrage automatique du monogramme, séparation du wordmark, génération des variantes de couleur) :
- `public/logo-mark-white.png` : monogramme blanc, fond transparent — utilisé dans les badges sur fonds sombres (`app/(auth)/layout.tsx`, `DashboardShell.tsx`), à la place du badge texte "PE".
- `public/logo-mark-black.png` : monogramme noir, fond transparent — réservé pour un usage futur sur fond clair (pas encore utilisé dans l'UI).
- Icônes PWA régénérées avec le même monogramme (blanc) sur fond vert de marque `#2F6F5E`, mêmes noms de fichiers qu'avant donc **aucun changement de code requis** dans `app/manifest.ts`/`app/layout.tsx` : `public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-512.png` (marge de sécurité plus généreuse pour le "maskable"), `public/apple-touch-icon.png`.

Fichiers de code modifiés : `app/(auth)/layout.tsx` et `components/dashboard/DashboardShell.tsx` — le badge `<span>PE</span>` est remplacé par `<img src="/logo-mark-white.png" .../>`, le texte "Portail employé" à côté est conservé tel quel.

### Suite de la refonte : Employés, Départements, Nouvelles recrues

Direction validée par l'utilisateur, poursuite immédiate sur le reste de l'app. Pattern d'en-tête standardisé et réutilisé sur tous les écrans suivants : badge icône teinté (couleur différente par écran, cohérente avec `TINTS` du tableau de bord) + titre + description, le tout en `animate-fade-in-up` ; cartes/lignes en `rounded-xl` + `shadow-sm` (au lieu de `rounded-lg` sans ombre) ; apparition échelonnée par ligne/carte via un `style={{ animationDelay: ... }}` inline (delay = index × 0.04s, plafonné à 10) plutôt que les classes `.stagger-*` (plus pratique pour des listes de longueur variable venues du serveur).

- **Employés** (`app/dashboard/employees/page.tsx`, `EmployeesTable.tsx`) : badge icône `Users` (teinte verte), avatar en dégradé avec initiales par ligne (comme `Topbar.tsx`), badge de statut avec icône (`CheckCircle2`/`XCircle`), boutons Désactiver/Réactiver avec icône (`UserX`/`CheckCircle2`).
- **Départements** (`app/dashboard/departments/page.tsx`) : badge icône `Building2` (teinte bleue) répété sur chaque carte, cartes avec ombre qui s'accentue au survol.
- **Nouvelles recrues** (`app/dashboard/new-hires/page.tsx`) : badge icône `PartyPopper` (teinte violette), avatar en dégradé (au lieu d'un aplat), badge "Nouveau" avec icône `Sparkles`.

### Suite de la refonte : Signalements, Absences

- **Signalements** (`app/dashboard/reports/page.tsx`, `ReportForm.tsx`, `ReportsList.tsx`) : badge icône `Flag` (teinte rouge). Formulaire : champs avec anneau de focus (`focus:ring-4 focus:ring-[#2F6F5E]/12`), bouton d'envoi en dégradé avec icône `Send`/`Loader2` (identique au pattern des formulaires d'authentification), messages de succès/erreur avec icône (`CheckCircle2`/`AlertCircle`). Liste : badge de statut avec icône par statut (`CircleDot`/`Eye`/`Clock3`/`Flag`).
- **Absences** (`app/dashboard/absences/page.tsx`, `AbsenceForm.tsx`, `AbsencesList.tsx`) : badge icône `CalendarDays` (teinte ambre), même traitement de formulaire que Signalements, badge de statut avec icône (`Clock3`/`CheckCircle2`/`XCircle`), boutons Approuver/Rejeter avec icône.

Aucun changement de logique métier, de route API ou de schéma Prisma dans ce lot — uniquement du JSX/CSS et l'ajout d'icônes `lucide-react`. Vérifié par compilation TypeScript isolée (voir méthode section 12) : seules les catégories de bruit d'environnement déjà connues (modules introuvables faute de `node_modules`, `any` implicites en cascade) sont apparues, y compris une nouvelle catégorie `TS7053` (indexation d'un `Record<...>` par une clé `any`) confirmée comme du bruit en la retrouvant à l'identique sur `ActivityLogList.tsx`, fichier existant non modifié.

### Suite de la refonte : Documents, Annonces, Postes ouverts, Avis

- **Documents** (`app/dashboard/files/page.tsx`, `FilesList.tsx`, `FileUploadForm.tsx`) : badge icône `FileText` (teinte grise). **Emojis retirés** (📄/🖼️/📎 → icônes Lucide `FileText`/`Image`/`Paperclip` selon le type MIME), bouton de téléversement avec icône `Upload`/`Loader2`.
- **Annonces** (`app/dashboard/announcements/page.tsx`, `AnnouncementsList.tsx`, `AnnouncementForm.tsx`) : badge icône `Megaphone` (teinte ambre). **Emojis retirés** (même logique que Documents pour les pièces jointes), bouton de publication avec icône `Megaphone`/`Loader2`.
- **Postes ouverts** (`app/dashboard/jobs/page.tsx`, `JobPostingForm.tsx`, `JobPostingsList.tsx`) : badge icône `Briefcase` (teinte bleue). Statuts de candidature avec icône (`Inbox`/`Eye`/`CheckCircle2`/`XCircle`), bouton Postuler/Envoyer en dégradé avec icône `Send`. Fichier le plus volumineux de cette passe (~13 Ko, logique de candidature/expansion inchangée — uniquement classes et icônes touchées).
- **Avis** (`app/dashboard/reviews/page.tsx`, `ReviewForm.tsx`, `ReviewsList.tsx`) : badge icône `Star` (teinte violette). **Étoiles remplacées** : le rendu par caractères `★`/`☆` devient des icônes Lucide `Star` (pleines/vides), avec un léger agrandissement au survol dans le formulaire de notation.

Même pattern d'en-tête et de carte que le lot précédent (badge teinté + `animate-fade-in-up`, `rounded-xl` + `shadow-sm`, apparition échelonnée par ligne). Vérifié par compilation TypeScript isolée : uniquement du bruit d'environnement déjà connu, confirmé en comparant `FileUploadForm.tsx` à sa version non modifiée (mêmes erreurs `TS18046`/`TS2345` sur le typage de `lib/attachments.ts`, préexistantes).

### Suite (et fin) de la refonte : Messages, Notifications, Historique, Exports

- **Messages** (`app/dashboard/messages/page.tsx`, `MessagesShell.tsx`) : badge icône `MessageSquare` (teinte verte). Avatars en dégradé avec initiales par conversation (liste ET fil ouvert), bulles de message envoyées en dégradé vert, flèche de retour mobile (`←`) remplacée par l'icône `ArrowLeft`, zone de saisie avec anneau de focus, bouton Envoyer avec icône `Send`. C'est le fichier où le bug de texte gris illisible en mode sombre avait été repéré — non concerné par cette passe (déjà corrigé à la racine dans `globals.css`, voir journal du 24 septembre).
- **Notifications** (`app/dashboard/notifications/page.tsx`, `NotificationsList.tsx`) : badge icône `Bell` (teinte bleue). **Emojis retirés** : migration vers le composant `CategoryIcon` (au lieu de `CATEGORY_ICONS` de `lib/activity-log.ts`), icône affichée dans un badge carré au lieu d'un simple caractère.
- **Historique d'activité** (`app/dashboard/activity/page.tsx`, `ActivityLogList.tsx`) : badge icône `History` (teinte grise). **Emojis retirés** : migration vers `CategoryIcon`, à la fois dans les filtres par catégorie et dans chaque ligne du journal.
- **Exports** (`app/dashboard/exports/page.tsx`) : badge icône `Download` (teinte verte), boutons CSV/PDF avec icône (`FileSpreadsheet`/`FileText`), cartes avec apparition échelonnée.
- **Nettoyage final** (`lib/activity-log.ts`) : `CATEGORY_ICONS` (le dernier dictionnaire d'emojis du projet) est **supprimé** — Historique et Notifications étaient les deux derniers écrans à l'utiliser, et sont maintenant tous les deux migrés vers `CategoryIcon`. Plus aucun emoji dans le code de l'application.

Vérifié par compilation TypeScript isolée : uniquement du bruit d'environnement déjà connu (y compris `TS2339 ... type '{}'` sur `app/dashboard/activity/page.tsx`, déjà identifié comme du bruit lors de la rédaction de l'audit initial — logique de requête Prisma non touchée par cette passe, seul l'en-tête visuel a changé).

**Avec ce lot, la refonte esthétique couvre maintenant l'intégralité des ~20 écrans de l'app** (connexion/inscription, menu, tableau de bord, employés, départements, nouvelles recrues, signalements, absences, documents, annonces, postes ouverts, avis, messages, notifications, historique, exports). Plus aucune trace d'emoji dans le code applicatif.

### Notes techniques

- Aucun changement de schéma Prisma, aucune route API, rien à ajouter à `middleware.ts` sur l'ensemble de cette passe (purement visuel, de bout en bout).
- `app/globals.css` porte des commentaires `voir AUDIT.md 14` à chaque ajout, pour retrouver facilement le contexte depuis le code.
- Pattern répété sur tous les écrans, à réutiliser pour toute future page : badge icône teinté en en-tête (`h-10 w-10 rounded-xl` + couleur de fond douce assortie à une couleur de texte plus soutenue, cohérent avec `TINTS` du tableau de bord), `animate-fade-in-up` sur les blocs principaux, cartes/lignes en `rounded-xl` + `shadow-sm` (+ `hover:shadow-md`), apparition échelonnée par élément de liste via `style={{ animationDelay: ... }}`, boutons d'action avec icône Lucide systématique, formulaires avec `focus:ring-4 focus:ring-[#2F6F5E]/12` et bouton principal en dégradé (`from-[#3D8C76] to-[#265A4C]`).
