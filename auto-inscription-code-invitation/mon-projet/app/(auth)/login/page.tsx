import { Suspense } from "react";
import Link from "next/link";
import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-3xl text-[#1C2438]">
        Content de vous revoir
      </h1>
      <p className="mt-2 text-sm text-[#5B6478]">
        Connectez-vous à l&apos;espace de votre organisation.
      </p>

      <div className="mt-8">
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>

      <p className="mt-8 text-sm text-[#5B6478]">
        Pas encore de compte entreprise ?{" "}
        <Link href="/register" className="text-[#2F6F5E] hover:underline">
          Créez votre organisation
        </Link>
      </p>
      <p className="mt-2 text-sm text-[#5B6478]">
        Vous êtes employé et votre entreprise a déjà un compte ?{" "}
        <Link href="/join" className="text-[#2F6F5E] hover:underline">
          Rejoignez-la avec un code d&apos;invitation
        </Link>
      </p>
    </div>
  );
}
