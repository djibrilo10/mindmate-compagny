import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "./prisma";
import { hashPassword, verifyPassword } from "./password";
import { MINUTE, clearHits, clientIp, consume, countHits, recordHit } from "./rate-limit";
import { normalizeLoginIdentifier } from "./validations/auth";
import { DEMO_ACCOUNTS, DEMO_ORG_SLUG, isDemoRole } from "./demo";
import { refreshDemoIfStale } from "./demo-seed";

// ------------------------------------------------------------
// POINT CRITIQUE MULTI-TENANT :
// Le token JWT et la session contiennent organizationId et role.
// C'est CE token, vérifié côté serveur à chaque requête, qui sert
// de base à TOUTES les vérifications d'accès. On ne fait JAMAIS
// confiance à un organizationId envoyé depuis le frontend.
// ------------------------------------------------------------

// ------------------------------------------------------------
// Anti-force brute (AUDIT.md 7.49) :
// - 30 tentatives / 15 min par adresse IP ;
// - 5 échecs / 15 min par compte (entreprise + identifiant), remis à zéro
//   à la connexion réussie ;
// - temps de réponse identique que le compte existe ou non (bcrypt est
//   toujours exécuté, sur un faux hash si besoin) : impossible de deviner
//   quels comptes existent en chronométrant.
// Le message "RATE_LIMITED" est lu par LoginForm (« Trop de tentatives »).
// ------------------------------------------------------------
const LOGIN_WINDOW = 15 * MINUTE;
let dummyHash: Promise<string> | null = null;
async function burnPasswordCheck(password: string) {
  dummyHash ??= hashPassword(`dummy-${Math.random()}`);
  await verifyPassword(password, await dummyHash);
}

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
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password || !credentials?.organizationSlug) {
          throw new Error("Champs manquants");
        }

        const ip = clientIp(req?.headers as Record<string, string | string[] | undefined> | undefined);
        if (!(await consume(`login:ip:${ip}`, 30, LOGIN_WINDOW))) throw new Error("RATE_LIMITED");
        const accountKey = `login:acct:${credentials.organizationSlug.toLowerCase().trim()}:${credentials.email.toLowerCase().trim()}`;
        if ((await countHits(accountKey, LOGIN_WINDOW)) >= 5) throw new Error("RATE_LIMITED");
        const fail = async (): Promise<never> => {
          await recordHit(accountKey);
          throw new Error("Identifiants invalides");
        };

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
          await burnPasswordCheck(credentials.password);
          return fail();
        }

        // Courriel OU numéro de téléphone (AUDIT.md 7.40), nettoyé comme dans
        // le formulaire (AUDIT.md, 5 oct. 2026).
        const identifier = normalizeLoginIdentifier(credentials.email);
        if (!identifier) {
          await burnPasswordCheck(credentials.password);
          return fail();
        }
        const user = await prisma.user.findUnique({
          where: identifier.includes("@")
            ? { organizationId_email: { organizationId: organization.id, email: identifier } }
            : { organizationId_phone: { organizationId: organization.id, phone: identifier } },
        });

        if (!user || user.status !== "ACTIVE") {
          await burnPasswordCheck(credentials.password);
          return fail();
        }

        const isValid = await verifyPassword(credentials.password, user.passwordHash);
        if (!isValid) {
          return fail();
        }
        await clearHits(accountKey);

        // Vérifié APRÈS le mot de passe (jamais avant) : on ne révèle le
        // statut de l'organisation qu'à quelqu'un qui a déjà prouvé ses
        // identifiants. Le SUPER_ADMIN (vous) n'est jamais bloqué par le
        // statut de sa propre organisation interne (voir AUDIT.md 7.20,
        // même exception que dans lib/session-guard.ts).
        // Exception (AUDIT.md 7.45) : suspension AUTOMATIQUE pour non-paiement ->
        // l'admin peut se connecter pour payer (il atterrit sur /suspended).
        const canPayToReactivate = user.role === "ORG_ADMIN" && organization.suspendedReason === "billing";
        if (user.role !== "SUPER_ADMIN" && organization.status === "SUSPENDED" && !canPayToReactivate) {
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
          passwordChangedAt: user.passwordChangedAt?.getTime() ?? 0,
        };
      },
    }),
    // Démo publique (AUDIT.md 7.43) : « Voir la démo » sur la page d'accueil
    // connecte SANS mot de passe à l'un des deux comptes de l'entreprise
    // fictive — et seulement à ceux-là (organisation isDemo = true). Le token
    // porte isDemo : middleware.ts refuse alors toute modification.
    CredentialsProvider({
      id: "demo",
      name: "demo",
      credentials: { role: { label: "Rôle", type: "text" } },
      async authorize(credentials) {
        const role = credentials?.role;
        if (!isDemoRole(role)) return null;
        // Crée la démo au premier clic, puis la garde à jour (quarts autour d'aujourd'hui).
        await refreshDemoIfStale(prisma);
        const organization = await prisma.organization.findUnique({ where: { slug: DEMO_ORG_SLUG } });
        if (!organization || !organization.isDemo) return null;
        // La démo doit toujours rester ouverte : si elle a été suspendue par
        // erreur (ex. confondue avec une entreprise de test), on la rouvre.
        if (organization.status === "SUSPENDED") {
          await prisma.organization.update({
            where: { id: organization.id },
            data: { status: "ACTIVE", suspendedAt: null, suspendedReason: null },
          });
        }
        const user = await prisma.user.findUnique({
          where: { organizationId_email: { organizationId: organization.id, email: DEMO_ACCOUNTS[role] } },
        });
        if (!user || user.status !== "ACTIVE" || user.role === "SUPER_ADMIN") return null;
        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          role: user.role,
          organizationId: user.organizationId,
          departmentId: user.departmentId,
          isDemo: true,
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
        token.isDemo = Boolean((user as any).isDemo);
        // Date du mot de passe utilisé pour ouvrir la session (AUDIT.md 7.49) :
        // après un changement de mot de passe, les sessions plus anciennes sont refusées.
        token.pwdAt = Number((user as any).passwordChangedAt ?? 0);
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
        (session.user as any).isDemo = Boolean(token.isDemo);
        (session.user as any).pwdAt = Number(token.pwdAt ?? 0);
      }
      return session;
    },
  },
};