import { NavLink, Outlet } from "react-router-dom";

const navItems = [
  { to: "/", label: "Tableau de bord", end: true },
  { to: "/clients", label: "Clients" },
  { to: "/devis", label: "Devis" },
  { to: "/factures", label: "Factures" },
  { to: "/settings", label: "Réglages" },
  { to: "/billing", label: "Abonnement" },
];

export default function AppShell() {
  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 bg-navy text-white">
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
        <nav className="mt-4 flex flex-col gap-1 px-3">
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
      </aside>
      <main className="flex-1 bg-bg-light">
        <Outlet />
      </main>
    </div>
  );
}
