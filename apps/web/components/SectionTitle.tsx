export function SectionTitle({
  eyebrow,
  title,
  subtitle
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      {eyebrow ? (
        <span className="text-sm font-bold uppercase text-coral">{eyebrow}</span>
      ) : null}
      <h2 className="text-2xl font-bold text-ink sm:text-3xl">{title}</h2>
      {subtitle ? <p className="max-w-2xl text-sm leading-6 text-slate-600">{subtitle}</p> : null}
    </div>
  );
}
