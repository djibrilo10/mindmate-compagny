import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "./prisma";
import { verifyPassword } from "./password";
import { normalizeLoginIdentifier } from "./validations/auth";

// ------------------------------------------------------------
// POINT CRITIQUE MULTI-TENANT :
// Le token JWT et la session contiennent organizationId et role.
// C'est CE token, vérifié côté serveur à chaque requête, qui sert
// de base à TOUTES les vérifications d'accès. On ne fait JAMAIS
// confiance à un organizationId envoyé depuis le frontend.
// ------------------------------------------------------------

export const authOptions: NextAuthOptions = {
  // Explicite plutôt que de compter sur le repli automatique de next-auth
  // sur process.env.NEXTAUTH_SECRET : en prod sur Vercel, l'API route (Node)
  // et middleware.ts (Edge) tournent dans deux runtimes séparés, et il vaut
  // mieux être sûr que les DEUX lisent exactement la même valeur de secret
  // pour signer/vérifier le même JWT (voir AUDIT.md, journal du 26 sept. 2026 —
  // diagnostic du bug "connexion OK mais /dashboard renvoie vers /login").
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8h — une session expire, ce n'est pas un détail
  },
  // Sans ceci, next-auth (via `withAuth` dans middleware.ts) redirige un
  // visiteur non connecté vers SA PROPRE page /api/auth/signin par défaut
  // (formulaire générique sans style, généré depuis `credentials` ci-dessous)
  // au lieu de la vraie page /login de l'app. Resté commenté par erreur —
  // invisible en dev car le navigateur y gardait déjà une session valide ;
  // découvert seulement en production, sur un navigateur sans session
  // (voir AUDIT.md, journal du 27 sept. 2026).
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
        // slug de l'organisation, utile si vous permettez la connexion via une URL
        // du type acme.monapp.com ou un champ "code entreprise"
        organizationSlug: { label: "Entreprise", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password || !credentials?.organizationSlug) {
          throw new Error("Champs manquants");
        }

        // Les slugs sont stockés en minuscules (voir génération à l'inscription).
        // On normalise ici pour que la connexion ne soit pas sensible à la casse
        // que l'utilisateur tape ou voit affichée quelque part.
        const normalizedSlug = credentials.organizationSlug.toLowerCase().trim();

        const organization = await prisma.organization.findUnique({
          where: { slug: normalizedSlug },
        });
        if (!organization) {
          // Message volontairement générique : ne jamais révéler
          // si c'est l'entreprise, l'email ou le mdp qui est faux.
          throw new Error("Identifiants invalides");
        }

        // Courriel OU numéro de téléphone (AUDIT.md 7.40), nettoyé comme dans
        // le formulaire (AUDIT.md, 5 oct. 2026).
        const identifier = normalizeLoginIdentifier(credentials.email);
        if (!identifier) throw new Error("Identifiants invalides");
        const user = await prisma.user.findUnique({
          where: identifier.includes("@")
            ? { organizationId_email: { organizationId: organization.id, email: identifier } }
            : { organizationId_phone: { organizationId: organization.id, phone: identifier } },
        });

        if (!user || user.status !== "ACTIVE") {
          throw new Error("Identifiants invalides");
        }

        const isValid = await verifyPassword(credentials.password, user.passwordHash);
        if (!isValid) {
          throw new Error("Identifiants invalides");
        }

        // Vérifié APRÈS le mot de passe (jamais avant) : on ne révèle le
        // statut de l'organisation qu'à quelqu'un qui a déjà prouvé ses
        // identifiants. Le SUPER_ADMIN (vous) n'est jamais bloqué par le
        // statut de sa propre organisation interne (voir AUDIT.md 7.20,
        // même exception que dans lib/session-guard.ts).
        if (user.role !== "SUPER_ADMIN" && organization.status === "SUSPENDED") {
          throw new Error("Cette organisation est suspendue. Contactez votre administrateur.");
        }

        // Ce qui est retourné ici finit dans le callback jwt() ci-dessous
        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          role: user.role,
          organizationId: user.organizationId,
          departmentId: user.departmentId,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Au moment du login uniquement, "user" existe -> on grave
      // les infos de tenant/rôle DANS le token signé.
      if (user) {
        token.userId = user.id;
        token.role = (user as any).role;
        token.organizationId = (user as any).organizationId;
        token.departmentId = (user as any).departmentId;
      }
      return token;
    },
    async session({ session, token }) {
      // On recopie du token vers la session exposée au frontend.
      if (session.user) {
        (session.user as any).id = token.userId;
        (session.user as any).role = token.role;
        (session.user as any).organizationId = token.organizationId;
        (session.user as any).departmentId = token.departmentId;
      }
      return session;
    },
  },
};