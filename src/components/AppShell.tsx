import { NavLink, Outlet } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

const navItems = [
  { to: "/", label: "Tableau de bord", end: true },
  { to: "/clients", label: "Clients" },
  { to: "/catalogue", label: "Catalogue" },
  { to: "/devis", label: "Devis" },
  { to: "/factures", label: "Factures" },
  { to: "/relances", label: "Relances" },
  { to: "/settings", label: "Réglages" },
  { to: "/billing", label: "Abonnement" },
];

export default function AppShell() {
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col bg-navy text-white">
        <div className="flex items-center gap-2 px-5 py-5">
          <span
            translate="no"
            className="font-display text-lg font-extrabold tracking-widest"
          >
            <span className="text-white">L</span>
            <span className="text-electric">NEW</span>
            <span className="text-white">G</span>
          </span>
        </div>
        <nav className="mt-4 flex flex-1 flex-col gap-1 px-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm font-medium ${
                  isActive
                    ? "bg-electric/10 text-electric"
                    : "text-white/70 hover:text-electric"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => supabase.auth.signOut()}
          className="mx-3 mb-5 rounded-md px-3 py-2 text-left text-sm font-medium text-white/50 hover:text-electric"
        >
          Déconnexion
        </button>
      </aside>
      <main className="flex-1 bg-bg-light">
        <Outlet />
      </main>
    </div>
  );
}
