import { prisma } from "@/lib/prisma";
import { requireAuth, handleAuthError } from "@/lib/session-guard";
import type { Role } from "@prisma/client";

const ADMIN_ROLES: Role[] = ["ORG_ADMIN", "SUPER_ADMIN"];

// POST /api/reviews -> n'importe quel employé connecté laisse un avis noté
// sur 5, anonyme par défaut (voir Review.isAnonymous dans le schéma).
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth(); // étape 1 (pas de restriction de rôle)

    const body = await request.json();
    const { rating, comment, isAnonymous } = body;

    const ratingNum = Number(rating);
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return Response.json({ error: "La note doit être un nombre entier entre 1 et 5" }, { status: 400 });
    }
    if (!comment?.trim()) {
      return Response.json({ error: "Le commentaire est requis" }, { status: 400 });
    }

    const review = await prisma.review.create({
      data: {
        organizationId: ctx.organizationId, // étape 3 : vient du token, jamais du client
        authorId: ctx.userId,
        rating: ratingNum,
        comment: comment.trim(),
        isAnonymous: isAnonymous !== false, // anonyme par défaut, sauf refus explicite
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        // Avis anonyme (AUDIT.md 7.50) : ni auteur, ni identifiant, ni note
        // dans l'historique — rien qui permette de le relier à quelqu'un.
        actorId: review.isAnonymous ? null : ctx.userId,
        action: "REVIEW_SUBMITTED",
        targetId: review.isAnonymous ? null : review.id,
        ...(review.isAnonymous ? {} : { metadata: { rating: ratingNum } }),
      },
    });

    return Response.json(
      {
        review: {
          id: review.id,
          rating: review.rating,
          comment: review.comment,
          isAnonymous: review.isAnonymous,
          createdAt: review.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// GET /api/reviews -> un admin voit tous les avis de l'organisation (le nom
// de l'auteur n'est jamais révélé pour un avis anonyme, même à l'admin) ;
// un employé ne voit que la liste de ses propres avis envoyés.
export async function GET() {
  try {
    const ctx = await requireAuth(); // étape 1
    const isAdmin = ADMIN_ROLES.includes(ctx.role);

    const reviews = await prisma.review.findMany({
      where: isAdmin
        ? { organizationId: ctx.organizationId } // étape 3
        : { organizationId: ctx.organizationId, authorId: ctx.userId },
      orderBy: { createdAt: "desc" },
      include: { author: { select: { firstName: true, lastName: true } } },
    });

    const serialized = reviews.map((review) => ({
      id: review.id,
      rating: review.rating,
      comment: review.comment,
      isAnonymous: review.isAnonymous,
      createdAt: review.createdAt,
      // Jamais de nom d'auteur pour un avis anonyme, même dans la vue admin.
      author: review.isAnonymous ? null : review.author,
    }));

    return Response.json({ reviews: serialized, isAdmin });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
