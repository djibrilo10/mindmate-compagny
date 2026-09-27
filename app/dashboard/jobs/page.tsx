import { redirect } from "next/navigation";
import type { ApplicationStatus, Role } from "@prisma/client";
import { Briefcase } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAuth, UnauthorizedError } from "@/lib/session-guard";
import { JobPostingForm } from "@/components/dashboard/JobPostingForm";
import { JobPostingsList } from "@/components/dashboard/JobPostingsList";

const ADMIN_ROLES: Role[] = ["ORG_ADMIN", "SUPER_ADMIN"];

export default async function JobsPage() {
  let ctx;
  try {
    ctx = await requireAuth();
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/login");
    throw error;
  }

  const canManage = ADMIN_ROLES.includes(ctx.role);

  // Tout le monde voit les postes ouverts de son organisation. Un admin voit
  // en plus toutes les candidatures reçues pour chaque poste ; un employé ne
  // voit que le statut de sa propre candidature, s'il y en a une.
  //
  // Deux requêtes Prisma séparées (plutôt qu'un seul `include` conditionné
  // par `canManage`) : Prisma déduit le type de retour à partir de la valeur
  // LITTÉRALE de `include` passée à CET appel précis. Un `include` choisi au
  // moment de l'exécution (ternaire) produit un type union ambigu — TypeScript
  // ne sait plus, plus loin dans le fichier, si `applications[].applicant`
  // existe ou non (erreur détectée par `next build`, pas par `next dev`, voir
  // AUDIT.md 13 pour le contexte). Deux requêtes distinctes, chacune avec un
  // `include` fixe, donnent à chaque branche un type concret et sûr.
  const serialized = canManage
    ? (
        await prisma.jobPosting.findMany({
          where: { organizationId: ctx.organizationId },
          orderBy: { createdAt: "desc" },
          include: {
            applications: {
              orderBy: { createdAt: "asc" },
              include: {
                applicant: { select: { id: true, firstName: true, lastName: true, role: true } },
              },
            },
          },
        })
      ).map((posting) => ({
        id: posting.id,
        title: posting.title,
        description: posting.description,
        status: posting.status,
        createdAt: posting.createdAt.toISOString(),
        applications: posting.applications.map((application) => ({
          id: application.id,
          status: application.status,
          message: application.message,
          createdAt: application.createdAt.toISOString(),
          applicant: application.applicant,
        })),
        myApplication: null,
      }))
    : (
        await prisma.jobPosting.findMany({
          where: { organizationId: ctx.organizationId },
          orderBy: { createdAt: "desc" },
          include: {
            applications: { where: { applicantId: ctx.userId } },
          },
        })
      ).map((posting) => {
        const mine = posting.applications[0];
        return {
          id: posting.id,
          title: posting.title,
          description: posting.description,
          status: posting.status,
          createdAt: posting.createdAt.toISOString(),
          applications: [] as Array<{
            id: string;
            status: ApplicationStatus;
            message: string | null;
            createdAt: string;
            applicant: { id: string; firstName: string; lastName: string; role: Role };
          }>,
          myApplication: mine
            ? {
                id: mine.id,
                status: mine.status,
                message: mine.message,
                createdAt: mine.createdAt.toISOString(),
              }
            : null,
        };
      });

  return (
    <div>
      <div className="mb-6 flex items-center gap-3 animate-fade-in-up">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EAF0FB] text-[#2F5FA6]">
          <Briefcase className="h-5 w-5" strokeWidth={1.9} />
        </span>
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-[#1C2438]">
            Postes ouverts
          </h1>
          <p className="mt-0.5 text-sm text-[#5B6478]">
            {canManage
              ? "Publie un poste et suis les candidatures reçues."
              : "Les postes ouverts au sein de ton organisation."}
          </p>
        </div>
      </div>

      {canManage && (
        <div className="mb-8 max-w-xl animate-fade-in-up stagger-1">
          <JobPostingForm />
        </div>
      )}

      <JobPostingsList initialPostings={serialized} canManage={canManage} />
    </div>
  );
}
