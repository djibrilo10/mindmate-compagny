import type { CSSProperties } from "react";

// Organigramme animé (passe esthétique, voir AUDIT.md 14) : les traits se
// dessinent au chargement (stroke-dashoffset, via pathLength="1" pour ne pas
// dépendre de la longueur réelle de chaque trait) puis les nœuds apparaissent
// en cascade. Pur CSS (keyframes définis dans app/globals.css) : pas besoin
// de "use client", et respecte prefers-reduced-motion automatiquement.
export function OrgIllustration() {
  const lineStyle = (delay: number): CSSProperties => ({
    strokeDasharray: 1,
    strokeDashoffset: 1,
    animation: `draw-line 0.7s ease-out ${delay}s forwards`,
  });
  const nodeStyle = (delay: number): CSSProperties => ({
    transformOrigin: "center",
    opacity: 0,
    animation: `scale-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s forwards`,
  });

  return (
    <svg
      viewBox="0 0 320 260"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full max-w-xs"
      aria-hidden="true"
    >
      <path d="M160 40 L84 116" stroke="#3E5C50" strokeWidth="1.5" pathLength={1} style={lineStyle(0)} />
      <path d="M160 40 L160 116" stroke="#3E5C50" strokeWidth="1.5" pathLength={1} style={lineStyle(0.08)} />
      <path d="M160 40 L236 116" stroke="#3E5C50" strokeWidth="1.5" pathLength={1} style={lineStyle(0.16)} />

      <path d="M84 116 L56 190" stroke="#3E5C50" strokeWidth="1.5" pathLength={1} style={lineStyle(0.55)} />
      <path d="M84 116 L108 190" stroke="#3E5C50" strokeWidth="1.5" pathLength={1} style={lineStyle(0.62)} />
      <path d="M160 116 L160 190" stroke="#3E5C50" strokeWidth="1.5" pathLength={1} style={lineStyle(0.69)} />
      <path d="M236 116 L212 190" stroke="#3E5C50" strokeWidth="1.5" pathLength={1} style={lineStyle(0.76)} />
      <path d="M236 116 L262 190" stroke="#3E5C50" strokeWidth="1.5" pathLength={1} style={lineStyle(0.83)} />

      <circle cx="160" cy="40" r="13" fill="#2F6F5E" style={nodeStyle(0.05)} className="animate-pulse-soft" />
      <circle cx="84" cy="116" r="9" fill="#4A8B78" style={nodeStyle(0.5)} />
      <circle cx="160" cy="116" r="9" fill="#4A8B78" style={nodeStyle(0.58)} />
      <circle cx="236" cy="116" r="9" fill="#4A8B78" style={nodeStyle(0.66)} />

      <circle cx="56" cy="190" r="5.5" fill="#EDEFF2" style={nodeStyle(1.05)} />
      <circle cx="108" cy="190" r="5.5" fill="#EDEFF2" style={nodeStyle(1.1)} />
      <circle cx="160" cy="190" r="5.5" fill="#EDEFF2" style={nodeStyle(1.15)} />
      <circle cx="212" cy="190" r="5.5" fill="#EDEFF2" style={nodeStyle(1.2)} />
      <circle cx="262" cy="190" r="5.5" fill="#EDEFF2" style={nodeStyle(1.25)} />
    </svg>
  );
}
