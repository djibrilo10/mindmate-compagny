import Link from "next/link";
import { JoinForm } from "@/components/auth/JoinForm";

export default function JoinPage() {
  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-3xl text-[#1C2438]">
        Rejoins ton entreprise
      </h1>
      <p className="mt-2 text-sm text-[#5B6478]">
        Utilise le code d&apos;invitation fourni par ton administrateur pour créer ton compte.
      </p>

      <div className="mt-8">
        <JoinForm />
      </div>

      <p className="mt-8 text-sm text-[#5B6478]">
        Tu es administrateur et tu veux créer l&apos;espace de ton entreprise ?{" "}
        <Link href="/register" className="text-[#2F6F5E] hover:underline">
          Inscris ton entreprise
        </Link>
      </p>
    </div>
  );
}
