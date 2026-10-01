# Audit du projet — Portail Employé (mindmate)

> Ce document explique **tout** ce qui a été construit dans ce projet, depuis la Phase 1 jusqu'à aujourd'hui, avec assez de détail pour reconstruire l'application à partir de zéro sans rien oublier. Il sera mis à jour après chaque tâche future (voir la section 13, tout en bas).
>
> Dernière mise à jour : **27 septembre 2026**.

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
| `CRON_SECRET` | (Vercel, production) Secret que Vercel Cron envoie en `Authorization: Bearer …` à `/api/cron/privacy-purge` (7.28). Sans lui, la suppression automatique refuse de tourner. Valeur aléatoire d'au moins 16 caractères. |

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
enum OrganizationStatus { ACTIVE  SUSPENDED }
enum SurveyStatus { OPEN  CLOSED }
enum SupportTicketStatus { OPEN  RESOLVED }
enum DepartureType { RESIGNATION  END_OF_CONTRACT  DISMISSAL  RETIREMENT  OTHER }
enum DepartureStatus { PENDING_SURVEY  COMPLETED  NO_SURVEY }
```

- `SUPER_ADMIN` : réservé au porteur du produit (vous — gère toutes les organisations clientes). Depuis le 26 sept. 2026, dispose de son propre espace `/platform` (voir 7.20), totalement séparé du dashboard des entreprises clientes. Attribué uniquement via `scripts/promote-super-admin.ts` (jamais depuis l'UI — voir 7.20).
- `ORG_ADMIN` : l'admin/RH d'une entreprise cliente — créé automatiquement à l'inscription.
- `MANAGER` : chef de département/gérant — mêmes droits que `ORG_ADMIN` sur Signalements et Absences, mais PAS sur la désactivation de comptes employés, les Documents, Annonces, Postes ouverts ou Avis (voir tableau de permissions en section 7).
- `EMPLOYEE` : rôle par défaut.

### 4.2 Modèles

Chaque modèle ci-dessous est décrit avec : son rôle, ses champs clés, et pourquoi il est fait ainsi.

**`Organization`** — un tenant (une entreprise cliente).
`id, name, slug (unique), plan (default "free"), inviteCode (unique, nullable), logoData (Bytes, nullable), logoMimeType (nullable), logoUpdatedAt (nullable), status (OrganizationStatus, default ACTIVE), suspendedAt (nullable), createdAt, updatedAt`. Le `slug` sert d'identifiant textuel utilisé à la connexion (voir 7.1). `plan` existe déjà pour préparer la facturation (Phase 4), pas encore utilisé. `inviteCode` est le code d'auto-inscription employé (ex. `"XK7P-2QRT"`, voir `lib/invite-code.ts` et 7.18) — nullable pour les organisations créées avant cette fonctionnalité, généré à la volée au premier affichage de `/dashboard/settings` ou premier appel à `GET /api/organization/invite-code`. `logoData`/`logoMimeType` sont le logo propre à CETTE organisation, affiché à ses employés une fois connectés (voir 7.19) — nullable tant qu'aucun logo n'a été téléversé (le logo par défaut de la plateforme s'affiche à la place) ; `logoUpdatedAt` sert uniquement à invalider le cache navigateur de l'image après un changement. `status`/`suspendedAt` (7.20, ajoutés le 26 sept. 2026) : contrôlent l'accès de TOUTE l'organisation depuis `/platform` (SUPER_ADMIN) — `SUSPENDED` coupe la connexion (`lib/auth.ts`) et l'usage de l'app (`lib/session-guard.ts`) pour tous ses employés, typiquement en cas de non-paiement.

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

**`Organization.primaryAdminId`** (29 sept. 2026, voir 7.22) — id de l'admin **principal** (`String?`, pas de relation Prisma). Rempli à l'inscription pour les nouvelles organisations ; pour les anciennes, rempli paresseusement (ORG_ADMIN le plus ancien) par `lib/admins.ts > getPrimaryAdminId()`.

**`Survey` / `SurveyQuestion` / `SurveyOption` / `SurveyParticipation` / `SurveyAnswer`** (29 sept. 2026, voir 7.23) — sondages.
- `Survey` : `organizationId, authorId (relation "SurveyAuthor"), title, description?, isAnonymous, status (SurveyStatus), closesAt?`. `isAnonymous` est fixé à la création et **ne peut plus changer** (aucune route ne le modifie).
- `SurveyQuestion` (`position, text`) → `SurveyOption` (`position, label`), 1 à 10 questions, 2 à 6 choix chacune.
- `SurveyParticipation` : `surveyId, userId`, **`@@unique([surveyId, userId])`** → impossible de répondre deux fois (même en double clic). Sert aussi au taux de participation.
- `SurveyAnswer` : `questionId, optionId, participationId?, departmentId?`. **Sondage anonyme → `participationId` NULL et aucune date** : aucun lien possible entre une réponse et une personne, même en lisant la base. `departmentId` = département au moment de répondre (ventilation par département, masquée sous 5 répondants pour un sondage anonyme).

**`SupportTicket` / `SupportMessage`** (29 sept. 2026, voir 7.24) — canal privé admin principal → propriétaire. `SupportTicket` : `organizationId, authorId (relation "SupportTicketAuthor"), subject, status (SupportTicketStatus), unreadByPlatform, unreadByAuthor, lastMessageAt`. `SupportMessage` : `ticketId, senderId (relation "SupportMessageSender"), fromPlatform, content`.

**`Departure`** (30 sept. 2026, voir 7.26) — un départ d'employé + son questionnaire de départ. `userId` (relation "DepartureEmployee"), `recordedById?` (admin, relation "DepartureRecorder" ; null = déclaré par l'employé), `type`, `status`, `lastDay`, copies `departmentId`/`hireDate` au moment du départ, puis les réponses : `primaryReason`, `secondaryReasons[]`, `details[]` (sous-causes), 6 notes `rating*` (1–5), `couldBeRetained`, `retentionLever`, `wouldRecommend`, `wouldReturn` (`YES|MAYBE|NO`), `comment`, `submittedAt`. Codes et libellés dans `lib/retention-config.ts`. Champs ajoutés le même jour (7.27) : `confirmedAt`, `confirmedById` (id texte, sans relation), `transitionAt`, `transitionLocation`, `transitionNotes`, `handoverItems` (Json : `[{ id, label, done, doneAt }]`), `closedAt`.

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
20260924______add_organization_invite_code       — ajout du champ Organization.inviteCode (7.18), EXÉCUTÉE avec succès le
                                                    25 sept. 2026 ; nom exact du dossier (horodatage) à relever dans
                                                    prisma/migrations/ et à reporter ici quand l'occasion se présente.
20260926______add_organization_logo              — ajout des champs Organization.logoData/logoMimeType/logoUpdatedAt (7.19) ;
                                                    nom exact (horodatage) à confirmer une fois
                                                    `npx prisma migrate dev --name add_organization_logo` exécuté localement —
                                                    mettre à jour cette ligne à ce moment-là.
20260926______add_organization_status            — ajout de OrganizationStatus + Organization.status/suspendedAt (7.20) ;
                                                    à exécuter avec `npx prisma migrate dev --name add_organization_status` ;
                                                    nom exact (horodatage) à confirmer et reporter ici une fois lancé.
20260929065448_add_admin_team_and_surveys       — Organization.primaryAdminId + SurveyStatus + modèles Survey*
                                                    (7.22/7.23) ; EXÉCUTÉE avec succès le 29 sept. 2026.
20260929______add_platform_support               — SupportTicketStatus + SupportTicket/SupportMessage (7.24) ; à exécuter avec
                                                    `npx prisma migrate dev --name add_platform_support`.
20260930095932_add_departures                    — DepartureType/DepartureStatus + Departure (7.26) ; EXÉCUTÉE le 30 sept. 2026.
20261001043220_add_privacy                       — champs de fin d'emploi/transition sur Departure (7.27, jamais migrés
                                                    séparément) + confidentialité Loi 25 (7.28) : Organization.dataRetentionMonths/
                                                    privacyOfficerName/privacyOfficerEmail/lastPrivacyPurgeAt,
                                                    Departure.privacyNoticeAt, SurveyParticipation.privacyNoticeAt ;
                                                    EXÉCUTÉE le 1er oct. 2026.
20261001050000_retention_chosen_by_admin         — ÉCRITE À LA MAIN : dataRetentionMonths devient nullable sans défaut
                                                    (l'admin principal choisit) + remet à NULL les 36 mois posés
                                                    automatiquement (sauf organisation ayant déjà enregistré un choix) ;
                                                    à appliquer avec `npx prisma migrate dev`.
202610________add_locale                         — FR/EN (7.29) : User.locale (null = langue de l'entreprise) +
                                                    Organization.defaultLocale (défaut "fr") ; à exécuter avec
                                                    `npx prisma migrate dev --name add_locale`.
202610________add_leave                          — Congés (7.30) : AbsenceStatus.CANCELLED, LeaveType, LeaveBalanceAdjustment,
                                                    AbsenceRequest.leaveTypeId/halfDay/days/decidedById/decidedAt/decisionNote
                                                    (reason devient facultatif), Organization.leaveYearStartMonth ;
                                                    à exécuter avec `npx prisma migrate dev --name add_leave`.
202610________add_company_leave                  — CompanyLeave (7.31) ; à exécuter avec
                                                    `npx prisma migrate dev --name add_company_leave`.
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

`ANNOUNCEMENT_CREATED, ANNOUNCEMENT_DELETED, ANNOUNCEMENT_ATTACHMENT_ADDED, ANNOUNCEMENT_ATTACHMENT_DELETED, FILE_UPLOADED, FILE_DELETED, JOB_POSTING_CREATED, JOB_POSTING_CLOSED, JOB_POSTING_REOPENED, JOB_APPLICATION_SUBMITTED, JOB_APPLICATION_STATUS_UPDATED, REPORT_CREATED, REPORT_STATUS_UPDATED, ABSENCE_REQUESTED, ABSENCE_STATUS_UPDATED, MESSAGE_SENT, REVIEW_SUBMITTED, REVIEW_DELETED, USER_DISABLED, USER_REACTIVATED, USER_JOINED, ORGANIZATION_INVITE_CODE_REGENERATED, ORGANIZATION_LOGO_UPDATED, ORGANIZATION_LOGO_REMOVED, ORGANIZATION_SUSPENDED, ORGANIZATION_REACTIVATED`. Les deux dernières (7.20, ajoutées le 26 sept. 2026) sont écrites par le SUPER_ADMIN depuis `/platform`, mais journalisées dans l'historique de l'organisation CIBLE (pas celle du SUPER_ADMIN) — c'est là que son propre admin les verra s'il consulte `/dashboard/activity`.

⚠️ **Renommage du 26 sept. 2026** : `USER_INVITE_CODE_REGENERATED` a été renommé `ORGANIZATION_INVITE_CODE_REGENERATED` en ajoutant la catégorie `ORGANIZATION` (voir `lib/activity-log.ts`), pour regrouper correctement ce type d'action de configuration avec le nouveau logo d'organisation (7.19) plutôt que sous "Employés". Si une ligne `AuditLog` antérieure porte encore l'ancien nom, `actionLabel()`/`isKnownAction()` l'affichent tel quel sans planter (comportement de repli déjà existant pour toute action inconnue) — aucune migration de données nécessaire.

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

⚠️ **Mis à jour le 27 sept. 2026** : n'utilise plus `withAuth()`/`getToken()` de `next-auth` — voir journal (section 13, 27 sept.) pour le bug rencontré en production (Vercel/Edge) qui a motivé ce changement : `getToken()` renvoyait `null` pour un cookie de session pourtant valide, sans lever d'erreur. Le fichier lit maintenant le cookie lui-même et appelle `decode()` de `next-auth/jwt` directement :

```typescript
import { decode } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE_NAMES = ["__Secure-next-auth.session-token", "next-auth.session-token"];

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const raw = SESSION_COOKIE_NAMES.map((name) => req.cookies.get(name)?.value).find(Boolean);

  let token: Record<string, any> | null = null;
  if (raw) {
    try {
      token = (await decode({ token: raw, secret: process.env.NEXTAUTH_SECRET ?? "" })) as any;
    } catch {
      // décodage échoué -> traité comme non connecté ci-dessous
    }
  }

  if (!token) {
    const signInUrl = new URL("/login", req.url);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }

  if (pathname.startsWith("/dashboard/admin") && token.role === "EMPLOYEE") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  // ... autres gardes de rôle (voir fichier réel pour /platform, /api/platform)

  return NextResponse.next();
}

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
    "/platform/:path*",
    "/api/platform/:path*",
    "/suspended",
  ],
};
```

**Règle à ne jamais oublier** : chaque fois qu'un nouveau groupe de routes `/api/xxx` est créé, il faut l'ajouter à `matcher`. C'était un oubli réel dans ce projet (corrigé le 23 sept. 2026, voir section 13) — `session-guard.ts` protégeait quand même ces routes en interne, donc ce n'était pas une brèche de sécurité, mais une incohérence de défense en profondeur.

**Autre règle à ne jamais oublier depuis le 27 sept. 2026** : `lib/auth.ts` (`authOptions`) ET `middleware.ts` doivent tous les deux lire `process.env.NEXTAUTH_SECRET` (le second l'utilise directement dans son appel à `decode()`) — ils tournent dans deux runtimes séparés (Node pour les routes API, Edge pour le middleware) qui ne partagent aucun état entre eux.

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
| Paramètres (logo, code d'invitation) | ❌ (page bloquée, redirection) | ❌ (page bloquée, redirection) | ✅ seul rôle avec accès (éditer/régénérer) |
| Logo de l'organisation (affichage) | ✅ lecture (barre latérale) | ✅ lecture | ✅ lecture + édition (Paramètres) |
| Équipe d'administration (Paramètres) | ❌ | ❌ | ✅ voir l'équipe ; **admin principal seul** : ajouter/désactiver/réactiver/remplacer/retirer les co-admins (max 2) |
| Contacter le propriétaire (« Contacter Djibril ») | ❌ | ❌ | **admin principal seul** (co-admins exclus) |
| Retention Intelligence (départs) | ✅ « Mon départ » : annoncer sa démission / remplir son questionnaire | ✅ idem | ✅ analyses, enregistrer/annuler un départ, réponses nominatives (admins seulement, pas « Mon départ ») |
| Sondages | ✅ répondre (1×/sondage) | ✅ répondre | ✅ + créer/fermer/rouvrir/supprimer (Paramètres) + résultats (tableau de bord + `/dashboard/surveys/[id]`) |

Ce tableau décrit les droits **à l'intérieur d'une organisation cliente**. L'espace `/platform` (7.20) est différent par nature : il n'appartient à aucune organisation cliente, seul le `SUPER_ADMIN` (vous) y a accès, et il voit TOUTES les organisations à la fois — voir 7.20 plutôt que ce tableau.

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
- **`GET /api/organization/invite-code`** et **`POST /api/organization/invite-code`** (régénère) : réservées à `["ORG_ADMIN", "SUPER_ADMIN"]` (pas `MANAGER` — même exception que 7.6). Génération paresseuse : une organisation créée avant cette fonctionnalité (donc `inviteCode` encore `null`) se voit attribuer un code au premier accès, sans migration de données à lancer manuellement. Régénérer invalide immédiatement l'ancien code (recherché par égalité stricte, donc plus jamais trouvé). Log `ORGANIZATION_INVITE_CODE_REGENERATED` (renommé le 26 sept. 2026, voir 5.4).
- **`app/dashboard/settings/page.tsx`** (nouvelle page, réservée admin, même pattern de redirection totale que 7.12) + **`components/dashboard/InviteCodeCard.tsx`** (client) : affiche le code, bouton copier, bouton régénérer avec confirmation en deux temps (pas de `window.confirm()`, cohérent avec le reste de l'UI). `nav-items.ts` : entrée "Paramètres" ajoutée, `adminOnly: true`.
- **`POST /api/auth/join`** (route **publique**, comme `/api/auth/register` — volontairement absente de `middleware.ts`) : miroir de `/api/auth/register`, mais rattache le nouvel utilisateur à une organisation **existante** trouvée via `normalizeInviteCode()` plutôt que d'en créer une. Vérifie explicitement l'unicité `(organizationId, email)` (contrairement à `/register`, l'organisation existe déjà et peut déjà contenir cet email). Rattache au département "Général" s'il existe encore, sinon `departmentId: null` (assignable ensuite depuis Employés). Crée le `User` avec `role: EMPLOYEE, status: ACTIVE` directement — pas de statut intermédiaire "en attente". Log `USER_JOINED`, puis `notifyRoles` vers `["ORG_ADMIN","MANAGER","SUPER_ADMIN"]` (7.15).
- **`app/(auth)/join/page.tsx`** + **`components/auth/JoinForm.tsx`** : même famille que Login/Register (`FormField`, layout `(auth)`). Après un `POST /api/auth/join` réussi, le formulaire appelle directement `signIn("credentials", ...)` avec le `organizationSlug` renvoyé par l'API et les identifiants que la personne vient de choisir — connexion immédiate, sans repasser par `/login` où elle devrait retaper un identifiant d'entreprise qu'elle ne connaît pas (seul le code d'invitation lui a été communiqué). Liens croisés ajoutés sur `/login` et `/register` vers `/join`, et de `/join` vers `/register`.
- Aucune notion d'expiration ou de nombre d'utilisations maximum sur le code — volontairement simple pour cette première version (à réévaluer si un besoin de contrôle plus fin apparaît, voir section 10).

### 7.19 Logo personnalisé par organisation (Phase 4)

Objectif : la plateforme peut héberger plusieurs entreprises clientes (potentiellement des millions d'employés au total, répartis en autant d'organisations) — chacune doit pouvoir afficher **son propre logo** à **ses propres employés**, sans jamais voir ni affecter celui d'une autre organisation. Décision produit explicite de l'utilisateur, posée immédiatement après la mise en service de l'auto-inscription par code (7.18).

**Distinction importante avec le logo "Mindmate Compagny"** : celui-ci continue d'apparaître sur les pages publiques `(auth)` (connexion, inscription, rejoindre) — à ce stade, personne n'est encore identifié à une organisation précise, donc c'est le logo de la plateforme elle-même qui s'affiche, pas celui d'un client. Le logo par organisation, lui, n'apparaît qu'**une fois connecté**, dans `DashboardShell.tsx` (barre latérale) — exactement le périmètre demandé par l'utilisateur ("qui s'appliquera aussi aux employés connectés").

- **`Organization.logoData`/`logoMimeType`/`logoUpdatedAt`** (voir 4.2) : stockage direct en base (`Bytes`), même pattern que les documents/pièces jointes (5.5) — pas de service de stockage externe à configurer, cohérent avec le reste du projet. `logoData`/`logoMimeType` nullable : tant qu'aucun logo n'est téléversé, l'organisation utilise le logo par défaut de la plateforme.
- **`lib/attachments.ts`** : nouvelles constantes `MAX_LOGO_SIZE` (2 Mo) et `ALLOWED_LOGO_TYPES`/`isAllowedLogoType()` (PNG/JPG/WEBP — pas de PDF ni de SVG, contrairement à `ALLOWED_ATTACHMENT_TYPES`).
- **`GET /api/organization/logo`** : n'importe quel utilisateur connecté (pas seulement l'admin — c'est affiché à tout le monde dans la barre latérale). Renvoie les octets du logo de SON organisation (jamais celui d'une autre, `ctx.organizationId` vient du token comme partout ailleurs) ; s'il n'y en a pas, **redirige** vers `/logo-mark-white.png` (logo par défaut de la plateforme) plutôt que de renvoyer une erreur — l'`<img>` affiche donc toujours quelque chose de cohérent.
- **`POST /api/organization/logo`** (upload, remplace l'ancien s'il existait) et **`DELETE /api/organization/logo`** (retour au logo par défaut) : réservées à `["ORG_ADMIN", "SUPER_ADMIN"]` (pas `MANAGER`, même exception que 7.6/7.18). Valide le type MIME et la taille avant d'écrire en base. Logs `ORGANIZATION_LOGO_UPDATED`/`ORGANIZATION_LOGO_REMOVED`.
- **`components/dashboard/LogoUploadCard.tsx`** (client, sur `/dashboard/settings`, au-dessus de `InviteCodeCard`) : aperçu du logo actuel, bouton pour en téléverser un nouveau (upload immédiat à la sélection du fichier, pas de bouton "Enregistrer" séparé), bouton "Retirer" (confirmation en deux temps, cohérent avec `InviteCodeCard`) visible seulement si un logo personnalisé existe. Validation du type/de la taille côté client ET côté serveur (jamais l'un sans l'autre).
- **`DashboardShell.tsx`** : le `<img src="/logo-mark-white.png">` codé en dur est remplacé par `<img src="/api/organization/logo">` — c'est cette seule route qui décide, par organisation, quel logo renvoyer. Aucun autre écran modifié : les pages `(auth)` gardent volontairement le logo de la plateforme (voir plus haut).
- Pas de redimensionnement/recadrage/compression côté serveur : le fichier est stocké tel quel (jusqu'à 2 Mo). Si une entreprise téléverse une image mal cadrée, le rendu dans le badge `h-7 w-7` (object-contain) reste correct visuellement mais pourrait gagner en netteté avec un vrai pipeline d'image plus tard (voir section 10).

### 7.20 Espace propriétaire / SUPER_ADMIN — `/platform` (Phase 5)

Objectif, dans les mots de l'utilisateur (26 sept. 2026) : "étant le créateur je le contrôle sur mon application... je dois pouvoir désactiver une organisation si je ne reçois pas de paiement chaque mois... je veux avoir uniquement mon dashboard à moi... je dois voir toutes les entreprises qui créent leur organisation... je dois avoir une vue d'ensemble de ce qui se passe dans mon application." Le rôle `SUPER_ADMIN` existait déjà dans le schéma depuis le départ (commentaire d'origine : "vous — gère toutes les organisations clientes") mais n'avait aucune interface propre avant cette phase.

**Principe d'architecture** : `/platform` est un espace **totalement séparé** de `/dashboard` — pas une page de plus dans le dashboard d'une entreprise cliente. Un `SUPER_ADMIN` est automatiquement redirigé loin de `/dashboard` (vers `/platform`) et n'importe qui d'autre est automatiquement redirigé loin de `/platform` (vers `/dashboard`), à trois niveaux (défense en profondeur, même philosophie que le reste du projet) : `middleware.ts` (edge, le plus tôt possible), `app/platform/layout.tsx` / `app/dashboard/layout.tsx` (pages), et `requireRole(ctx, ["SUPER_ADMIN"])` (API).

- **`OrganizationStatus` / `Organization.status` / `Organization.suspendedAt`** (voir 4.2) : c'est le mécanisme qui donne un sens réel à "désactiver une organisation". Une organisation `SUSPENDED` :
  - ne peut plus se **connecter** : `lib/auth.ts` (`authorize()`) vérifie le statut **après** avoir validé le mot de passe (jamais avant — on ne révèle pas le statut d'une organisation à quelqu'un qui n'a pas prouvé ses identifiants), sauf pour un `SUPER_ADMIN` qui reste toujours capable de se connecter même si SA PROPRE organisation interne était suspendue par erreur.
  - perd l'accès **immédiatement**, même en cours de session : `lib/session-guard.ts` (`requireAuth()`) revérifie le statut de l'organisation en base à CHAQUE requête protégée (API ou page), plutôt que d'attendre l'expiration du token JWT (8h, voir 5.1) — c'est ce qui évite qu'un employé garde l'accès pendant des heures après une suspension. Lève `OrganizationSuspendedError` (nouvelle classe), distincte de `UnauthorizedError`, pour permettre un message clair plutôt qu'un simple renvoi vers `/login`.
  - est redirigée vers **`/suspended`** (nouvelle page, groupe `(auth)` pour réutiriser son layout visuel) plutôt que `/login` — message explicatif + bouton de déconnexion, rien d'autre.
- **`app/api/platform/organizations/[id]/route.ts`** (`PATCH`, body `{ status: "ACTIVE" | "SUSPENDED" }`) : seule route de mutation de cette phase. Réservée `SUPER_ADMIN` (`requireRole`). Met à jour `status` + `suspendedAt` (horodaté à la suspension, remis à `null` à la réactivation). Journalise `ORGANIZATION_SUSPENDED`/`ORGANIZATION_REACTIVATED` **dans l'historique de l'organisation CIBLE** (pas celle du SUPER_ADMIN) — voir 5.4.
- **`app/platform/page.tsx`** (Vue d'ensemble) : KPI globaux **sans filtre `organizationId`** — volontairement le seul endroit de toute l'application où c'est correct de faire ça, car ce rôle existe précisément pour voir toutes les organisations à la fois. Total organisations, actives, suspendues, total employés (toutes organisations confondues), nouvelles organisations ce mois-ci, + liste des 5 organisations les plus récentes.
- **`app/platform/organizations/page.tsx`** + **`components/platform/OrganizationsTable.tsx`** (client) : tableau de toutes les organisations (nom, identifiant, plan, nb d'employés, date de création, statut), avec bouton Suspendre/Réactiver par ligne, confirmation en deux temps (cohérent avec `InviteCodeCard`/`LogoUploadCard`, jamais de `window.confirm()`).
- **`components/platform/PlatformShell.tsx`** : équivalent de `DashboardShell` mais volontairement distinct (pas de réutilisation) — pas de logo d'organisation, pas de notifications par employé, navigation réduite à "Vue d'ensemble" et "Organisations". Même langage visuel (couleurs, animations `animate-fade-in-up`, dégradé marine de la barre latérale) pour rester cohérent avec le reste de l'app.
- **Attribution du rôle `SUPER_ADMIN`** — **`scripts/promote-super-admin.ts`** : script one-off (`npx tsx scripts/promote-super-admin.ts <identifiant-entreprise> <email>`), **volontairement absent de l'UI**. Aucun rôle qui voit et contrôle toutes les organisations clientes ne doit pouvoir être auto-attribué depuis l'app elle-même (un `ORG_ADMIN` malveillant pourrait sinon tenter de se le donner) — cette promotion reste une commande que seul vous, avec un accès au serveur/à la base, pouvez lancer. Étape manuelle : créer un compte normal via `/register` (devient `ORG_ADMIN` de sa propre organisation, comme n'importe quel client), puis lancer le script sur ce compte pour le promouvoir.
- **Renommage d'une organisation** — **`scripts/rename-organization.ts`** (ajouté le 26 sept. 2026) : script one-off (`npx tsx scripts/rename-organization.ts <identifiant-actuel> <nouvel-identifiant> [nouveau-nom-affiché]`) pour corriger le `slug` (identifiant de connexion) et/ou le `name` (nom affiché) d'une organisation après coup — aucune UI ne permet de le faire aujourd'hui, le slug étant choisi une seule fois à l'inscription (7.1). Utilisé pour corriger l'identifiant de l'organisation interne du SUPER_ADMIN (`minmate-compagny` → `mindmate-compagny`). Sans risque pour les sessions déjà connectées : le token ne contient que l'ID de l'organisation, jamais son slug.
- **Gestion des comptes/rôles d'administration** — **`scripts/set-user-role.ts`** (`npx tsx scripts/set-user-role.ts <identifiant-entreprise> <email> <RÔLE>`) et **`scripts/create-user.ts`** (`npx tsx scripts/create-user.ts <identifiant-entreprise> <email> <mot-de-passe> <prénom> <nom> <RÔLE>`), ajoutés le 26 sept. 2026 suite à une erreur réelle de l'utilisateur : il avait promu son SEUL compte admin de "Mindmate Compagny" en `SUPER_ADMIN` via `scripts/promote-super-admin.ts`, perdant du même coup l'accès au dashboard normal de sa propre organisation (le rôle est unique par utilisateur — impossible d'être ORG_ADMIN et SUPER_ADMIN à la fois sur le même compte). Solution retenue (parmi 3 options proposées, choisie explicitement par l'utilisateur) : garder UNE SEULE organisation ("Mindmate Compagny"), avec DEUX comptes distincts dedans — le compte d'origine repassé `ORG_ADMIN` via `set-user-role.ts`, et un second compte créé via `create-user.ts` avec un alias de son email (ex. `vous+admin@gmail.com` — Gmail ignore tout ce qui suit un `+`, les messages arrivent quand même dans la boîte normale) promu directement `SUPER_ADMIN` à la création. `scripts/promote-super-admin.ts` reste fonctionnel (raccourci pour promouvoir un compte EXISTANT en `SUPER_ADMIN` uniquement) mais `set-user-role.ts` le généralise (n'importe quel rôle, dans les deux sens) ; `create-user.ts` comble le trou que ni `/register` (crée toujours une nouvelle organisation) ni `/join` (toujours `EMPLOYEE`) ne couvraient : créer un compte avec un rôle choisi dans une organisation déjà existante.
- Pas encore construit (hors périmètre de cette demande, voir section 10) : facturation réelle (le champ `plan` existe mais n'est pas branché à un vrai système de paiement — la suspension reste **manuelle**, décidée par vous en regardant si le paiement est arrivé, pas automatique) ; impersonation (le SUPER_ADMIN ne peut pas "se connecter en tant que" une organisation cliente pour du support) ; recherche/filtre sur `/platform/organizations` (tri fixe par date de création, pas encore de champ de recherche — non nécessaire au nombre actuel d'organisations).

### 7.21 Mise en ligne / déploiement (Vercel)

Jusqu'ici l'app ne tournait qu'en local (`npm run dev` / `npm run start` sur `localhost`) — installable en PWA (7.17) uniquement sur la machine où elle tourne. À la demande de l'utilisateur ("transformer tout mon projet en application installable"), diagnostic posé : la PWA elle-même était déjà complète et correcte (manifest, icônes aux bonnes tailles — vérifiées pixel par pixel : 192×192, 512×512, 512×512 maskable, 180×180 apple-touch-icon —, service worker, page hors-ligne), le vrai obstacle à une installation depuis un téléphone était l'absence de mise en ligne. Décision de l'utilisateur (question posée directement) : déployer maintenant sur **Vercel**, déjà l'hébergement cible prévu (section 2).

- **`package.json`** : ajout de `"postinstall": "prisma generate"` aux scripts. Sans cette ligne, `@prisma/client` n'est jamais régénéré après `npm install` sur l'infrastructure de build de Vercel (contrairement à une machine de dev où `prisma generate` a déjà été lancé manuellement au moins une fois) — un oubli très courant qui casse le build Vercel des projets Next.js + Prisma. Corrigé avant le premier déploiement plutôt qu'après un échec.
- **Pas de dépôt Git existant** au moment de la demande (`mon-projet` n'est pas un dépôt versionné) : déploiement fait via la **CLI Vercel** directement depuis le dossier local (`npx vercel`), sans passer par GitHub dans un premier temps. Rien n'empêche de connecter un dépôt GitHub plus tard pour avoir un déploiement automatique à chaque `git push` — pas fait à ce stade.
- **Variables d'environnement** (section 3) à reporter sur Vercel (dashboard du projet → Settings → Environment Variables), car `.env` n'est jamais commité/déployé :
  - `DATABASE_URL` — même base Neon qu'en local (le pooler Neon accepte les connexions depuis Vercel sans configuration réseau supplémentaire) : la production et le développement local partagent donc, à ce stade, **la même base de données**. Pas de séparation dev/prod pour l'instant — à surveiller si des données de test s'accumulent (voir section 10).
  - `NEXTAUTH_SECRET` — même valeur que le `.env` local, pour rester simple à ce stade (une vraie séparation dev/prod utiliserait un secret différent par environnement).
  - `NEXTAUTH_URL` — **doit être l'URL Vercel réelle** (ex. `https://mon-projet.vercel.app`), jamais `http://localhost:3000`. Problème de l'œuf et la poule : l'URL n'est connue qu'après un premier déploiement, donc `NEXTAUTH_URL` est ajoutée/corrigée puis un second déploiement (`vercel --prod`) est nécessaire pour qu'elle prenne effet.
