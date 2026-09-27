"use client";

import { useState } from "react";
import { Star, Trash2 } from "lucide-react";

type Review = {
  id: string;
  rating: number;
  comment: string;
  isAnonymous: boolean;
  createdAt: string;
  author: { firstName: string; lastName: string } | null;
};

function StarRow({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          className={value <= rating ? "h-4 w-4 text-[#2F6F5E]" : "h-4 w-4 text-[#E2E4E9]"}
          strokeWidth={1.8}
          fill={value <= rating ? "currentColor" : "none"}
        />
      ))}
    </div>
  );
}

export function ReviewsList({
  initialReviews,
  canManage,
}: {
  initialReviews: Review[];
  canManage: boolean;
}) {
  const [reviews, setReviews] = useState(initialReviews);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function deleteReview(id: string) {
    const confirmed = window.confirm("Retirer définitivement cet avis ?");
    if (!confirmed) return;

    const previous = reviews;
    setDeletingId(id);
    setReviews((current) => current.filter((r) => r.id !== id));

    try {
      const response = await fetch(`/api/reviews/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
    } catch {
      // On annule le retrait optimiste si la requête échoue côté serveur.
      setReviews(previous);
    } finally {
      setDeletingId(null);
    }
  }

  if (reviews.length === 0) {
    return (
      <div className="animate-fade-in-up stagger-2 flex flex-col items-center gap-2 rounded-xl border border-dashed border-[#E2E4E9] bg-white px-6 py-14 text-center">
        <Star className="h-6 w-6 text-[#B7BECC]" strokeWidth={1.6} />
        <p className="text-sm text-[#5B6478]">Aucun avis pour le moment.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {reviews.map((review, index) => (
        <div
          key={review.id}
          style={{ animationDelay: `${Math.min(index, 10) * 0.04}s` }}
          className="animate-fade-in-up rounded-xl border border-[#E2E4E9] bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <StarRow rating={review.rating} />
              <p className="mt-2 whitespace-pre-wrap text-sm text-[#5B6478]">{review.comment}</p>
              <p className="mt-2 text-xs text-[#9AA1B2]">
                {review.author ? `${review.author.firstName} ${review.author.lastName}` : "Anonyme"}
                {" · "}
                {new Date(review.createdAt).toLocaleDateString("fr-CA", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>

            {canManage && (
              <button
                onClick={() => deleteReview(review.id)}
                disabled={deletingId === review.id}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[#8A3B3B] px-2 py-1 text-xs font-medium text-[#8A3B3B] transition-colors hover:bg-[#FDECEC] disabled:opacity-50"
              >
                <Trash2 className="h-3 w-3" strokeWidth={2} />
                Retirer
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
