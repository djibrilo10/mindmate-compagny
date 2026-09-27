import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { Star } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAuth, UnauthorizedError } from "@/lib/session-guard";
import { ReviewForm } from "@/components/dashboard/ReviewForm";
import { ReviewsList } from "@/components/dashboard/ReviewsList";

const ADMIN_ROLES: Role[] = ["ORG_ADMIN", "SUPER_ADMIN"];

export default async function ReviewsPage() {
  let ctx;
  try {
    ctx = await requireAuth();
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/login");
    throw error;
  }

  const isAdmin = ADMIN_ROLES.includes(ctx.role);

  // Un admin voit tous les avis (sans jamais connaître l'auteur d'un avis
  // anonyme) ; un employé ne voit que la liste de ses propres avis envoyés.
  const reviews = await prisma.review.findMany({
    where: isAdmin
      ? { organizationId: ctx.organizationId }
      : { organizationId: ctx.organizationId, authorId: ctx.userId },
    orderBy: { createdAt: "desc" },
    include: { author: { select: { firstName: true, lastName: true } } },
  });

  const serialized = reviews.map((review) => ({
    id: review.id,
    rating: review.rating,
    comment: review.comment,
    isAnonymous: review.isAnonymous,
    createdAt: review.createdAt.toISOString(),
    author: review.isAnonymous ? null : review.author,
  }));

  const averageRating =
    isAdmin && reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : null;

  return (
    <div>
      <div className="mb-6 flex items-center gap-3 animate-fade-in-up">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F5EAFB] text-[#7A3FA0]">
          <Star className="h-5 w-5" strokeWidth={1.9} />
        </span>
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-[#1C2438]">Avis</h1>
          <p className="mt-0.5 text-sm text-[#5B6478]">
            {isAdmin
              ? "Les avis laissés par les employés de ton organisation."
              : "Partage ton ressenti — anonyme par défaut."}
          </p>
          {averageRating !== null && (
            <p className="mt-2 text-sm text-[#1C2438]">
              Note moyenne : <span className="font-medium">{averageRating.toFixed(1)} / 5</span>
              <span className="text-[#9AA1B2]"> ({reviews.length} avis)</span>
            </p>
          )}
        </div>
      </div>

      <div className="mb-8 max-w-xl animate-fade-in-up stagger-1">
        <ReviewForm />
      </div>

      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-[#9AA1B2]">
        {isAdmin ? "Tous les avis" : "Mes avis"}
      </h2>
      <ReviewsList initialReviews={serialized} canManage={isAdmin} />
    </div>
  );
}
