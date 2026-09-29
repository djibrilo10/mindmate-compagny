// ------------------------------------------------------------
// Mise en forme du journal d'activité (AuditLog) pour l'admin :
// chaque action loggée ailleurs dans l'app (annonces, documents,
// postes, signalements, absences, messages, avis, employés) obtient
// ici un libellé lisible et une catégorie de filtre. L'icône associée à
// chaque catégorie vit dans components/dashboard/CategoryIcon.tsx (passe
// esthétique, voir AUDIT.md 14 — plus d'emoji ici).
// ------------------------------------------------------------

export type AuditAction =
  | "ANNOUNCEMENT_CREATED"
  | "ANNOUNCEMENT_DELETED"
  | "ANNOUNCEMENT_ATTACHMENT_ADDED"
  | "ANNOUNCEMENT_ATTACHMENT_DELETED"
  | "FILE_UPLOADED"
  | "FILE_DELETED"
  | "JOB_POSTING_CREATED"
  | "JOB_POSTING_CLOSED"
  | "JOB_POSTING_REOPENED"
  | "JOB_APPLICATION_SUBMITTED"
  | "JOB_APPLICATION_STATUS_UPDATED"
  | "REPORT_CREATED"
  | "REPORT_STATUS_UPDATED"
  | "ABSENCE_REQUESTED"
  | "ABSENCE_STATUS_UPDATED"
  | "MESSAGE_SENT"
  | "REVIEW_SUBMITTED"
  | "REVIEW_DELETED"
  | "USER_DISABLED"
  | "USER_REACTIVATED"
  | "USER_JOINED"
  | "USER_ADMIN_ADDED"
  | "USER_ADMIN_REMOVED"
  | "USER_ADMIN_DISABLED"
  | "USER_ADMIN_REACTIVATED"
  | "SURVEY_CREATED"
  | "SURVEY_CLOSED"
  | "SURVEY_REOPENED"
  | "SURVEY_DELETED"
  | "SUPPORT_MESSAGE"
  | "ORGANIZATION_INVITE_CODE_REGENERATED"
  | "ORGANIZATION_LOGO_UPDATED"
  | "ORGANIZATION_LOGO_REMOVED"
  | "ORGANIZATION_SUSPENDED"
  | "ORGANIZATION_REACTIVATED";

export type ActivityCategory =
  | "ANNOUNCEMENT"
  | "FILE"
  | "JOB"
  | "REPORT"
  | "ABSENCE"
  | "MESSAGE"
  | "REVIEW"
  | "USER"
  | "SURVEY"
  | "SUPPORT"
  | "ORGANIZATION";

export const CATEGORY_LABELS: Record<ActivityCategory, string> = {
  ANNOUNCEMENT: "Annonces",
  FILE: "Documents",
  JOB: "Postes ouverts",
  REPORT: "Signalements",
  ABSENCE: "Absences",
  MESSAGE: "Messages",
  REVIEW: "Avis",
  USER: "Employés",
  SURVEY: "Sondages",
  SUPPORT: "Assistance",
  ORGANIZATION: "Organisation",
};

const ACTION_LABELS: Record<AuditAction, string> = {
  ANNOUNCEMENT_CREATED: "a publié une annonce",
  ANNOUNCEMENT_DELETED: "a retiré une annonce",
  ANNOUNCEMENT_ATTACHMENT_ADDED: "a ajouté un fichier à une annonce",
  ANNOUNCEMENT_ATTACHMENT_DELETED: "a retiré un fichier d'une annonce",
  FILE_UPLOADED: "a téléversé un document",
  FILE_DELETED: "a retiré un document",
  JOB_POSTING_CREATED: "a publié un poste",
  JOB_POSTING_CLOSED: "a fermé un poste",
  JOB_POSTING_REOPENED: "a rouvert un poste",
  JOB_APPLICATION_SUBMITTED: "a postulé à un poste",
  JOB_APPLICATION_STATUS_UPDATED: "a mis à jour une candidature",
  REPORT_CREATED: "a soumis un signalement",
  REPORT_STATUS_UPDATED: "a mis à jour un signalement",
  ABSENCE_REQUESTED: "a demandé une absence",
  ABSENCE_STATUS_UPDATED: "a mis à jour une demande d'absence",
  MESSAGE_SENT: "a envoyé un message",
  REVIEW_SUBMITTED: "a soumis un avis",
  REVIEW_DELETED: "a retiré un avis",
  USER_DISABLED: "a désactivé un compte employé",
  USER_REACTIVATED: "a réactivé un compte employé",
  USER_JOINED: "a rejoint l'organisation via le code d'invitation",
  USER_ADMIN_ADDED: "a ajouté un co-admin",
  USER_ADMIN_REMOVED: "a retiré un co-admin",
  USER_ADMIN_DISABLED: "a désactivé un co-admin",
  USER_ADMIN_REACTIVATED: "a réactivé un co-admin",
  SURVEY_CREATED: "a publié un sondage",
  SURVEY_CLOSED: "a fermé un sondage",
  SURVEY_REOPENED: "a rouvert un sondage",
  SURVEY_DELETED: "a supprimé un sondage",
  SUPPORT_MESSAGE: "a envoyé un message d'assistance", // type de notification seulement (7.24/7.25), jamais écrit dans AuditLog
  ORGANIZATION_INVITE_CODE_REGENERATED: "a régénéré le code d'invitation de l'organisation",
  ORGANIZATION_LOGO_UPDATED: "a mis à jour le logo de l'organisation",
  ORGANIZATION_LOGO_REMOVED: "a retiré le logo personnalisé de l'organisation",
  ORGANIZATION_SUSPENDED: "a suspendu l'accès de l'organisation",
  ORGANIZATION_REACTIVATED: "a réactivé l'accès de l'organisation",
};

