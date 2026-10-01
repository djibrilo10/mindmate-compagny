// Badge du département à côté d'un nom (AUDIT.md 7.34). Sans état ni hook :
// utilisable dans les pages serveur ET les composants client.
export function DepartmentBadge({
  name,
  color,
  className = "",
}: {
  name: string;
  color: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex max-w-[12rem] items-center gap-1 rounded-full border px-2 py-0.5 align-middle text-[11px] font-medium leading-4 ${className}`}
      style={{ borderColor: `${color}66`, backgroundColor: `${color}1A`, color: "#1C2438" }}
      title={name}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      <span className="truncate">{name}</span>
    </span>
  );
}