- Aucune migration Prisma supplémentaire à lancer contre la base de production : comme c'est la même base Neon qu'en local, toute migration déjà passée via `npx prisma migrate dev` (y compris `add_organization_status`, 4.4) s'applique aussi à ce que Vercel utilisera.
- Pas encore fait à ce stade (hors périmètre de cette demande) : nom de domaine personnalisé (Vercel fournit un sous-domaine `*.vercel.app` gratuit par défaut), dépôt Git/déploiement continu, séparation d'une base de données dédiée à la production.

---

### 7.22 Équipe d'administration : admin principal + 2 co-admins (29 sept. 2026)

**Demande de l'utilisateur** : avec ~500 employés, un seul admin ne suffit pas. Il faut 1 admin principal qui peut ajouter 2 autres admins avec les mêmes droits depuis les Paramètres ; les co-admins font tout ce que fait le principal, mais le principal peut à tout moment les désactiver/réactiver, les supprimer ou les remplacer. Décisions confirmées par l'utilisateur : ajout **par promotion d'un employé existant ET par création d'un compte neuf** ; **2 co-admins maximum** (3 admins au total).

- **Modèle** : pas de nouveau rôle. Les co-admins sont des `ORG_ADMIN` comme le principal → mêmes droits partout (aucune autre route n'a eu à changer). Le principal est désigné par `Organization.primaryAdminId`. Constante `MAX_CO_ADMINS = 2` dans `lib/admins.ts`.
- **Routes** : `GET /api/admins` (tout ORG_ADMIN) ; `POST /api/admins` (principal seul — `mode: "promote"` avec `userId`, ou `mode: "create"` avec prénom/nom/courriel/mot de passe temporaire ; `replaceUserId` optionnel = remplacement dans la même transaction) ; `PATCH /api/admins/[id]` (activer/désactiver) ; `DELETE /api/admins/[id]` (retirer : redevient `EMPLOYEE`, avec `disableAccount` optionnel pour désactiver aussi le compte — jamais de suppression réelle, cf. 5.3). Ajoutées à `middleware.ts`.
- **Règles** : un co-admin désactivé garde son rôle et **occupe toujours sa place** (réactivable) ; pour libérer la place, le principal le retire ou le remplace. Le principal ne peut être ni modifié ni remplacé par ces routes.
- **Faille corrigée au passage** : `PATCH /api/users/[id]` permettait à n'importe quel ORG_ADMIN de désactiver n'importe quel compte, y compris un autre admin. Désormais les comptes `ORG_ADMIN`/`SUPER_ADMIN` sont refusés sur cette route (403) : ils se gèrent uniquement via `/api/admins`. La page Employés affiche « Géré dans Paramètres » sur ces lignes.
- **Effet immédiat** : `lib/session-guard.ts > requireAuth()` relit maintenant **le rôle et le statut en base** à chaque requête (au lieu de se fier au token JWT valable 8 h). Un co-admin désactivé perd l'accès tout de suite ; un employé promu voit les menus admin sans se reconnecter ; un co-admin retiré les perd tout de suite. `app/dashboard/layout.tsx` fait de même pour le menu. Coût : une requête `findUnique` par appel (celle de l'organisation est fusionnée dedans).
- **Traçabilité** : actions `USER_ADMIN_ADDED`, `USER_ADMIN_REMOVED` (metadata `reason: replaced | removed | removed_and_disabled`), `USER_ADMIN_DISABLED`, `USER_ADMIN_REACTIVATED` (catégorie Employés). Notification à la personne promue/retirée.
- **UI** : `components/dashboard/AdminsCard.tsx` sur `/dashboard/settings` (recherche d'employé par nom/courriel pour les grandes organisations).

### 7.23 Sondages (29 sept. 2026)

**Demande de l'utilisateur** : les admins doivent pouvoir faire des sondages pour tous les employés (ex. « Pensez-vous que la productivité doit s'améliorer ? 1. Oui 2. Non 3. Pas vraiment »), disponibles depuis les Paramètres ; une fois complétés, les résultats doivent être visibles sur le tableau de bord de la manière la plus explicite possible. Décisions confirmées : **plusieurs questions par sondage**, **anonymat choisi par sondage**.

