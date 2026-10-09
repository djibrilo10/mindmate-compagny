import type { Prisma, ShiftSwapStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { VISIBLE_USER } from "@/lib/visibility";

// ------------------------------------------------------------
// Échanges de quart (AUDIT.md 7.42) : un employé CÈDE un de ses quarts
// publiés, à un collègue précis ou à tout son département. Un collègue
// accepte, puis un responsable (ou l'admin) approuve : c'est seulement à ce
// moment que le quart passe au nom du collègue. Tant que ce n'est pas
// approuvé, l'horaire ne change pas.
// ------------------------------------------------------------

export const ACTIVE_SWAP_STATUSES: ShiftSwapStatus[] = ["OPEN", "ACCEPTED"];

/** Collègues à qui on peut proposer un quart : comptes actifs de l'entreprise. */
export function colleaguesWhere(organizationId: string, excludeUserId: string): Prisma.UserWhereInput {
  return { organizationId, status: "ACTIVE", ...VISIBLE_USER, id: { not: excludeUserId } };
}

/**
 * Offres qu'un employé peut accepter : proposées à lui, ou à tout son
 * département (même département que celui qui cède, ou tous deux sans
 * département). Jamais ses propres offres ; quarts d'aujourd'hui ou plus tard.
 */
export function offersForUserWhere(params: {
  organizationId: string;
  userId: string;
  departmentId: string | null;
  today: string;
}): Prisma.ShiftSwapWhereInput {
  return {
    organizationId: params.organizationId,
    status: "OPEN",
    fromUserId: { not: params.userId },
    shift: { date: { gte: params.today } },
    OR: [
      { targetUserId: params.userId },
      { targetUserId: null, fromUser: { departmentId: params.departmentId } },
    ],
  };
}

/**
 * Personnes qui doivent approuver : les responsables qui gèrent À LA FOIS le
 * département de celui qui cède et celui du collègue qui prend ; s'il n'y en
 * a aucun, les admins de l'entreprise.
 */
export async function swapApproverIds(organizationId: string, fromDepartmentId: string | null, takerDepartmentId: string | null) {
  if (fromDepartmentId && takerDepartmentId) {
    const managers = await prisma.user.findMany({
      where: {
        organizationId,
        status: "ACTIVE",
        role: "MANAGER",
        AND: [
          { managedDepartments: { some: { departmentId: fromDepartmentId } } },
          { managedDepartments: { some: { departmentId: takerDepartmentId } } },
        ],
      },
      select: { id: true },
    });
    if (managers.length > 0) return managers.map((m) => m.id);
  }
  const admins = await prisma.user.findMany({
    where: { organizationId, status: "ACTIVE", role: "ORG_ADMIN" },
    select: { id: true },
  });
  return admins.map((a) => a.id);
}

/** Collègues prévenus quand un quart est proposé à tout le département. */
export async function departmentColleagueIds(organizationId: string, fromUserId: string, departmentId: string | null) {
  const rows = await prisma.user.findMany({
    where: { ...colleaguesWhere(organizationId, fromUserId), departmentId, role: { in: ["EMPLOYEE", "MANAGER"] } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** Annule les échanges en cours d'un quart (quart modifié par le gérant). */
export async function cancelActiveSwaps(shiftId: string) {
  await prisma.shiftSwap.updateMany({
    where: { shiftId, status: { in: ACTIVE_SWAP_STATUSES } },
    data: { status: "CANCELLED", decidedAt: new Date() },
  });
}
