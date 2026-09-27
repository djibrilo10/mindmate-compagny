import { redirect } from "next/navigation";

// Reste du boilerplate create-next-app jamais utilisé : personne n'a de
// raison d'atterrir ici, donc on redirige directement vers /dashboard, qui
// lui-même renvoie vers /login si l'utilisateur n'est pas connecté (middleware,
// voir AUDIT.md 5.6). Retiré de la dette technique (section 10) le 24 sept.
export default function Home() {
  redirect("/dashboard");
}
