import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

export default function LegalLayout({
  title,
  updatedAt,
  children,
}: {
  title: string;
  updatedAt: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-bg-light">
      <div className="mx-auto max-w-3xl px-6 py-14">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="text-sm font-semibold text-electric-dark"
        >
          ← Retour
        </button>
        <h1 className="mt-4 text-3xl font-extrabold text-navy">{title}</h1>
        <p className="mt-1 text-sm text-gray">Dernière mise à jour : {updatedAt}</p>
        <div className="mt-8 flex max-w-none flex-col gap-6">{children}</div>
      </div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-bold text-navy">{title}</h2>
      <div className="mt-2 flex flex-col gap-2 text-sm leading-relaxed text-gray">{children}</div>
    </section>
  );
}
