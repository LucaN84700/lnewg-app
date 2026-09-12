import { useQuery } from "@tanstack/react-query";
import { NavLink, Outlet } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../hooks/useAuth";
import type { Tenant } from "../types/database";

const navItems = [
  { to: "/", label: "Tableau de bord", end: true, permission: "can_view_dashboard" as const },
  { to: "/clients", label: "Clients", permission: "can_view_clients" as const },
  { to: "/catalogue", label: "Catalogue", permission: "can_view_catalogue" as const },
  { to: "/devis", label: "Devis", permission: "can_view_devis" as const },
  { to: "/factures", label: "Factures", permission: "can_view_factures" as const },
  { to: "/relances", label: "Relances", permission: "can_view_relances" as const },
  { to: "/comptabilite", label: "Comptabilité", permission: "can_view_comptabilite" as const },
  { to: "/settings", label: "Réglages", ownerOnly: true },
  { to: "/billing", label: "Abonnement", ownerOnly: true },
];

export default function AppShell() {
  const { data: tenant } = useQuery({
    queryKey: ["tenant"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tenants").select("*").single();
      if (error) throw error;
      return data as Tenant;
    },
  });

  const { profile } = useAuth();
  const visibleNavItems = navItems.filter((item) => {
    if (item.ownerOnly) return profile?.role === "owner";
    if (!item.permission || !profile || profile.role === "owner") return true;
    return profile[item.permission];
  });

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col bg-navy text-white">
        <div className="flex items-center gap-2 px-5 py-5">
          {tenant?.logo_url && (
            <img src={tenant.logo_url} alt="" className="h-8 w-8 shrink-0 rounded object-contain" />
          )}
          <span className="truncate text-base font-bold text-white">{tenant?.name ?? "…"}</span>
        </div>
        <nav className="mt-4 flex flex-1 flex-col gap-1 px-3">
          {visibleNavItems.map((item) => (
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
