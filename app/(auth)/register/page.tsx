import Link from "next/link";
import { RegisterForm } from "@/components/auth/RegisterForm";

export default function RegisterPage() {
  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-3xl text-[#1C2438]">
        Créez l&apos;espace de votre entreprise
      </h1>
      <p className="mt-2 text-sm text-[#5B6478]">
        Vous devenez l&apos;administrateur de l&apos;organisation. Vous pourrez inviter vos employés une fois inscrit.
      </p>

      <div className="mt-8">
        <RegisterForm />
      </div>

      <p className="mt-8 text-sm text-[#5B6478]">
        Déjà un compte ?{" "}
        <Link href="/login" className="text-[#2F6F5E] hover:underline">
          Connectez-vous
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
