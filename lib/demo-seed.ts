import { randomBytes, randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { DEMO_ACCOUNTS, DEMO_ORG_SLUG } from "./demo";
import { hashPassword } from "./password";
import { addDays, mondayOf, todayInZone } from "./schedule-time";

// ------------------------------------------------------------
// Données de l'entreprise de DÉMONSTRATION (AUDIT.md 7.43) — « Café Boréal »,
// entreprise et personnes fictives.
//
// - ensureDemoOrganization : crée l'entreprise, ses départements et ses
//   employés s'ils n'existent pas (les comptes gardent toujours le même id :
//   un visiteur en pleine visite n'est jamais déconnecté par un rafraîchissement).
// - refreshDemoData : efface puis recrée tout ce qui dépend de la date
//   (quarts, échanges, congés, annonces, messages…) autour d'AUJOURD'HUI.
// - refreshDemoIfStale : appelé à chaque « Voir la démo » ; ne rafraîchit
//   qu'une fois toutes les 20 h, un seul à la fois (verrou Postgres).
//
// Imports RELATIFS seulement : utilisé aussi par scripts/seed-demo.ts.
// ------------------------------------------------------------

type Db = PrismaClient | Prisma.TransactionClient;

const REFRESH_EVERY_MS = 20 * 3600_000;
const LOCK_KEY = 74300743; // verrou « rafraîchissement de la démo »

const DEPARTMENTS = [
  { key: "kitchen", name: "Cuisine", color: "#C9542C" },
  { key: "service", name: "Service", color: "#1F8A6E" },
  { key: "cash", name: "Caisse", color: "#3F6FB0" },
] as const;
type DeptKey = (typeof DEPARTMENTS)[number]["key"];

type Person = {
  key: string;
  firstName: string;
  lastName: string;
  dept: DeptKey;
  role: "ORG_ADMIN" | "MANAGER" | "EMPLOYEE";
  email?: string;
  days: number[]; // 0 = lundi
  start: number;
  end: number;
  position: string;
  hiredDaysAgo: number;
};

const h = (hours: number, minutes = 0) => hours * 60 + minutes;

const PEOPLE: Person[] = [
  { key: "sophie", firstName: "Sophie", lastName: "Gagnon", dept: "service", role: "ORG_ADMIN", email: DEMO_ACCOUNTS.manager, days: [0, 1, 2, 3, 4], start: h(8), end: h(16), position: "Gérance", hiredDaysAgo: 2100 },
  { key: "marc", firstName: "Marc", lastName: "Bouchard", dept: "kitchen", role: "MANAGER", days: [1, 2, 3, 4, 5], start: h(10), end: h(18), position: "Chef", hiredDaysAgo: 1500 },
  { key: "julie", firstName: "Julie", lastName: "Côté", dept: "kitchen", role: "EMPLOYEE", days: [0, 1, 2, 3, 4], start: h(6), end: h(14), position: "Cuisine", hiredDaysAgo: 900 },
  { key: "samuel", firstName: "Samuel", lastName: "Roy", dept: "kitchen", role: "EMPLOYEE", days: [2, 3, 4, 5, 6], start: h(14), end: h(22), position: "Cuisine", hiredDaysAgo: 400 },
  { key: "nadia", firstName: "Nadia", lastName: "Pelletier", dept: "kitchen", role: "EMPLOYEE", days: [0, 1, 3, 5, 6], start: h(11), end: h(19), position: "Plonge", hiredDaysAgo: 250 },
  { key: "lea", firstName: "Léa", lastName: "Martin", dept: "service", role: "EMPLOYEE", email: DEMO_ACCOUNTS.employee, days: [2, 3, 4, 5, 6], start: h(9), end: h(17), position: "Service", hiredDaysAgo: 600 },
  { key: "jerome", firstName: "Jérôme", lastName: "Fortin", dept: "service", role: "EMPLOYEE", days: [0, 1, 2, 3, 4], start: h(9), end: h(17), position: "Service", hiredDaysAgo: 700 },
  { key: "camille", firstName: "Camille", lastName: "Lavoie", dept: "service", role: "EMPLOYEE", days: [0, 1, 4, 5, 6], start: h(16), end: h(0), position: "Bar", hiredDaysAgo: 320 },
  { key: "olivier", firstName: "Olivier", lastName: "Morin", dept: "service", role: "EMPLOYEE", days: [1, 2, 3, 5, 6], start: h(11), end: h(19), position: "Service", hiredDaysAgo: 150 },
  { key: "emilie", firstName: "Émilie", lastName: "Bergeron", dept: "service", role: "EMPLOYEE", days: [0, 2, 4, 5, 6], start: h(7), end: h(15), position: "Service", hiredDaysAgo: 45 },
  { key: "karim", firstName: "Karim", lastName: "Benali", dept: "cash", role: "EMPLOYEE", days: [0, 1, 2, 3, 4], start: h(8), end: h(16), position: "Caisse", hiredDaysAgo: 1100 },
  { key: "chloe", firstName: "Chloé", lastName: "Gauthier", dept: "cash", role: "EMPLOYEE", days: [2, 3, 4, 5, 6], start: h(12), end: h(20), position: "Caisse", hiredDaysAgo: 30 },
  { key: "thomas", firstName: "Thomas", lastName: "Ouellet", dept: "cash", role: "EMPLOYEE", days: [0, 1, 3, 5, 6], start: h(16), end: h(22), position: "Caisse", hiredDaysAgo: 10 },
];

const emailOf = (p: Person) => p.email ?? `${p.key}@demo.mindmatecompagny.com`;
const dayDate = (date: string) => new Date(`${date}T00:00:00Z`);
const ago = (days: number, hours = 0) => new Date(Date.now() - days * 86_400_000 - hours * 3_600_000);

/** Crée l'entreprise fictive, ses départements et ses employés (idempotent). */
export async function ensureDemoOrganization(db: Db) {
  let org = await db.organization.findUnique({ where: { slug: DEMO_ORG_SLUG } });
  if (org && !org.isDemo) {
    throw new Error(`Une vraie organisation utilise déjà l'identifiant « ${DEMO_ORG_SLUG} » : démo annulée.`);
  }
  if (!org) {
    org = await db.organization.create({
      data: { name: "Café Boréal (démo)", slug: DEMO_ORG_SLUG, isDemo: true, defaultLocale: "fr" },
    });
  }

  const deptIds = {} as Record<DeptKey, string>;
  for (const d of DEPARTMENTS) {
    const dept = await db.department.upsert({
      where: { organizationId_name: { organizationId: org.id, name: d.name } },
      update: { color: d.color },
      create: { organizationId: org.id, name: d.name, color: d.color },
    });
    deptIds[d.key] = dept.id;
  }

  // Mot de passe aléatoire jamais communiqué : on n'entre dans la démo que
  // par « Voir la démo » (fournisseur "demo" de lib/auth.ts).
  const passwordHash = await hashPassword(randomBytes(24).toString("hex"));
  const userIds: Record<string, string> = {};
  for (const p of PEOPLE) {
    const email = emailOf(p);
    const existing = await db.user.findUnique({
      where: { organizationId_email: { organizationId: org.id, email } },
      select: { id: true },
    });
    const data = {
      firstName: p.firstName,
      lastName: p.lastName,
      role: p.role,
      status: "ACTIVE" as const,
      departmentId: deptIds[p.dept],
      departmentConfirmedAt: new Date(),
      hireDate: ago(p.hiredDaysAgo),
      locale: null,
    };
    const user = existing
      ? await db.user.update({ where: { id: existing.id }, data, select: { id: true } })
      : await db.user.create({ data: { ...data, organizationId: org.id, email, passwordHash }, select: { id: true } });
    userIds[p.key] = user.id;
  }

  await db.departmentManager.upsert({
    where: { departmentId_userId: { departmentId: deptIds.kitchen, userId: userIds.marc } },
    update: {},
    create: { organizationId: org.id, departmentId: deptIds.kitchen, userId: userIds.marc },
  });
  await db.organization.update({ where: { id: org.id }, data: { primaryAdminId: userIds.sophie } });

  if ((await db.leaveType.count({ where: { organizationId: org.id } })) === 0) {
    await db.leaveType.createMany({
      data: [
        { organizationId: org.id, code: "VACATION", color: "#1F8A6E", daysPerYear: 10, position: 0 },
        { organizationId: org.id, code: "SICK", color: "#C9542C", daysPerYear: 2, position: 1 },
        { organizationId: org.id, code: "OTHER", color: "#2A9FB0", daysPerYear: null, position: 2 },
      ],
    });
  }

  return { organizationId: org.id, userIds, deptIds };
}

/** Efface puis recrée toutes les données datées de la démo, autour d'aujourd'hui. */
export async function refreshDemoData(db: Db) {
  const { organizationId, userIds, deptIds } = await ensureDemoOrganization(db);
  const orgId = organizationId;
  const u = userIds;

  // ---------- Nettoyage ----------
  await db.shiftSwap.deleteMany({ where: { organizationId: orgId } });
  await db.shift.deleteMany({ where: { organizationId: orgId } });
  await db.absenceRequest.deleteMany({ where: { organizationId: orgId } });
  await db.notification.deleteMany({ where: { organizationId: orgId } });
  await db.message.deleteMany({ where: { organizationId: orgId } });
  await db.report.deleteMany({ where: { organizationId: orgId } });
  await db.review.deleteMany({ where: { organizationId: orgId } });
  await db.announcement.deleteMany({ where: { organizationId: orgId } });
  await db.jobPosting.deleteMany({ where: { organizationId: orgId } });
  await db.survey.deleteMany({ where: { organizationId: orgId } });
  await db.auditLog.deleteMany({ where: { organizationId: orgId } });

  const today = todayInZone();
  const thisWeek = mondayOf(today);
  const nextWeek = addDays(thisWeek, 7);

  // ---------- Congés (les jours de congé approuvés n'ont pas de quart) ----------
  const leaveTypes = await db.leaveType.findMany({ where: { organizationId: orgId }, select: { id: true, code: true } });
  const leaveId = (code: string) => leaveTypes.find((l) => l.code === code)?.id ?? null;
  const emilieOff = new Set([addDays(nextWeek, 3), addDays(nextWeek, 4)]); // jeudi et vendredi prochains
  await db.absenceRequest.createMany({
    data: [
      { organizationId: orgId, userId: u.emilie, startDate: dayDate(addDays(nextWeek, 3)), endDate: dayDate(addDays(nextWeek, 4)), reason: "Mariage de ma sœur", status: "APPROVED", leaveTypeId: leaveId("VACATION"), days: 2, decidedById: u.sophie, decidedAt: ago(3) },
      { organizationId: orgId, userId: u.olivier, startDate: dayDate(addDays(thisWeek, 21)), endDate: dayDate(addDays(thisWeek, 25)), reason: "Voyage en famille", status: "PENDING", leaveTypeId: leaveId("VACATION"), days: 5, createdAt: ago(1) },
      { organizationId: orgId, userId: u.lea, startDate: dayDate(addDays(thisWeek, 30)), endDate: dayDate(addDays(thisWeek, 30)), reason: "", status: "PENDING", leaveTypeId: leaveId("OTHER"), days: 1, createdAt: ago(0, 5) },
      { organizationId: orgId, userId: u.samuel, startDate: dayDate(addDays(thisWeek, -5)), endDate: dayDate(addDays(thisWeek, -5)), reason: "Grippe", status: "APPROVED", leaveTypeId: leaveId("SICK"), days: 1, decidedById: u.marc, decidedAt: ago(6) },
    ],
  });

  // ---------- Quarts : 2 semaines passées -> 8 semaines à venir ----------
  // Tout est publié et visible par l'équipe, sauf la Caisse de la semaine
  // prochaine (brouillon : montre « Envoyer l'horaire » dans la vue gérant).
  const shifts: Prisma.ShiftCreateManyInput[] = [];
  const shiftIndex = new Map<string, string>(); // "personne|date" -> id
  for (let w = -2; w <= 8; w++) {
    const monday = addDays(thisWeek, w * 7);
    for (const p of PEOPLE) {
      for (const d of p.days) {
        const date = addDays(monday, d);
        if (p.key === "emilie" && emilieOff.has(date)) continue;
        const draft = monday === nextWeek && p.dept === "cash";
        const id = randomUUID();
        shiftIndex.set(`${p.key}|${date}`, id);
        shifts.push({
          id,
          organizationId: orgId,
          userId: u[p.key],
          date,
          startMinute: p.start,
          endMinute: p.end,
          position: p.position,
          publishedAt: draft ? null : ago(w < 0 ? 20 : 2),
          teamVisible: !draft,
          createdById: u.sophie,
        });
      }
    }
  }
  await db.shift.createMany({ data: shifts });

  // ---------- Échanges de quart ----------
  // Jérôme propose son lundi prochain à son équipe (Léa, vue employé, peut le prendre).
  const jeromeMonday = shiftIndex.get(`jerome|${nextWeek}`);
  if (jeromeMonday) {
    await db.shiftSwap.create({
      data: { organizationId: orgId, shiftId: jeromeMonday, fromUserId: u.jerome, status: "OPEN", note: "Rendez-vous important ce matin-là" },
    });
  }
  // Julie cède son vendredi prochain, Nadia l'a accepté : à approuver (vue gérant).
  const julieFriday = shiftIndex.get(`julie|${addDays(nextWeek, 4)}`);
  if (julieFriday) {
    await db.shiftSwap.create({
      data: { organizationId: orgId, shiftId: julieFriday, fromUserId: u.julie, takenById: u.nadia, status: "ACCEPTED", note: "Examen à l'école" },
    });
  }

  // ---------- Annonces ----------
  await db.announcement.create({
    data: { organizationId: orgId, authorId: u.sophie, title: "Inventaire dimanche matin", content: "On fait l'inventaire complet dimanche de 7 h à 9 h. Merci à l'équipe de cuisine d'être là 15 minutes plus tôt. Café et viennoiseries offerts !", createdAt: ago(1, 3) },
  });
  await db.announcement.create({
    data: { organizationId: orgId, authorId: u.marc, title: "Nouveau menu d'automne", content: "Le menu d'automne commence lundi : soupe à la courge, burger au porc effiloché et tarte aux pommes. Une dégustation aura lieu vendredi à 15 h pour tout le monde.", createdAt: ago(4) },
  });
  await db.announcement.create({
    data: { organizationId: orgId, authorId: u.sophie, title: "Bienvenue à Thomas et Chloé", content: "Thomas et Chloé se joignent à l'équipe de la caisse. Faites-leur une belle place !", createdAt: ago(9) },
  });

  // ---------- Signalements ----------
  await db.report.createMany({
    data: [
      { organizationId: orgId, submitterId: u.samuel, title: "Le lave-vaisselle fuit", description: "Il y a de l'eau sous le lave-vaisselle depuis hier soir. J'ai mis une serviette, mais il faudrait appeler le technicien.", status: "IN_PROGRESS", createdAt: ago(2) },
      { organizationId: orgId, submitterId: u.chloe, title: "Éclairage du stationnement", description: "Deux lampadaires du stationnement sont brûlés. C'est très sombre à la fermeture.", isAnonymous: true, status: "NEW", createdAt: ago(0, 6) },
    ],
  });

  // ---------- Poste ouvert + candidature ----------
  await db.jobPosting.create({
    data: {
      organizationId: orgId,
      title: "Chef de partie (soirs)",
      description: "Temps plein, du mercredi au dimanche. Tu aimes la cuisine rapide et le travail d'équipe ? Parle-nous-en !",
      createdAt: ago(6),
      applications: { create: [{ applicantId: u.samuel, status: "IN_REVIEW", message: "Je fais déjà les soirs et j'aimerais prendre plus de responsabilités." }] },
    },
  });

  // ---------- Avis ----------
  await db.review.createMany({
    data: [
      { organizationId: orgId, authorId: u.julie, rating: 5, comment: "Super ambiance en cuisine, on s'entraide beaucoup.", createdAt: ago(12) },
      { organizationId: orgId, authorId: u.olivier, rating: 4, comment: "L'horaire sur le téléphone, c'est vraiment pratique.", createdAt: ago(7) },
      { organizationId: orgId, authorId: u.karim, rating: 3, comment: "Il manque parfois de monde à la caisse le samedi.", createdAt: ago(3) },
    ],
  });

  // ---------- Messages ----------
  await db.message.createMany({
    data: [
      { organizationId: orgId, senderId: u.sophie, receiverId: u.lea, content: "Salut Léa ! Pourrais-tu faire la fermeture samedi prochain ? Camille sera en congé.", isRead: true, createdAt: ago(2, 4) },
      { organizationId: orgId, senderId: u.lea, receiverId: u.sophie, content: "Oui, pas de problème ! Je peux rester jusqu'à minuit.", isRead: true, createdAt: ago(2, 3) },
      { organizationId: orgId, senderId: u.sophie, receiverId: u.lea, content: "Merci beaucoup, c'est noté !", isRead: false, createdAt: ago(2, 2) },
    ],
  });

  // ---------- Sondage (anonyme) ----------
  const survey = await db.survey.create({
    data: {
      organizationId: orgId,
      authorId: u.sophie,
      title: "Le nouvel horaire sur le téléphone",
      description: "Deux questions rapides, réponses anonymes.",
      isAnonymous: true,
      createdAt: ago(5),
      questions: {
        create: [
          { position: 0, text: "Est-ce plus simple qu'avant ?", options: { create: [{ position: 0, label: "Beaucoup plus simple" }, { position: 1, label: "Un peu plus simple" }, { position: 2, label: "Pareil" }] } },
          { position: 1, text: "Combien de temps à l'avance veux-tu ton horaire ?", options: { create: [{ position: 0, label: "1 semaine" }, { position: 1, label: "2 semaines" }, { position: 2, label: "1 mois" }] } },
        ],
      },
    },
    include: { questions: { include: { options: true }, orderBy: { position: "asc" } } },
  });
  const voters = ["julie", "samuel", "nadia", "jerome", "camille", "olivier", "karim", "chloe", "thomas"];
  const picks = [
    [0, 1, 0, 0, 1, 0, 2, 0, 1],
    [1, 1, 0, 1, 2, 1, 0, 1, 1],
  ];
  await db.surveyParticipation.createMany({
    data: voters.map((key) => ({ organizationId: orgId, surveyId: survey.id, userId: u[key] })),
  });
  const deptOf = (key: string) => deptIds[PEOPLE.find((p) => p.key === key)!.dept];
  await db.surveyAnswer.createMany({
    data: survey.questions.flatMap((q, qi) =>
      voters.map((key, vi) => ({
        organizationId: orgId,
        surveyId: survey.id,
        questionId: q.id,
        optionId: q.options[picks[qi][vi]].id,
        participationId: null,
        departmentId: deptOf(key),
      }))
    ),
  });

  // ---------- Notifications ----------
  await db.notification.createMany({
    data: [
      { organizationId: orgId, userId: u.lea, type: "SCHEDULE_SWAP_OFFERED", title: "Un collègue propose son quart", body: "Jérôme Fortin propose son quart de lundi prochain. Le premier qui accepte le prend.", link: "/dashboard/schedule" },
      { organizationId: orgId, userId: u.lea, type: "SCHEDULE_PUBLISHED", title: "Ton horaire est publié", body: "Consulte tes quarts de la semaine.", link: "/dashboard/schedule", isRead: true, createdAt: ago(2) },
      { organizationId: orgId, userId: u.sophie, type: "SCHEDULE_SWAP_ACCEPTED", title: "Échange de quart à approuver", body: "Nadia Pelletier veut prendre le quart de Julie Côté vendredi prochain.", link: `/dashboard/schedule?week=${nextWeek}` },
      { organizationId: orgId, userId: u.sophie, type: "ABSENCE_REQUESTED", title: "Nouvelle demande de congé", body: "Olivier Morin demande 5 jours de vacances.", link: "/dashboard/absences" },
    ],
  });

  // ---------- Historique ----------
  await db.auditLog.createMany({
    data: [
      { organizationId: orgId, actorId: u.sophie, action: "SCHEDULE_PUBLISHED", metadata: { week: thisWeek, count: 62 }, createdAt: ago(2) },
      { organizationId: orgId, actorId: u.sophie, action: "ANNOUNCEMENT_CREATED", createdAt: ago(1, 3) },
      { organizationId: orgId, actorId: u.nadia, action: "SCHEDULE_SWAP_ACCEPTED", metadata: { date: addDays(nextWeek, 4) }, createdAt: ago(0, 8) },
    ],
  });

  // Marque l'heure du rafraîchissement (Organization.updatedAt).
  await db.organization.update({ where: { id: orgId }, data: { isDemo: true } });
  return { organizationId: orgId, shifts: shifts.length };
}

/**
 * Appelé à chaque « Voir la démo » : crée la démo si elle n'existe pas encore,
 * puis rafraîchit les données si le dernier rafraîchissement date de plus de 20 h. Un seul rafraîchissement à la fois
 * (verrou Postgres) ; en cas d'échec, la démo reste visitable telle quelle.
 */
export async function refreshDemoIfStale(prisma: PrismaClient) {
  const org = await prisma.organization.findUnique({ where: { slug: DEMO_ORG_SLUG }, select: { isDemo: true, updatedAt: true } });
  // Pas encore de démo : elle est créée au premier clic. Identifiant pris par
  // une vraie entreprise : on n'y touche jamais.
  if (org && (!org.isDemo || Date.now() - org.updatedAt.getTime() < REFRESH_EVERY_MS)) return;
  try {
    await prisma.$transaction(
      async (tx) => {
        const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(${LOCK_KEY}) AS locked`;
        if (!locked) return;
        const fresh = await tx.organization.findUnique({ where: { slug: DEMO_ORG_SLUG }, select: { updatedAt: true } });
        if (fresh && org && Date.now() - fresh.updatedAt.getTime() < REFRESH_EVERY_MS) return;
        await refreshDemoData(tx);
      },
      { maxWait: 10_000, timeout: 60_000 }
    );
  } catch (error) {
    console.error("[demo] rafraîchissement impossible", error);
  }
}