const REPORT_STATUS_LABELS: Record<string, string> = {
  NEW: "Nouveau",
  SEEN: "Vu",
  IN_PROGRESS: "En cours",
  RESOLVED: "Résolu",
};

const ABSENCE_STATUS_LABELS: Record<string, string> = {
  APPROVED: "Approuvée",
  REJECTED: "Refusée",
  PENDING: "En attente",
};

const APPLICATION_STATUS_LABELS: Record<string, string> = {
  RECEIVED: "Reçue",
  IN_REVIEW: "En révision",
  ACCEPTED: "Acceptée",
  REJECTED: "Refusée",
};

export function isKnownAction(action: string): action is AuditAction {
  return action in ACTION_LABELS;
}

export function actionCategory(action: string): ActivityCategory {
  const prefix = action.split("_")[0];
  if (prefix in CATEGORY_LABELS) return prefix as ActivityCategory;
  return "USER";
}

export function actionLabel(action: string): string {
  if (isKnownAction(action)) return ACTION_LABELS[action];
  return action;
}

// Un complément de contexte tiré de metadata, quand il y en a un utile à
// afficher (ex: "3 fichier(s) · Horaire", "→ Acceptée").
export function actionDetail(action: string, metadata: unknown): string | null {
  const data = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : null;

  switch (action) {
    case "FILE_UPLOADED": {
      const count = typeof data?.count === "number" ? data.count : null;
      const category = typeof data?.category === "string" ? data.category : null;
      const categoryLabels: Record<string, string> = { schedule: "Horaire", policy: "Politique", other: "Autre" };
      const parts = [
        count ? `${count} fichier${count > 1 ? "s" : ""}` : null,
        category ? categoryLabels[category] ?? category : null,
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(" · ") : null;
    }
    case "ANNOUNCEMENT_ATTACHMENT_ADDED": {
      const count = typeof data?.count === "number" ? data.count : null;
      return count ? `${count} fichier${count > 1 ? "s" : ""}` : null;
    }
    case "REPORT_STATUS_UPDATED": {
      const status = typeof data?.status === "string" ? data.status : null;
      return status ? `→ ${REPORT_STATUS_LABELS[status] ?? status}` : null;
    }
    case "ABSENCE_STATUS_UPDATED": {
      const status = typeof data?.status === "string" ? data.status : null;
      return status ? `→ ${ABSENCE_STATUS_LABELS[status] ?? status}` : null;
    }
    case "JOB_APPLICATION_STATUS_UPDATED": {
      const status = typeof data?.status === "string" ? data.status : null;
      return status ? `→ ${APPLICATION_STATUS_LABELS[status] ?? status}` : null;
    }
    case "USER_ADMIN_ADDED":
    case "USER_ADMIN_REMOVED":
    case "USER_ADMIN_DISABLED":
    case "USER_ADMIN_REACTIVATED": {
      const name = typeof data?.name === "string" ? data.name : null;
      const reason = typeof data?.reason === "string" ? data.reason : null;
      const suffix =
        reason === "replaced" ? " (remplacé)" : reason === "removed_and_disabled" ? " (compte désactivé)" : "";
      return name ? `${name}${suffix}` : null;
    }
    case "SURVEY_CREATED":
    case "SURVEY_CLOSED":
    case "SURVEY_REOPENED":
    case "SURVEY_DELETED": {
      const title = typeof data?.title === "string" ? data.title : null;
      const anonymous = data?.anonymous === true ? " · anonyme" : data?.anonymous === false ? " · nominatif" : "";
      return title ? `« ${title} »${action === "SURVEY_CREATED" ? anonymous : ""}` : null;
    }
    default:
      return null;
  }
}