- **Création/gestion** (admins, principal ou co-admins) : `components/dashboard/SurveyManager.tsx` dans Paramètres (ancre `#sondages`) — titre, description, anonyme/nominatif, clôture automatique optionnelle, 1–10 questions × 2–6 choix, modèles « Productivité » et « Satisfaction ». Liste avec taux de participation, Fermer/Rouvrir, Supprimer (confirmation en deux temps). Routes `POST /api/surveys`, `PATCH`/`DELETE /api/surveys/[id]`. Validation zod dans `lib/surveys.ts`. Publication = notification à tous les employés actifs (7.15).
- **Réponse** (tout le monde) : nouvelle page `/dashboard/surveys` (entrée « Sondages » dans le menu) + `components/dashboard/SurveyAnswerForm.tsx`. L'employé voit **avant de répondre** si le sondage est anonyme ou nominatif. Route `POST /api/surveys/[id]/responses` : une réponse par question obligatoire, chaque choix doit appartenir à sa question, sondage ouvert et non expiré, une seule participation (contrainte unique + transaction, erreur 409 si déjà répondu).
- **Anonymat** : voir 4.2 — réponses sans `participationId` ni date ; ventilation par département masquée sous `MIN_GROUP_SIZE = 5` répondants ; le nom de l'auteur n'est jamais exposé. Sondage nominatif : tableau « qui a répondu quoi » sur la page de résultats.
- **Résultats** : `lib/surveys.ts > getSurveyResults()` (groupBy par choix et par département) + `components/dashboard/SurveyResultsView.tsx` (composant serveur, barres HTML/CSS, pas de bibliothèque). Sur le **tableau de bord** (ORG_ADMIN) : section « Résultats des sondages » avec les 2 derniers sondages en version compacte (participation, 2 premières questions). Page complète `/dashboard/surveys/[id]` (ORG_ADMIN seulement) : toutes les questions, ventilation par département (barres empilées + vue tableau), réponses individuelles si nominatif. Chaque question a une **phrase d'analyse automatique** (majorité large/simple, avis partagés, égalité, trop peu de réponses) et un indicateur de **fiabilité** selon le taux de participation. Couleurs : barres d'une seule teinte (choix en tête foncé) ; palette par choix validée pour le daltonisme (script du skill dataviz) ; % toujours écrits en texte.
- **Tableau de bord, tout le monde** : nouvelle carte « Sondages à compléter ».
- **Traçabilité** : nouvelle catégorie d'historique `SURVEY` (icône `ClipboardList`) : `SURVEY_CREATED`, `SURVEY_CLOSED`, `SURVEY_REOPENED`, `SURVEY_DELETED`. Les réponses elles-mêmes ne sont pas journalisées (anonymat).
- **Rouvrir** un sondage dont la date de clôture est passée retire cette date (sinon il resterait fermé en pratique).

### 7.24 Propriétaire invisible + « Contacter Djibril » (29 sept. 2026)

**Demande de l'utilisateur** : son compte SUPER_ADMIN apparaissait dans la liste des Employés de son organisation. Personne (employés, admins actuels ou futurs) ne doit jamais voir ce compte : il gère l'application « dans l'ombre ». Seuls les **admins principaux** doivent pouvoir le contacter, via un bouton « Contacter Djibril » dans les Paramètres ; il reçoit le message dans son espace SUPER_ADMIN avec l'organisation et l'admin qui l'a envoyé.

