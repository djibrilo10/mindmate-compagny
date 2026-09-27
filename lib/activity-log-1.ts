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
  | "USER_INVITE_CODE_REGENERATED";

export type ActivityCategory =
  | "ANNOUNCEMENT"
  | "FILE"
  | "JOB"
  | "REPORT"
  | "ABSENCE"
  | "MESSAGE"
  | "REVIEW"
  | "USER";

export const CATEGORY_LABELS: Record<ActivityCategory, string> = {
  ANNOUNCEMENT: "Annonces",
  FILE: "Documents",
  JOB: "Postes ouverts",
  REPORT: "Signalements",
  ABSENCE: "Absences",
  MESSAGE: "Messages",
  REVIEW: "Avis",
  USER: "Employés",
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
  USER_INVITE_CODE_REGENERATED: "a régénéré le code d'invitation de l'organisation",
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
    default:
      return null;
  }
}