- **Invisibilité** : `lib/visibility.ts > VISIBLE_USER` (`role ≠ SUPER_ADMIN`), ajouté à toute requête qui liste ou compte des utilisateurs d'une organisation : page Employés, compteurs du tableau de bord (employés actifs, nouvelles recrues, noms dans l'activité récente), Nouvelles recrues, compteurs des Départements, Historique (noms d'acteurs), exports Employés et Historique, messagerie (destinataire/interlocuteur introuvables). `PATCH /api/users/[id]` répond **404** (pas 403) sur ce compte : son existence n'est même pas révélée. `lib/notifications.ts` : `notifyRoles`/`notifyOrganization` n'envoient plus jamais rien au SUPER_ADMIN. Déjà exclu avant : sondages (7.23), équipe d'administration (7.22). **Règle pour toute future requête** : lister/compter des utilisateurs ⇒ ajouter `...VISIBLE_USER`.
- **Support** : `components/dashboard/SupportCard.tsx` dans Paramètres (ancre `#support`), rendu **uniquement pour l'admin principal** ; routes `POST /api/support` (nouvelle demande, principal seul, max 5 nouvelles demandes/organisation/24 h), `POST /api/support/[id]/messages` (principal de l'organisation OU SUPER_ADMIN), `PATCH /api/support/[id]` (principal : `markRead` ; SUPER_ADMIN : `OPEN`/`RESOLVED`). Ajoutées à `middleware.ts`. Nom affiché aux admins : `PLATFORM_CONTACT_NAME = "Djibril"` (`lib/support.ts`) — aucune donnée du compte SUPER_ADMIN (id, courriel, nom) n'est envoyée au navigateur d'un admin.
- **Côté propriétaire** : nouvelle entrée « Support » dans `/platform` (badge de non-lus dans `PlatformShell`), page `/platform/support` (organisation, identifiant, admin principal avec son courriel, statut) et `/platform/support/[id]` (fil, réponse, Marquer résolu / Rouvrir ; l'ouverture marque la demande comme lue). Notification en app + push au propriétaire à chaque message d'admin, et à l'admin à chaque réponse. Un nouveau message de l'admin rouvre une demande résolue.

### 7.25 Notifications du propriétaire (29 sept. 2026)

**Demande de l'utilisateur** : en tant que SUPER_ADMIN, recevoir des notifications avec la même sonorité que les employés, pour réagir vite, avec un badge qui affiche le nombre de notifications.

- **Même mécanisme que les organisations, aucun nouveau modèle** : les messages d'assistance créaient déjà une `Notification` + un push pour le propriétaire (`lib/support.ts > notifyPlatformOwners`). Il manquait l'interface côté `/platform`.
- **Cloche + badge** dans l'en-tête de `PlatformShell` (même rendu que le `Topbar` des organisations) et entrée « Notifications » dans le menu, avec compteur ; nombre calculé dans `app/platform/layout.tsx`.
- **Page `/platform/notifications`** : réutilise tels quels `PushNotificationsToggle` (activation du push sur l'appareil → vraie notification système, même son que pour les employés : le son par défaut du système, voir commentaire dans `public/sw.js`) et `NotificationsList` (lu/non lu, « tout marquer comme lu », synchronisation du badge de l'icône de l'app).
- **Badge de l'icône de l'app (PWA)** : mis à jour par `public/sw.js` à chaque push quand l'app est fermée, et resynchronisé par `PlatformShell` à chaque page de la console.
- Ouvrir une demande (`/platform/support/[id]`) marque aussi comme lues les notifications qui pointent vers elle.
- **Filtre `type: "SUPPORT_MESSAGE"`** sur la page et le compteur : avant 7.24, `notifyRoles()` incluait le SUPER_ADMIN, qui avait donc accumulé des centaines de notifications de sa propre organisation (signalements de test « Test Entreprise A », sondage…). Elles restent en base mais ne s'affichent plus dans la console.
- Nouvelle catégorie `SUPPORT` (icône `LifeBuoy`) dans `lib/activity-log.ts`/`CategoryIcon.tsx`, pour l'icône des notifications `SUPPORT_MESSAGE`.
- **À faire une fois par appareil** : `/platform/notifications` → « Activer » (le push est propre à chaque navigateur/appareil et au compte connecté ; l'abonnement du compte admin `+admin` ne compte pas pour le compte SUPER_ADMIN).

### 7.26 Employee Retention Intelligence — départs (30 sept. 2026)

**Demande de l'utilisateur** : comprendre pourquoi les employés quittent l'entreprise. À chaque départ, un questionnaire ; puis analyses et tendances (ex. « 12 derniers mois : 38 % manque d'évolution, 31 % management… » et « le département Marketing présente un taux de départ supérieur aux autres »). Décisions confirmées : départ déclenché **par l'employé OU par un admin** ; réponses **nominatives** ; **questionnaire fixe** ; module réservé aux **admins**.

- **Questionnaire** (`lib/retention-config.ts`, sans accès BDD, partagé client/serveur) : raison principale (8 choix), raisons secondaires, **sous-causes précises** par raison (ex. Rémunération → salaire sous le marché / pas d'augmentation / avantages / meilleure offre), 6 notes sur 5 (gérant, évolution, charge, rémunération, ambiance, reconnaissance), « aurait-on pu vous retenir ? » + levier (promotion, augmentation, changement de gérant, flexibilité…), recommandation, retour possible, commentaire. Validation zod (`surveyAnswersSchema`) qui nettoie les incohérences (sous-cause d'une raison non cochée, etc.). **Ne jamais renommer un code** (stocké en base), seulement son libellé.
- **Flux** : (1) l'employé ou gérant va dans « Mon départ » (`/dashboard/departure`, dernier élément du menu, masqué aux admins) et annonce sa démission avec le questionnaire → `POST /api/departures/me` ; (2) un admin clique « Enregistrer un départ » sur `/dashboard/retention` (employé, type, dernier jour, questionnaire oui/non — décoché par défaut pour un licenciement) → `POST /api/departures` → l'employé est notifié et remplit le questionnaire dans « Mon départ ». Annulation : `DELETE /api/departures/[id]` (réponses supprimées). Un seul départ « en cours » par employé (depuis sa date d'embauche, `lib/departures.ts`). Le compte n'est **pas** désactivé automatiquement : l'admin le fait depuis Employés, après la réponse. Les admins ne peuvent pas être « partants » (retirer d'abord leurs droits, 7.22).
- **Analyses** (`lib/retention.ts > getRetentionAnalytics`, période 3/6/12 mois) : départs, taux de départ (≈ départs ÷ (actifs + partis)), % démissions, ancienneté moyenne et % de départs avant 1 an, raisons (part des questionnaires qui **citent** la raison — le total dépasse 100 %, comme dans l'exemple de l'utilisateur — + part en raison principale + 3 premières sous-causes), **taux par département** avec repère de la moyenne et alerte « au-dessus de la moyenne » (≥ 2 départs et ≥ 1,3× le taux global), départs par mois, notes moyennes (point faible), leviers de rétention, % recommandation/retour, **phrases d'analyse automatiques** (département anormal, première cause, point le plus mal noté, part « retenable », départs précoces, faible taux de réponse).
- **Pages** : `/dashboard/retention` (admins), `/dashboard/retention/[id]` (réponses nominatives d'un départ + annuler), `/dashboard/departure` (employé). Carte « Départs (12 mois) » sur le tableau de bord des admins. Entrée « Rétention » (admins) et « Mon départ » (non-admins) dans le menu (`nonAdminOnly`, nouveau drapeau de `nav-items.ts`, géré dans `Sidebar.tsx`).
- **Traçabilité** : catégorie d'historique `DEPARTURE` (icône `DoorOpen`) : `DEPARTURE_RECORDED`, `DEPARTURE_DECLARED`, `DEPARTURE_SURVEY_COMPLETED`, `DEPARTURE_CANCELLED`. Notifications : admins (annonce/questionnaire rempli), employé (questionnaire à remplir).

### 7.27 Fin d'emploi & rendez-vous de transition (30 sept. 2026)

**Demande de l'utilisateur** : sur la fiche d'un départ, l'admin confirme la fin d'emploi et peut organiser un rendez-vous de transition avec l'employé (remise des dossiers, des clés, accès informatiques…). Décisions confirmées : **admin principal uniquement** (co-admins en lecture seule) ; **aucune désactivation automatique** du compte (l'admin le fait depuis Employés).

- **Route** : `PATCH /api/departures/[id]` (admin principal, `requirePrimaryAdmin`) avec `action` = `confirm` | `schedule` (date/heure ISO, lieu, consignes, liste de remise ; vaut aussi confirmation) | `checklist` (cocher/décocher — seul l'état change, pas les libellés) | `close` | `reopen`. Liste de remise par défaut `DEFAULT_HANDOVER_ITEMS` (dossiers, clés, badge, matériel, accès informatiques, documents de fin d'emploi), modifiable (max 20 éléments) ; en replanifiant, les éléments déjà cochés gardent leur état (même libellé). « Transition terminée » n'est possible que si tout est coché.
- **UI** : `components/dashboard/TransitionCard.tsx` sur `/dashboard/retention/[id]` (au-dessus du questionnaire) : statut (À confirmer / Confirmée / Transition terminée), confirmation, formulaire de rendez-vous, liste de remise avec barre de progression, clôture, rappel « compte encore actif ». Côté employé, « Mon départ » affiche la confirmation, la date/heure, le lieu, les consignes et la liste (lecture seule). Badges « À confirmer / Transition planifiée / Transition terminée » dans « Départs récents ».
- **Fuseau horaire** : `components/dashboard/LocalDateTime.tsx` formate les dates **dans le navigateur** (le serveur Vercel est en UTC ; un formatage côté serveur décalerait l'heure du rendez-vous). Pour la même raison, les notifications ne contiennent pas l'heure (« Détails dans Mon départ »).
- **Traçabilité / notifications** : `DEPARTURE_CONFIRMED`, `DEPARTURE_TRANSITION_SCHEDULED`, `DEPARTURE_CLOSED`, `DEPARTURE_REOPENED` (catégorie Départs) ; l'employé est notifié à la confirmation et à chaque (re)planification.

### 7.28 Confidentialité — Loi 25 (1er oct. 2026)

**Demande de l'utilisateur** : informer les employés de l'usage de leurs réponses et de leur durée de conservation, et supprimer automatiquement les données expirées.

- **Avis** : `components/dashboard/PrivacyNotice.tsx`, affiché avant le questionnaire de départ et avant tout sondage **nominatif** (pas les anonymes) : qui voit les réponses, à quoi elles servent, durée de conservation, responsable de la protection des renseignements personnels. Case « J'ai compris » obligatoire : bloque l'envoi côté navigateur ET côté serveur (`privacyAccepted: true` exigé par `POST /api/departures/me` et `POST /api/surveys/[id]/responses` pour un sondage nominatif). Date d'acceptation stockée dans `Departure.privacyNoticeAt` / `SurveyParticipation.privacyNoticeAt`.
- **Réglages** : carte « Confidentialité (Loi 25) » dans Paramètres (`components/dashboard/PrivacyCard.tsx`, ancre `#confidentialite`). Tous les admins la voient ; seul l'admin principal modifie (`PATCH /api/organization/privacy`, `requirePrimaryAdmin`). Durée 1, 2 ou 3 ans (défaut 3 ans) ; responsable vide = admin principal (comportement par défaut de la loi). Raccourcir la durée demande une confirmation. **Aucune durée par défaut** (demande de l'utilisateur) : choix parmi 6 mois, 1, 2, 3 ou 5 ans ; tant que l'admin principal n'a pas choisi, rien n'est supprimé, l'avis indique aux employés que la durée n'est pas encore fixée, et un bandeau sur le tableau de bord de l'admin principal renvoie vers Paramètres.
- **Suppression automatique** : `lib/privacy.ts` (`purgeExpiredData`), appelée chaque nuit à 7 h UTC (≈ 3 h à Montréal) par Vercel Cron (`vercel.json`) sur `GET /api/cron/privacy-purge`, protégée par `CRON_SECRET` (comparaison à temps constant ; route hors matcher du middleware). Effets : départs dont le dernier jour dépasse la durée → **supprimés** (questionnaire + transition) ; réponses de sondages nominatifs plus anciennes → **anonymisées** (`participationId = null`, les résultats globaux restent ; la liste nominative les masque). Seules les organisations ayant choisi une durée sont traitées. Avec 6 mois, la vue « 12 mois » de Rétention ne montre plus que 6 mois de départs (prévenu dans la carte).
- **Traçabilité** : `ORGANIZATION_PRIVACY_UPDATED` et `ORGANIZATION_PRIVACY_PURGE` (acteur « Système », écrit seulement si quelque chose a été supprimé). Date de la dernière exécution affichée dans la carte.
- **Hors périmètre (à décider plus tard)** : signalements, messages, absences et lignes d'historique contenant un nom ne sont pas concernés par la suppression automatique.

### 7.29 Version anglaise (FR/EN) — étape 1 (1er oct. 2026)

**Demande de l'utilisateur** : application bilingue pour élargir le marché au Canada. Décisions : **par étapes** ; langue **par personne + défaut entreprise** ; espace `/platform` **en français seulement**.

- **Système maison, sans dépendance** (`lib/i18n/`) : `config.ts` (langues, cookie `mm_locale`, `intlLocale` → fr-CA/en-CA), `messages/fr.ts` (référence) et `messages/en.ts` (typé `Messages` : une clé manquante = erreur de compilation), `translator.ts` (`t(clé, {vars})`, pluriels `{one, other}` via `Intl.PluralRules`, `tx(texte)` = traduit si c'est une clé sinon renvoie tel quel, `formatDate/DateTime/Number`), `server.ts` (`getLocale()`/`getI18n()` avec `cache()`), `format.ts` (`formatDuration`). Clés typées (`MessageKey`) : une clé inexistante ne compile pas.
- **Côté client** : `components/i18n/I18nProvider.tsx` monté dans `app/layout.tsx` (dictionnaire de la langue courante passé en props) + `useI18n()`. `<html lang>` et le titre de l'onglet suivent la langue.
- **Choix de la langue** (ordre de priorité dans `getLocale`) : 1. `User.locale` (choix enregistré sur le compte) ; 2. cookie `mm_locale` (choix fait sur cet appareil, ex. page de connexion) ; 3. `Organization.defaultLocale` ; 4. pas connecté : `Accept-Language` du navigateur, sinon français. SUPER_ADMIN : toujours français.
- **Bouton FR | EN** : `components/i18n/LanguageSwitcher.tsx` dans la barre du haut et sur les pages de connexion/inscription → `POST /api/locale` (route publique, hors matcher) : pose le cookie et, si connecté, enregistre `User.locale`, puis `router.refresh()`.
- **Défaut entreprise** : carte « Langue » dans Paramètres (`components/dashboard/LanguageCard.tsx`, ancre `#langue`, tous les ORG_ADMIN) → `PATCH /api/organization/locale` (action d'historique `ORGANIZATION_LOCALE_UPDATED`). À l'inscription d'une entreprise, `defaultLocale` = langue de la page d'inscription. À l'auto-inscription d'un employé (`/join`), sa langue n'est enregistrée que s'il l'a choisie avec le bouton.
- **Messages de validation** (`lib/validations/auth.ts`) : les schémas zod renvoient des **clés** (`validation.*`), traduites par `tx()` dans les formulaires et par `t()` dans les routes. Les routes `register` et `join` renvoient leurs erreurs traduites (`getI18n()` fonctionne aussi dans les routes API).
- **Traduit à l'étape 1** : menu, barre du haut, connexion/inscription/rejoindre/suspendu, tableau de bord (hors libellés d'historique et cartes de résultats de sondage), Paramètres (logo, code d'invitation, équipe d'administration, assistance, confidentialité, langue), avis de confidentialité, `LocalDateTime`.
- **Reste à traduire (étapes suivantes)** : pages Signalements, Absences, Documents, Annonces, Postes, Avis, Messages, Employés/Départements/Nouvelles recrues, Notifications, Exports (CSV/PDF), Sondages (`SurveyManager`, résultats), Rétention/Départ, Historique (`lib/activity-log.ts`), messages d'erreur des autres routes API, textes des notifications (enregistrés en base au moment de l'envoi, en français). Méthode : ajouter les clés dans `fr.ts` + `en.ts`, `const { t } = await getI18n()` (serveur) ou `useI18n()` (client).

### 7.30 Congés et absences (1er oct. 2026)

**Demande de l'utilisateur** : congés avec demandes, approbation et soldes. Décisions : **types modifiables** par l'admin ; **soldes par type + ajustements individuels** ; approbation par les **admins + le gérant du département** ; **demi-journées** permises. Remplace l'ancienne page Absences (motif libre, sans type ni solde) — même adresse `/dashboard/absences`, menu renommé « Congés ». Entièrement bilingue (clés `leave.*`).

- **Modèle** : `LeaveType` (par entreprise ; 5 types par défaut créés au premier besoin par `ensureLeaveTypes` : Vacances 10 j, Maladie 2 j, Personnel/famille 2 j, Sans solde et Autre non décomptés ; `code` = nom traduit FR/EN tant que l'admin n'a pas mis de `name` ; jamais supprimé, seulement désactivé), `LeaveBalanceAdjustment` (+/− jours pour une personne, un type, une année), nouveaux champs sur `AbsenceRequest` (type, demi-journée, jours décomptés, décision), statut `CANCELLED`, `Organization.leaveYearStartMonth`. Les anciennes demandes (sans type) s'affichent « Autre » et ne comptent dans aucun solde.
- **Règles** (`lib/leave.ts`) : jours ouvrables lun.-ven. calculés par le serveur (jours fériés NON retirés), 0,5 pour une demi-journée (une seule date) ; une demande compte dans l'année de congés de son premier jour ; solde = jours/année + ajustements − jours approuvés (en attente affichés à part) ; pas deux demandes actives qui se chevauchent pour une même personne ; dépasser le solde n'est pas bloquant (avertissement, l'approbateur décide). Dates stockées à minuit UTC.
- **Droits** (`approverScope`) : admin = toute l'entreprise ; gérant = son département, jamais ses propres demandes (un gérant sans département n'approuve rien) ; refus = note obligatoire ; mise à jour conditionnelle `status: PENDING` (pas de double traitement). Annulation par la personne : en attente, ou approuvée et pas encore commencée (l'approbateur est prévenu).
- **Page** `/dashboard/absences` (onglets `?tab=`) : *Mes congés* (cartes de solde, formulaire `AbsenceForm`, liste `AbsencesList`), *À approuver* (`LeaveApprovals` : solde après approbation, collègues du même département déjà absents, traitées récemment), *Calendrier* (mois, `?month=AAAA-MM` ; admins : toute l'entreprise, autres : leur département ; **les collègues voient « Absent(e) » sans le type** — un congé maladie est une information de santé, Loi 25), *Soldes* (admins, `?year=`, `LeaveBalancesTable` + ajustements).
- **Paramètres** : carte « Types de congés » (`LeaveTypesCard`, ancre `#conges`) : nom, jours/année (vide = non décompté), couleur (palette du design system), actif, ajout (max 12) ; début de l'année de congés (1er janvier par défaut ; 1er mai = année de référence des vacances au Québec).
- **Routes** : `POST/GET /api/absences`, `PATCH /api/absences/[id]` (`approve` | `reject` | `cancel`), `POST /api/leave/types`, `PATCH /api/leave/types/[id]`, `PATCH /api/leave/settings`, `POST /api/leave/adjustments` (admins) ; middleware : `/api/leave/:path*`. Export CSV/PDF des congés : mêmes droits que l'approbation, colonnes Type et Jours, dans la langue de la personne.
- **Notifications dans la langue de chaque destinataire** : nouvelle fonction `notifyUsersLocalized` (`lib/notifications.ts`) — à réutiliser pour traduire les autres notifications. Nouvelle demande → admins + gérant(s) du département ; décision → l'employé ; annulation d'un congé approuvé → l'approbateur.
- **Tableau de bord** : « Congés à approuver » ne compte plus que les demandes que la personne peut traiter, lien direct vers l'onglet.
- **Historique** : `ABSENCE_CANCELLED`, `ABSENCE_TYPE_CREATED`, `ABSENCE_TYPE_UPDATED`, `ABSENCE_SETTINGS_UPDATED`, `ABSENCE_BALANCE_ADJUSTED`.
- **Pistes** : jours fériés (liste par entreprise, retirés du décompte), acquisition progressive des vacances selon l'ancienneté, report automatique en fin d'année.

### 7.31 Congés et absences — refonte « simple » + congés programmés (1er oct. 2026)

**Demande de l'utilisateur** : rendre la page compréhensible sans réfléchir (« une maman de 60 ans »). Vocabulaire : une **absence** = ce que l'employé demande ; un **congé** = ce que l'entreprise offre/programme. Les entreprises donnent des congés à des dates variables, pas seulement des jours fériés fixes.

- **Menu** : « Congés et absences » (EN « Time off & absences »). **Onglet « Mon espace »** : 2 colonnes — à gauche « Demander une absence » (`AbsenceForm`), à droite « Congés » (`CompanyLeaves`) — puis « Mes demandes » en dessous, pleine largeur. Les cartes de solde en haut ont été retirées ; à la place, une seule ligne sous le type choisi : « Il te reste 10 jours. »
- **Vocabulaire** : « solde » remplacé partout par « jours restants » (onglet admin « Jours restants », « Jours restants après approbation »), pour ne pas évoquer l'argent.
- **Congés programmés** (`CompanyLeave`) : titre, du/au, heures facultatives (« à partir de » le premier jour, « jusqu'à » le dernier), message, destinataires (toute l'entreprise ou certains départements). Admins : « Programmer un congé » / « Retirer » (`POST /api/leave/company`, `DELETE /api/leave/company/[id]`). Les personnes concernées sont notifiées dans leur langue (création et retrait d'un congé pas encore terminé). Affichés comme des annonces (à venir / en cours, « Dans 5 jours »).
- **Décompte** : les journées ENTIÈRES de congé programmé concernant la personne ne sont pas décomptées des demandes d'absence (`closedDaysFor`, `fullClosedDays`, 4e paramètre de `countLeaveDays`) ; une journée avec heures n'est pas retirée. L'aperçu du formulaire fait le même calcul (`closedDays`). Une demande déjà faite garde le nombre de jours calculé à sa création.
- **Calendrier** : ligne « Congés de l'entreprise » en tête (plein = journée entière, hachuré = avec heures).
- **Types par défaut** : « Maladie / obligations familiales » (2 j, un seul total comme aux normes du travail du Québec) remplace Maladie + Personnel. Les entreprises déjà créées gardent leur type « Personnel / famille » : à désactiver dans Paramètres si non voulu. La carte de Paramètres s'appelle « Types d'absence ».
- **Historique** : `ABSENCE_COMPANY_LEAVE_CREATED`, `ABSENCE_COMPANY_LEAVE_DELETED`.

### 7.32 Congés et absences — mots simples + décompte automatique (1er oct. 2026)

**Demande de l'utilisateur** : retirer tout ce qui fait « juridique » ou « argent » de l'interface, et que tout soit compté automatiquement.

- **Mots retirés de l'interface** : « Loi 25 » (bandeau du tableau de bord, carte « Confidentialité » de Paramètres) ; « solde » (le type « Sans solde » devient « Absence non payée », « les soldes repartent à zéro » devient « les jours repartent à zéro »). La loi reste documentée ici (7.28), pas à l'écran.
- **Décompte automatique** : toute absence approuvée est comptée, quel que soit son type. Types avec limite : « Il te reste X jours » ; types sans limite : « Tu as pris X jours cette année » (formulaire) et « X pris » (onglet admin « Jours restants », qui affiche maintenant tous les types actifs).
- **Congés de l'entreprise** : toujours **offerts** (décision de l'utilisateur) — jamais retirés des jours restants, mais comptés : badge « X jours de congé offerts cette année » dans la colonne Congés (journées entières, lun.-ven., année de congés en cours).

### 7.33 Retrait du type « Absence non payée » (1er oct. 2026)

**Demande de l'utilisateur** : aucune information sur la paie dans l'app — ce n'est pas à l'employé de décider s'il est payé ; l'app gère seulement les absences et les congés.

- Le type par défaut `UNPAID` (« Sans solde », puis « Absence non payée ») n'est plus créé pour les nouvelles entreprises. Pour les entreprises existantes, il reste en base mais est **ignoré partout** (`RETIRED_LEAVE_CODES` / `NOT_RETIRED` dans `lib/leave.ts`) : absent du formulaire, de Paramètres, des jours restants, et refusé par `POST /api/absences`. Une ancienne demande de ce type s'affiche « Autre ». Clé de traduction `leave.types.UNPAID` supprimée.
- Types par défaut désormais : Vacances (10 j), Maladie / obligations familiales (2 j), Autre (sans limite). L'admin peut toujours créer ses propres types.

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
- **Logo d'organisation (7.19) sans redimensionnement/recadrage/compression** : le fichier téléversé est stocké tel quel (jusqu'à 2 Mo, PNG/JPG/WEBP). Fonctionne bien en pratique (le badge l'affiche en `object-contain`), mais une image mal cadrée ou très lourde reste mal cadrée ou lourde — un vrai pipeline d'image (recadrage carré, compression) serait un ajout futur si le besoin se confirme.
- **Espace `/platform` (7.20) sans facturation réelle branchée** : la suspension d'une organisation reste une décision **manuelle** du SUPER_ADMIN (vous regardez si le paiement est arrivé, puis vous cliquez Suspendre) — le champ `Organization.plan` existe mais n'est relié à aucun système de paiement (Stripe, etc.) qui suspendrait automatiquement. Pas d'impersonation (se connecter en tant qu'une organisation cliente pour du support) ni de recherche/filtre sur la liste des organisations non plus.
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
- **Phase 4 : Auto-inscription employé via code d'organisation** (voir 7.18), à la demande explicite de l'utilisateur, avec deux décisions de design confirmées par lui après question directe : (1) un code d'invitation dédié et régénérable, distinct du `slug` public de l'organisation ; (2) activation immédiate du compte employé, sans approbation admin. Nouveau champ Prisma `Organization.inviteCode` (`String? @unique`) — **migration exécutée avec succès le 25 sept. 2026** : `npx prisma migrate dev --name add_organization_invite_code` (nom exact du dossier à relever dans `prisma/migrations/` et à reporter en 4.4 à l'occasion). Nouveau fichier `lib/invite-code.ts` (génération/normalisation du code). Nouvelles routes `GET`/`POST /api/organization/invite-code` (voir/régénérer, admin only), ajoutées à `middleware.ts`. Nouvelle route publique `POST /api/auth/join` (volontairement absente de `middleware.ts`, comme `/api/auth/register`). Nouvelle page admin `app/dashboard/settings/page.tsx` + `components/dashboard/InviteCodeCard.tsx` ; `nav-items.ts` : entrée "Paramètres" ajoutée (`adminOnly: true`). Nouvelle page publique `app/(auth)/join/page.tsx` + `components/auth/JoinForm.tsx` (connexion automatique après inscription, voir 7.18) ; liens croisés ajoutés sur `/login` et `/register`. `lib/activity-log.ts` : deux actions ajoutées (`USER_JOINED`, `USER_INVITE_CODE_REGENERATED` — cette dernière renommée le 26 sept., voir plus bas), catégorisées "Employés" comme le reste des actions `USER_*`. Notification (7.15) déclenchée vers les admins/gérants à chaque nouvelle auto-inscription. **Testé et confirmé fonctionnel par l'utilisateur en conditions réelles** (génération du code sur `/dashboard/settings`, inscription via `/join` avec connexion automatique, apparition dans la liste Employés).
- **Discussion commerciale (pas de code)** : rédaction d'un courriel de présentation du projet pour un contact professionnel de l'utilisateur (gérant d'une entreprise où il travaille), en vue d'un rendez-vous de démonstration. Suite à ses retours, le courriel met en avant les documents/horaires consultables sur téléphone (fin de l'attroupement devant le babillard physique), la déclaration d'absences en temps réel, et la messagerie ciblée permettant à l'admin de joindre n'importe quel employé à distance.
- **Phase 4 : Logo personnalisé par organisation** (voir 7.19), à la demande explicite de l'utilisateur : chaque organisation cliente doit pouvoir afficher son propre logo à ses propres employés, la plateforme étant destinée à héberger plusieurs entreprises. Nouveaux champs Prisma `Organization.logoData` (`Bytes?`), `logoMimeType` (`String?`), `logoUpdatedAt` (`DateTime?`) — **migration à exécuter localement** : `npx prisma migrate dev --name add_organization_logo` (pas encore lancée au moment de la rédaction ; mettre à jour la ligne de la section 4.4 avec le nom exact une fois fait). `lib/attachments.ts` : constantes `MAX_LOGO_SIZE`/`ALLOWED_LOGO_TYPES`/`isAllowedLogoType()` ajoutées. Nouvelle route `app/api/organization/logo/route.ts` (`GET` tout le monde avec redirection vers le logo par défaut si absent, `POST`/`DELETE` admin only), couverte par le motif `/api/organization/:path*` déjà présent dans `middleware.ts` (aucun ajout nécessaire). Nouveau composant `components/dashboard/LogoUploadCard.tsx` sur `/dashboard/settings` (au-dessus du code d'invitation). `DashboardShell.tsx` : logo codé en dur remplacé par `<img src="/api/organization/logo">`. **Renommage** : `lib/activity-log.ts` gagne une catégorie `ORGANIZATION` (icône `Building2` dans `CategoryIcon.tsx`) ; l'action `USER_INVITE_CODE_REGENERATED` (7.18) est renommée `ORGANIZATION_INVITE_CODE_REGENERATED` pour se regrouper avec les nouvelles actions `ORGANIZATION_LOGO_UPDATED`/`ORGANIZATION_LOGO_REMOVED` plutôt que sous "Employés" — sans impact sur les lignes déjà en base (voir 5.4). Les pages `(auth)` (connexion/inscription/rejoindre) gardent volontairement le logo de la plateforme : le logo par organisation n'apparaît qu'une fois connecté, périmètre explicitement demandé par l'utilisateur.

### 26 septembre 2026
- **Migration `add_organization_logo` exécutée** (déduit du fait que l'utilisateur a réussi à téléverser un logo réel — non explicitement confirmé en mots par l'utilisateur, à vérifier si un doute survient).
- **Ajustements visuels du logo d'organisation**, sur retours réels de l'utilisateur avec le vrai logo "Vachon" (client réel, Bimbo Vachon) : (1) badge de logo trop petit (`h-7 w-7`) pour un logo rectangulaire large → `DashboardShell.tsx` refondu avec une boîte blanche pleine largeur `h-16` (`object-contain`), `LogoUploadCard.tsx` mis à jour en conséquence (aperçu `h-16 w-56` fidèle au rendu réel) ; (2) contour/ombre visible autour de la boîte blanche du logo → retrait de la classe `shadow-sm` sur le conteneur dans `DashboardShell.tsx` (diagnostic par analyse pixel par pixel de la capture d'écran fournie, qui a écarté un défaut du fichier image lui-même). Correctifs livrés, à confirmer par l'utilisateur.
- **Phase 5 : Espace propriétaire / SUPER_ADMIN — `/platform`** (voir 7.20), à la demande explicite de l'utilisateur, verbatim : "étant le créateur je le contrôle sur mon application... je dois pouvoir désactiver une organisation si je ne reçois pas de paiement chaque mois... je veux avoir uniquement mon dashboard à moi... je dois voir toutes les entreprises qui créent leur organisation... je dois avoir une vue d'ensemble de ce qui se passe dans mon application." Nouveaux `OrganizationStatus` (enum) + `Organization.status`/`suspendedAt` — **migration à exécuter localement** : `npx prisma migrate dev --name add_organization_status` (pas encore lancée au moment de la rédaction ; mettre à jour la ligne de la section 4.4 avec le nom exact une fois fait). `lib/auth.ts` : connexion bloquée si l'organisation est `SUSPENDED` (vérifié après le mot de passe, jamais avant). `lib/session-guard.ts` : nouvelle classe `OrganizationSuspendedError`, `requireAuth()` revérifie le statut de l'organisation en base à chaque requête (coupe l'accès immédiatement, sans attendre l'expiration du token JWT de 8h) — le `SUPER_ADMIN` est exempté de cette vérification sur sa propre organisation. Nouvelle page `app/(auth)/suspended/page.tsx`. `app/dashboard/layout.tsx` : redirige tout `SUPER_ADMIN` vers `/platform` (n'a rien à faire dans le dashboard d'une entreprise cliente) et toute organisation `SUSPENDED` vers `/suspended`. Nouvel espace `app/platform/` (layout avec garde `SUPER_ADMIN`, page Vue d'ensemble avec KPIs globaux **sans filtre `organizationId`** — seul endroit de l'app où c'est volontaire, page Organisations avec tableau + suspendre/réactiver), nouveaux composants `components/platform/PlatformShell.tsx` (distinct de `DashboardShell`, pas de réutilisation) et `components/platform/OrganizationsTable.tsx` (client, confirmation en deux temps). Nouvelle route `app/api/platform/organizations/[id]/route.ts` (`PATCH`, `SUPER_ADMIN` only), journalise `ORGANIZATION_SUSPENDED`/`ORGANIZATION_REACTIVATED` dans l'historique de l'organisation CIBLE. `middleware.ts` : ajout de `/platform/:path*`, `/api/platform/:path*`, `/suspended` au `matcher`, avec garde de rôle supplémentaire (redirection/403 si pas `SUPER_ADMIN`). `lib/activity-log.ts` : deux actions ajoutées sous la catégorie `ORGANIZATION` existante. Nouveau script one-off `scripts/promote-super-admin.ts` (`npx tsx scripts/promote-super-admin.ts <identifiant-entreprise> <email>`) — seul moyen d'attribuer `SUPER_ADMIN`, volontairement absent de toute UI. Pas de facturation réelle branchée (voir section 10) : la suspension reste une décision manuelle.
- **Séparation des comptes propriétaire/admin** : l'utilisateur avait promu son seul compte "Mindmate Compagny" en `SUPER_ADMIN`, perdant l'accès au dashboard normal (voir 10 pour le détail complet et les scripts `set-user-role.ts`/`create-user.ts` ajoutés pour résoudre ça). Résultat final choisi par l'utilisateur : `millionaire02030@gmail.com` = `SUPER_ADMIN` (compte d'origine), `millionaire02030+admin@gmail.com` = `ORG_ADMIN` (nouveau compte, même organisation).
- **Correctif de build de production** : `npm run build` échouait avec 5 erreurs TypeScript jamais détectées par `npm run dev` (qui ne fait pas la même vérification de types complète). (1) Les 4 routes d'export PDF (`app/api/exports/{absences,activity,employees,reports}/route.ts`) passaient directement le `Buffer` renvoyé par `renderTablePdf()` (pdfkit) à `new Response(...)`, alors que le type strict attendu n'accepte pas `Buffer` tel quel — corrigé en enveloppant dans `new Uint8Array(...)`, même correctif que `GET /api/organization/logo` (7.19). (2) `app/dashboard/jobs/page.tsx` choisissait la forme de son `include` Prisma selon une condition calculée à l'exécution (`canManage ? {...} : {...}`) ; Prisma déduisant son type de retour depuis la valeur LITTÉRALE d'`include` à chaque appel, ce choix dynamique produisait un type union ambigu plus loin dans le fichier (`applications[].applicant` jugé potentiellement inexistant). Corrigé en séparant en deux requêtes Prisma distinctes (une par branche), chacune avec un `include` fixe — plus sûr, sans cast `as` fragile. **Leçon retenue** : ce pattern (`include`/`select` Prisma choisi par une variable plutôt qu'une valeur littérale) est à éviter partout ailleurs dans le projet pour la même raison ; aucune autre occurrence trouvée lors de cette correction, mais à surveiller dans les futurs ajouts.
- **Discussion performance** (pas de code, sauf ce qui précède) : l'utilisateur a demandé si l'app pouvait être rendue plus rapide et si elle fonctionne sur mobile (oui, confirmé — responsive + PWA installable, voir 7.17). Diagnostic : `lib/prisma.ts` (singleton) et `DATABASE_URL` (endpoint pooler Neon) sont déjà correctement configurés ; le principal facteur de lenteur perçue est l'utilisation de `npm run dev` (compilation à la demande, logs de requêtes Prisma verbeux) plutôt qu'un build de production. Compromis identifié et signalé à l'utilisateur (pas encore tranché) : la vérification de statut de suspension dans `requireAuth()` (7.20) ajoute un aller-retour base de données à chaque requête authentifiée, pour un accès coupé immédiatement — une mise en cache à durée limitée réduirait ce coût au prix d'un délai avant qu'une suspension prenne effet.

### 27 septembre 2026
- **Mise en ligne sur Vercel** (voir 7.21), à la demande explicite de l'utilisateur ("transformer tout mon projet en application installable"). Diagnostic posé avant d'agir : la PWA (7.17) était déjà complète et correcte (vérification pixel par pixel des icônes existantes — 192×192, 512×512, 512×512 maskable, 180×180 apple-touch-icon —, toutes conformes), le seul obstacle réel à une installation depuis un téléphone était que l'app ne tournait qu'en local. Question posée directement à l'utilisateur (déployer maintenant vs. tester l'installation en local d'abord) : a choisi de déployer. Correctif préventif avant le premier déploiement : ajout de `"postinstall": "prisma generate"` dans `package.json` (absent jusqu'ici — sans cette ligne, le build Vercel n'aurait pas régénéré `@prisma/client`, un oubli classique sur les projets Next.js + Prisma). Déploiement fait via la CLI Vercel (`npx vercel`) directement depuis le dossier local, aucun dépôt Git n'existant à ce stade. Variables d'environnement reportées manuellement sur le dashboard Vercel (`DATABASE_URL` et `NEXTAUTH_SECRET` identiques au `.env` local — même base Neon partagée entre dev et prod pour l'instant —, `NEXTAUTH_URL` mise à jour avec l'URL réelle `*.vercel.app` puis re-déploiement en production pour que ça prenne effet). Aucune migration Prisma supplémentaire nécessaire (même base de données qu'en local).
- **Bug réel découvert et corrigé, invisible depuis le début du projet** : une fois en ligne, visiter le site avec un navigateur sans session menait au formulaire de connexion **générique de next-auth** (`/api/auth/signin`, champs "Email"/"Mot de passe"/"Entreprise" sans aucun style) au lieu de la vraie page `/login` de l'app (avec son design, son logo, etc.). Resté invisible pendant tout le développement local parce que le navigateur de dev gardait déjà une session valide (le bug ne se déclenche que pour un visiteur SANS session) — découvert seulement en testant depuis un navigateur "neuf" sur l'URL de production. Corrigé en **deux temps**, les deux étant nécessaires :
  1. Dans `lib/auth.ts` : l'option `pages: { signIn: "/login" }` d'`authOptions` était présente mais **entièrement commentée** — décommentée.
  2. **Insuffisant seul** (le bug persistait après le premier redéploiement) : `withAuth` dans `middleware.ts` tourne dans un contexte Edge séparé de `app/api/auth/[...nextauth]/route.ts` et **ne lit pas** le `pages` défini dans `lib/auth.ts` — il faut le redéclarer explicitement dans le second objet passé à `withAuth`, à côté de `callbacks`. Le commentaire d'origine sur `authorized` ("false = redirige vers /login") était donc faux tant que ce `pages` n'y était pas. Ajouté dans `middleware.ts`.
  
  Nouveau déploiement (`vercel --prod`) nécessaire après chacun de ces deux correctifs pour qu'ils prennent effet. **Confirmé résolu par l'utilisateur** : `/login` affiche maintenant la vraie page (logo, design) sur l'URL de production.
- **Piège rencontré pendant cette correction, à surveiller** : entre deux corrections de fichiers via l'assistant, `middleware.ts` et `lib/auth.ts` sont revenus tout seuls à leur ancien contenu (constaté en relisant les fichiers directement sur la machine juste après leur écriture). Cause probable, non confirmée avec certitude : présence de fichiers `*-1.ts`/`*-1.md` dans le projet (`middleware-1.ts`, `AUDIT-1.md`, `activity-log-1.ts`) qui ressemblent à des copies de conflit d'un outil de synchronisation de fichiers (OneDrive/Drive/Dropbox) sur le dossier `mon-projet`, ou un éditeur de code encore ouvert sur l'ancienne version qui l'a réenregistrée par-dessus. Si un correctif semble "disparaître" à nouveau à l'avenir, vérifier ces deux pistes en premier avant de chercher un bug côté code. **Suite (voir plus bas)** : le phénomène s'est reproduit plusieurs fois le lendemain sans qu'aucun éditeur ne soit ouvert (confirmé par l'utilisateur) — la cause exacte reste donc non identifiée avec certitude ; le seul remède qui a fonctionné à chaque fois a été de relire le fichier juste après l'avoir envoyé et de renvoyer si besoin (parfois 2-3 essais) avant de continuer.
- **`.env` embarqué par erreur dans le déploiement Vercel** : repéré dans les journaux de construction ("Environment variables loaded from .env" / "Detected .env file, it is strongly recommended to use Vercel's env handling instead"). Cause : sans dépôt Git, la CLI Vercel ne peut pas se baser sur `.gitignore` pour savoir quoi exclure de l'upload — elle envoie tout le dossier, `.env` (secrets bruts) compris. Corrigé en ajoutant un nouveau fichier `.vercelignore` à la racine (`.env` et `.env.*`), qui fonctionne indépendamment de tout dépôt Git.
- **`DATABASE_URL` mal formée sur Vercel → connexion refusée avec une erreur Prisma** (`the URL must start with the protocol postgresql:// ou postgres://`). Cause : la valeur collée dans le champ "Value" du dashboard Vercel était la ligne `.env` complète, guillemets compris (`DATABASE_URL="postgresql://..."`), alors que Vercel utilise la valeur **littéralement**, sans jamais retirer les guillemets comme le fait dotenv pour un fichier `.env` local. Corrigé en ne collant que la chaîne brute (sans guillemets, sans le nom de la variable) dans le champ Vercel. **Rappel sécurité, pas encore fait par l'utilisateur au moment de la rédaction** : le mot de passe réel de la base Neon est passé en clair dans la conversation avec l'assistant pendant ce diagnostic — à régénérer via Neon Console → Connection Details → "Reset password", puis à reporter dans `DATABASE_URL` (local **et** Vercel).
- **Bug réel majeur, le plus long à diagnostiquer de cette mise en ligne : connexion acceptée (`POST /api/auth/callback/credentials` → 200) mais `/dashboard` renvoie systématiquement vers `/login` (307)**, cookie de session pourtant bien présent. Diagnostic mené entièrement par les journaux runtime Vercel (`vercel logs <url> --json`) et les DevTools du navigateur (onglet Network), en éliminant les pistes une par une :
  1. Cookie bien posé par `next-auth` (`Set-Cookie: __Secure-next-auth.session-token=...; HttpOnly; Secure; SameSite=Lax`) — confirmé via l'onglet Network sur la requête `credentials`.
  2. Cookie bien renvoyé par le navigateur sur la requête suivante vers `/dashboard` — confirmé via l'onglet Cookies de cette même requête dans DevTools.
  3. `NEXTAUTH_URL`/`NEXTAUTH_SECRET`/`DATABASE_URL` bien scopées "Production" dans Vercel, et bien prises en compte (redéploiement fait après chaque correction) — écarté comme piste.
  4. Log temporaire ajouté des deux côtés (route API `lib/auth.ts` callback `jwt`, et `middleware.ts`) affichant la longueur + les 3 premiers/derniers caractères de `NEXTAUTH_SECRET` (jamais le secret en clair) : **valeur strictement identique dans les deux runtimes** (Node/serverless et Edge/middleware) — écarte un mismatch de secret entre les deux environnements.
  5. **Cause réelle trouvée** : `getToken()` de `next-auth/jwt` (utilisé en interne par `withAuth()` de `next-auth/middleware`) renvoie systématiquement `null` pour ce cookie dans le runtime Edge de ce projet (Next.js 16.3.5 + next-auth 4.24.15), **sans lever d'erreur** (`getToken()`/`withAuth()` avalent silencieusement toute erreur de décodage — un piège en soi pour le débogage). Confirmé en appelant `decode()` de `next-auth/jwt` directement sur le cookie brut, avec le même secret : **succès**, avec le bon `role` dans le token décodé. Le bug est donc une incompatibilité de `getToken()` avec ce runtime/cette version de Next.js, pas un problème de secret, de cookie, ou de configuration.
  6. **Correctif** : `middleware.ts` réécrit pour ne plus utiliser `withAuth()`/`getToken()` — lit le cookie de session lui-même (`req.cookies.get("__Secure-next-auth.session-token")`) et appelle `decode()` directement. Voir section 5.6 (code à jour) pour le détail. **Confirmé résolu par l'utilisateur** : connexion réussie, accès au dashboard.
  7. **Point de vigilance pour toute évolution future de `middleware.ts`** : ne pas réintroduire `withAuth()`/`getToken()` sans retester spécifiquement ce scénario (connexion → accès direct à `/dashboard`) sur le déploiement Vercel réel, pas seulement en local — le bug ne s'est jamais manifesté en développement local.
  8. **Découverte additionnelle en creusant le fingerprint du point 4** : la valeur de `NEXTAUTH_SECRET` réellement utilisée sur Vercel (21 caractères, commence par `"htt"`, finit par `"000"`) ne correspondait PAS à la vraie valeur forte du `.env` local (44 caractères, générée aléatoirement) — elle ressemblait à une URL (`http://localhost:...`) collée par erreur dans le mauvais champ à un moment antérieur du projet. N'expliquait pas le bug ci-dessus (secret identique des deux côtés SUR VERCEL, donc cohérent avec lui-même), mais restait une clé de chiffrement faible en production. Corrigée en même temps que la rotation du mot de passe Neon ci-dessous : `NEXTAUTH_SECRET` sur Vercel remplacée par la vraie valeur du `.env` local.
- **Rotation du mot de passe Neon effectuée** (suite du rappel sécurité du point précédent) : mot de passe changé directement en SQL (`ALTER USER neondb_owner WITH PASSWORD '...'`, via `npx prisma db execute --stdin --url="..."` — pas besoin de retrouver le compte/l'organisation Neon exacte dans la console web, qui s'est avérée introuvable pour l'utilisateur, probablement provisionnée sous un compte/une organisation Neon différent de celui utilisé pour se connecter à console.neon.tech). `DATABASE_URL` mise à jour dans le `.env` local et sur Vercel avec le nouveau mot de passe ; `NEXTAUTH_SECRET` sur Vercel corrigée en même temps (point 8 ci-dessus). Redéployé et **confirmé fonctionnel par l'utilisateur**.
- **Bug de déconnexion, découvert juste après la rotation ci-dessus** : cliquer sur "Se déconnecter" redirigeait vers une adresse inexistante (`https://<chaîne aléatoire>/login`, erreur DNS), sur ordinateur comme sur mobile. Diagnostic mené via l'onglet Network de DevTools (sous-onglet **Cookies** de la requête `POST /api/auth/signout`) : le cookie `_Secure-next-auth.callback-url` renvoyé par le serveur contenait une adresse construite à partir de `NEXTAUTH_URL`. En allant vérifier cette variable sur le dashboard Vercel, elle s'est révélée configurée en type **Secret** — donc jamais consultable après enregistrement — et sa valeur réelle était en fait une ancienne chaîne ressemblant à un secret, pas une URL. Recoupé avec le point 8 plus haut (où c'est l'inverse qui s'était produit : l'ancien `NEXTAUTH_SECRET` ressemblait à une URL) : les deux variables ont manifestement été inversées ou mal collées à un moment antérieur du projet, et le fait que `NEXTAUTH_URL` soit en type Secret a caché le problème jusqu'ici puisque personne ne pouvait relire sa valeur pour s'en rendre compte. **Corrigé** en écrasant directement la valeur de `NEXTAUTH_URL` sur Vercel avec la vraie URL de production (`https://mon-projet-omega-eight.vercel.app`), puis en forçant un déploiement complet avec `vercel --prod --force` (le `--force` compte : un simple "Redeploy" depuis le dashboard peut réutiliser le cache de build et ne pas relire la variable corrigée). **Confirmé résolu par l'utilisateur.**
  - **Point de vigilance** : `NEXTAUTH_URL` restera en type Secret sur Vercel (impossible à changer en type normal après coup sans la supprimer et la recréer — non fait, jugé non prioritaire). Si une adresse de redirection cassée réapparaît un jour, écraser directement sa valeur plutôt que de perdre du temps à essayer de la "vérifier" au préalable : ce n'est pas possible depuis le dashboard.
- **Fausse alerte investiguée et classée : boucle de requêtes `/api/reports` sur `/login`** (signalée par l'utilisateur comme "les requêtes se répètent en boucle toutes les ~1 seconde"). Aucun code trouvé dans le projet qui appellerait `/api/reports` automatiquement (seul `ReportForm.tsx` le fait, uniquement au clic, sur `/dashboard/reports` — jamais sur `/login`) : aucun `setInterval`, aucun polling, aucun `useEffect` suspect. L'onglet Network montrait une requête `POST /api/reports` → `307` vers `/login?callbackUrl=...` → `405` (une page ne répond pas au POST), en boucle, avec des initiateurs anonymes (`VM265:1`, `VM267:1`, ...) — signature typique d'une extension de navigateur injectant du code, pas du code du site. **Confirmé** : le même test en navigation privée (extensions désactivées par défaut sur Chrome) ne montre plus aucune boucle, page propre en 8 requêtes. **Conclusion : bug de l'extension Chrome installée chez l'utilisateur, pas de l'application.** Rien à corriger côté code. Pour identifier l'extension fautive si besoin : désactiver les extensions une par une dans `chrome://extensions` en navigation normale jusqu'à disparition de la boucle.
- **PWA — installation testée et confirmée fonctionnelle**, sur iPhone (Safari, "Sur l'écran d'accueil" — pas possible depuis l'app Google ni Chrome sur iOS, restriction d'Apple, pas un bug du site) et sur ordinateur (Chrome/Edge, icône d'installation dans la barre d'adresse). **Nom d'application changé** de "Portail employé" vers **"Mindmate Compagny"** (nom définitif choisi par l'utilisateur) : mis à jour dans `app/manifest.ts` (`name`/`short_name`) et `app/layout.tsx` (`appleWebApp.title`, c'est celui-ci qu'iOS utilise réellement pour le nom sous l'icône sur l'écran d'accueil). Une icône déjà installée avant ce changement garde l'ancien nom : il faut la supprimer et la réinstaller pour voir le nouveau nom.
- **Mise sous contrôle de version (Git) et sauvegarde distante (GitHub)** : le projet était déployé depuis le début uniquement via la CLI Vercel, sans aucun dépôt Git — aucun historique, aucune sauvegarde du code en dehors de la machine locale et de Vercel. Corrigé :
  1. `git init` dans le dossier du projet. `.gitignore` déjà présent et correct (exclut `node_modules`, `.env*`, `.next`, `.vercel`) ; ajout de `logs.json` à la liste (fichier de diagnostic pouvant contenir des informations sensibles).
  2. Premier commit vérifié avant validation : `git status` inspecté pour confirmer l'absence de `.env` ou `node_modules` dans les fichiers à commiter — propre.
  3. **Nettoyage** : suppression des fichiers de copie/conflit qui traînaient depuis un moment (`AUDIT-1.md`, `middleware-1.ts`, `lib/activity-log-1.ts`, `prisma/schema-1.prisma`, `components/dashboard/nav-items-1.ts` — voir point de vigilance plus haut sur les reversions de fichiers) et du dossier `auto-inscription-code-invitation/` (copie complète imbriquée d'une ancienne étape du projet).
  4. Dépôt GitHub créé (`djibrilo10/mindmate-compagny`, privé) et code poussé (`git push -u origin main`).
  5. Vercel connecté directement à ce dépôt GitHub (Settings > Git > Connect Git Repository) : **chaque `git push` sur `main` déclenche désormais un déploiement automatique en production**, remplaçant le `vercel --prod` manuel utilisé jusqu'ici. Une branche autre que `main` créerait un déploiement de prévisualisation séparé.
- **Nom de domaine personnalisé** : achat de `mindmatecompagny.com` directement via l'onglet Domains de Vercel (configuration DNS automatique). Le domaine racine redirige (308) vers `www.mindmatecompagny.com`, qui est la vraie adresse de production — c'est cette version avec `www` qu'il faut utiliser partout (`NEXTAUTH_URL` compris). `NEXTAUTH_URL` mise à jour en conséquence (`https://www.mindmatecompagny.com`) puis redéploiement forcé (`vercel --prod --force`). L'ancienne adresse `mon-projet-omega-eight.vercel.app` reste active en parallèle (utile en secours).
- **Bug réel corrigé : connexion refusée sur mobile pour une adresse courriel par ailleurs valide** (ex. l'alias `...+admin@gmail.com`, fonctionnel sur ordinateur mais rejeté sur téléphone avec "Entrez une adresse courriel valide"). Cause probable : les claviers mobiles ajoutent parfois un espace invisible en fin de saisie (souvent via l'auto-complétion du domaine, ex. suggestion "@gmail.com"), plus susceptible de se produire sur une adresse longue avec un alias `+...`. La validation côté client (`zod`, dans `lib/validations/auth.ts`) rejetait cet espace avant même l'envoi au serveur — le `.trim()` déjà présent côté serveur dans `lib/auth.ts` (`authorize()`) n'intervenait donc jamais. **Corrigé** en ajoutant `.trim()` avant `.email()` dans les trois schémas concernés (`loginSchema`, `registerSchema`, `joinSchema`). **Confirmé résolu par l'utilisateur.**
- **Notifications push (badge sur l'icône + son système), version complète Web Push** — demande explicite : "afficher 1 sur l'icone de l'application, un peu comme les applications modernes, si possible ajouter meme la sonorité d'application". Choix fait avec l'utilisateur entre une version simple (app ouverte uniquement) et la version complète (fonctionne même app fermée) : **version complète retenue**.
  - **Architecture** : paire de clés VAPID (identification du serveur auprès des services de push des navigateurs) générée manuellement (le registre npm étant inaccessible depuis l'environnement de génération, les clés ont été produites directement avec le module `crypto` de Node, format strictement identique à celui du paquet `web-push`). Nouveau modèle Prisma `PushSubscription` (`endpoint` unique, `p256dh`, `auth`, relation vers `User`) — un abonnement par appareil/navigateur. `lib/push.ts` (serveur) : envoie la notification via `web-push`, supprime automatiquement un abonnement expiré (404/410). `lib/push-client.ts` (navigateur) : demande la permission, s'abonne, envoie l'abonnement à `POST /api/push/subscribe`. `public/sw.js` : écouteur `push` qui affiche la notification système (son par défaut du système d'exploitation — aucun moyen fiable multi-navigateur d'imposer un son personnalisé côté Web) ET met à jour le badge numérique de l'icône via l'API Badging (`setAppBadge`/`clearAppBadge`), fonctionne même app complètement fermée. `lib/notifications.ts` déclenche l'envoi push après chaque écriture en base, dans un `try/catch` pour ne jamais faire échouer la création de la notification elle-même si l'envoi push échoue. `components/dashboard/PushNotificationsToggle.tsx` : bouton Activer/Désactiver sur la page Notifications. `NotificationsList.tsx` : filet de sécurité qui resynchronise aussi le badge quand l'app est ouverte (au cas où le push aurait été manqué).
  - **Bug réel corrigé — build Vercel en échec (`npm run build` sortie avec 1)** : erreur TypeScript `TS2322` dans `lib/push-client.ts` ligne 41, `Uint8Array<ArrayBufferLike>` non assignable au type attendu par `applicationServerKey` (`BufferSource`). Cause : évolution récente des types DOM de TypeScript (les tableaux typés comme `Uint8Array` sont désormais génériques), qui casse la compatibilité implicite qui existait avant avec `BufferSource` — pas une erreur de logique. **Corrigé** en ajoutant `as BufferSource` à l'appel (`applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource`). **Confirmé résolu** (déploiement repassé au vert).
  - **Point local, pas un bug de l'application** : `npx prisma migrate dev` a échoué à plusieurs reprises depuis le réseau wifi habituel de l'utilisateur (`P1001`, connexion impossible) alors que le port 5432 répondait (test `Test-NetConnection` positif) — signature d'un blocage réseau plus profond que le simple TCP (pare-feu/box). Contournement : bascule sur le partage de connexion du téléphone, ce qui a débloqué la connexion mais révélé une seconde erreur (`P1000`, authentification refusée) — le `DATABASE_URL` du `.env` local contenait un mot de passe périmé. **Corrigé** en recopiant la chaîne de connexion à jour depuis Neon Console (Connect → Pooled connection) dans le `.env`, migration passée avec succès.
  - **Rappel sécurité** : `VAPID_PRIVATE_KEY` doit être traitée comme n'importe quel autre secret (jamais commitée, jamais partagée) — la régénérer invaliderait tous les abonnements déjà enregistrés (chaque utilisateur devrait réactiver les notifications). Variables `NEXT_PUBLIC_VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` ajoutées au `.env` local et sur Vercel (Production).
  - **Confirmé fonctionnel de bout en bout par l'utilisateur** ("c'est bon ca marche").

---

### 29 septembre 2026
- **Équipe d'administration (7.22) et Sondages (7.23)**, à la demande explicite de l'utilisateur (décisions confirmées : promotion OU création de compte, 2 co-admins max, anonymat choisi par sondage, plusieurs questions par sondage).
- **Migration Prisma exécutée avec succès** (`20260929065448_add_admin_team_and_surveys`) après deux blocages locaux déjà connus : P1001 (réseau, contourné) puis P1000 (mot de passe périmé dans `.env`, corrigé en recopiant la chaîne « Pooled connection » depuis la console Neon — le projet Neon s'appelle « Compagnie FocusMind », branche Production, endpoint `ep-red-haze-b4bh6pnl`). Contenu (Organization.primaryAdminId, enum SurveyStatus, modèles Survey/SurveyQuestion/SurveyOption/SurveyParticipation/SurveyAnswer, relations sur User et Organization).
- **Sécurité** : `requireAuth()` relit rôle + statut en base à chaque requête (un compte désactivé ou un rôle retiré prend effet immédiatement) ; `PATCH /api/users/[id]` refuse désormais de toucher un compte admin.
- Nouveaux fichiers : `lib/admins.ts`, `lib/surveys.ts`, `app/api/admins/route.ts`, `app/api/admins/[id]/route.ts`, `app/api/surveys/route.ts`, `app/api/surveys/[id]/route.ts`, `app/api/surveys/[id]/responses/route.ts`, `app/dashboard/surveys/page.tsx`, `app/dashboard/surveys/[id]/page.tsx`, `components/dashboard/AdminsCard.tsx`, `SurveyManager.tsx`, `SurveyAnswerForm.tsx`, `SurveyResultsView.tsx`.
- Fichiers modifiés : `prisma/schema.prisma`, `lib/session-guard.ts`, `lib/activity-log.ts`, `app/dashboard/layout.tsx`, `app/dashboard/page.tsx`, `app/dashboard/settings/page.tsx`, `app/api/users/[id]/route.ts`, `app/api/auth/register/route.ts` (le créateur devient admin principal), `components/dashboard/EmployeesTable.tsx`, `CategoryIcon.tsx`, `nav-items.ts`, `middleware.ts` (`/api/admins`, `/api/surveys`).
- Vérification : compilation TypeScript isolée (sans `node_modules`, registre npm inaccessible depuis l'environnement de travail) — aucune erreur de syntaxe, uniquement le bruit d'environnement connu (modules introuvables, `any` implicites). **Non testé en conditions réelles** au moment de la rédaction : à valider par l'utilisateur après la migration.

### 29 septembre 2026 (suite)
- Co-admins et sondages **testés et validés par l'utilisateur** en local.
- **Propriétaire invisible + support privé** (voir 7.24), à la demande explicite de l'utilisateur. **Migration à exécuter** : `npx prisma migrate dev --name add_platform_support`.
- Nouveaux fichiers : `lib/visibility.ts`, `lib/support.ts`, `app/api/support/route.ts`, `app/api/support/[id]/route.ts`, `app/api/support/[id]/messages/route.ts`, `components/dashboard/SupportCard.tsx`, `app/platform/support/page.tsx`, `app/platform/support/[id]/page.tsx`, `components/platform/PlatformSupportThread.tsx`.
- Fichiers modifiés : `prisma/schema.prisma`, `lib/notifications.ts`, `middleware.ts`, `app/dashboard/{page,employees/page,new-hires/page,departments/page,activity/page,settings/page}.tsx`, `app/api/exports/{employees,activity}/route.ts`, `app/api/messages/route.ts`, `app/api/messages/[counterpartId]/route.ts`, `app/api/users/[id]/route.ts`, `app/platform/layout.tsx`, `components/platform/PlatformShell.tsx`.
- Vérification : compilation TypeScript isolée, bruit d'environnement seulement ; non testé en conditions réelles au moment de la rédaction.

### 29 septembre 2026 (suite 2)
- Propriétaire invisible + support **testés et validés par l'utilisateur**.
- **Notifications du propriétaire** (7.25) : aucune migration. Nouveau fichier `app/platform/notifications/page.tsx` ; modifiés `components/platform/PlatformShell.tsx`, `app/platform/layout.tsx`, `app/platform/support/[id]/page.tsx`, `lib/activity-log.ts`, `components/dashboard/CategoryIcon.tsx`.

- **Nettoyage des données de test** : nouveau script one-off `scripts/delete-test-reports.ts` (`npx tsx scripts/delete-test-reports.ts <identifiant-entreprise>` pour l'aperçu, `--confirm` pour supprimer). Supprime uniquement les signalements intitulés exactement « Test Entreprise A » (≈292, créés en masse le 27 sept. 2026 dans l'organisation Mindmate Compagny) + leurs notifications `REPORT_CREATED` et lignes d'historique. Tous les autres signalements sont conservés.

### 30 septembre 2026
- **Employee Retention Intelligence** (7.26), à la demande explicite de l'utilisateur. **Migration à exécuter** : `npx prisma migrate dev --name add_departures`.
- Nouveaux fichiers : `lib/retention-config.ts`, `lib/retention.ts`, `lib/departures.ts`, `app/api/departures/route.ts`, `app/api/departures/me/route.ts`, `app/api/departures/[id]/route.ts`, `app/dashboard/retention/page.tsx`, `app/dashboard/retention/[id]/page.tsx`, `app/dashboard/departure/page.tsx`, `components/dashboard/{DepartureSurveyForm,RecordDepartureForm,CancelDepartureButton}.tsx`.
- Fichiers modifiés : `prisma/schema.prisma`, `middleware.ts` (`/api/departures`), `lib/activity-log.ts`, `components/dashboard/{CategoryIcon,Sidebar}.tsx`, `components/dashboard/nav-items.ts`, `app/dashboard/page.tsx`.
- Vérification : compilation TypeScript isolée (bruit d'environnement seulement) ; un vrai bogue attrapé au passage (`...VISIBLE_USER` après `role: { in: [...] }` écrasait le filtre de rôle — retiré à cet endroit). Non testé en conditions réelles au moment de la rédaction.

- **Fin d'emploi & transition** (7.27), à la demande explicite de l'utilisateur. **Migration à exécuter** : `npx prisma migrate dev --name add_departure_transition`. Nouveaux : `components/dashboard/TransitionCard.tsx`, `components/dashboard/LocalDateTime.tsx`. Modifiés : `prisma/schema.prisma`, `lib/retention-config.ts`, `lib/retention.ts`, `lib/activity-log.ts`, `app/api/departures/[id]/route.ts` (PATCH), `app/dashboard/retention/page.tsx`, `app/dashboard/retention/[id]/page.tsx`, `app/dashboard/departure/page.tsx`.

### 1er octobre 2026
- **Confidentialité — Loi 25** (7.28), à la demande explicite de l'utilisateur. **Migration à exécuter** : `npx prisma migrate dev --name add_privacy` (inclut aussi les champs 7.27, jamais migrés). **Variable Vercel à ajouter** : `CRON_SECRET`.
- Nouveaux : `lib/privacy.ts`, `app/api/cron/privacy-purge/route.ts`, `app/api/organization/privacy/route.ts`, `components/dashboard/{PrivacyNotice,PrivacyCard}.tsx`, `vercel.json`.
- Modifiés : `prisma/schema.prisma`, `lib/activity-log.ts`, `lib/surveys.ts`, `components/dashboard/{DepartureSurveyForm,SurveyAnswerForm,ActivityLogList}.tsx`, `app/api/departures/me/route.ts`, `app/api/surveys/[id]/responses/route.ts`, `app/dashboard/{departure,surveys,settings}/page.tsx`.

- **Durée choisie par l'admin principal** (7.28, à la demande de l'utilisateur : « pas automatiquement 3 ans ») : `dataRetentionMonths` nullable sans défaut, options 6/12/24/36/60 mois, bandeau de rappel sur le tableau de bord, purge limitée aux organisations ayant choisi. Migration écrite à la main `20261001050000_retention_chosen_by_admin` (à appliquer avec `npx prisma migrate dev`). Modifiés : `prisma/schema.prisma`, `lib/privacy.ts`, `lib/activity-log.ts`, `components/dashboard/{PrivacyNotice,PrivacyCard}.tsx`, `app/dashboard/page.tsx`.

- **Version anglaise — étape 1** (7.29), à la demande explicite de l'utilisateur. **Migration à exécuter** : `npx prisma migrate dev --name add_locale`. Nouveaux : `lib/i18n/{config,translator,dictionaries,server,format}.ts`, `lib/i18n/messages/{fr,en}.ts`, `components/i18n/{I18nProvider,LanguageSwitcher}.tsx`, `components/dashboard/LanguageCard.tsx`, `app/api/locale/route.ts`, `app/api/organization/locale/route.ts`. Modifiés : `prisma/schema.prisma`, `app/layout.tsx`, `app/(auth)/*`, `components/auth/{Login,Register,Join}Form.tsx`, `lib/validations/auth.ts`, `app/api/auth/{register,join}/route.ts`, `app/dashboard/{layout,page}.tsx`, `app/dashboard/settings/page.tsx`, `components/dashboard/{DashboardShell,Sidebar,Topbar,SignOutButton,nav-items,LogoUploadCard,InviteCodeCard,AdminsCard,SupportCard,PrivacyCard,PrivacyNotice,LocalDateTime,DepartureSurveyForm,SurveyAnswerForm}`, `lib/privacy.ts`, `lib/activity-log.ts`.
- **Incident évité** : une copie groupée du dossier de transfert avait remplacé des fichiers de travail par d'anciennes versions ; détecté avant tout envoi vers le PC, fichiers recopiés depuis le PC. Règle : ne copier que les fichiers transférés à l'instant, jamais tout le dossier.

- **Congés et absences** (7.30), à la demande explicite de l'utilisateur. **Migration à exécuter** : `npx prisma migrate dev --name add_leave`. Nouveaux : `lib/leave.ts`, `lib/leave-format.ts`, `components/dashboard/{LeaveApprovals,LeaveBalancesTable,LeaveTypesCard}.tsx`, `app/api/leave/{types,types/[id],settings,adjustments}/route.ts`. Réécrits : `app/dashboard/absences/page.tsx`, `components/dashboard/{AbsenceForm,AbsencesList}.tsx`, `app/api/absences/route.ts`, `app/api/absences/[id]/route.ts`, `app/api/exports/absences/route.ts`. Modifiés : `prisma/schema.prisma`, `middleware.ts`, `lib/notifications.ts` (`notifyUsersLocalized`), `lib/activity-log.ts`, `lib/i18n/messages/{fr,en}.ts`, `app/dashboard/{page,settings/page}.tsx`.

- **Congés et absences — refonte simple** (7.31), à la demande explicite de l'utilisateur. **Migration à exécuter** : `npx prisma migrate dev --name add_company_leave`. Nouveaux : `components/dashboard/CompanyLeaves.tsx`, `app/api/leave/company/route.ts`, `app/api/leave/company/[id]/route.ts`. Modifiés : `prisma/schema.prisma`, `lib/leave.ts`, `lib/leave-format.ts`, `lib/activity-log.ts`, `lib/i18n/messages/{fr,en}.ts`, `components/dashboard/AbsenceForm.tsx`, `app/dashboard/absences/page.tsx`, `app/api/absences/route.ts`.

- **Mots simples + décompte automatique** (7.32), à la demande explicite de l'utilisateur. Aucune migration. Modifiés : `lib/i18n/messages/{fr,en}.ts`, `components/dashboard/{AbsenceForm,CompanyLeaves,LeaveBalancesTable}.tsx`, `app/dashboard/absences/page.tsx`.

- **Retrait du type « Absence non payée »** (7.33), à la demande explicite de l'utilisateur. Aucune migration. Modifiés : `lib/leave.ts`, `lib/leave-format.ts`, `app/api/absences/route.ts`, `lib/i18n/messages/{fr,en}.ts`.

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
