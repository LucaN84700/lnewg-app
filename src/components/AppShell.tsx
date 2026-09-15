import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, NavLink, Outlet } from "react-router-dom";
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
  { to: "/admin", label: "Administration", adminOnly: true },
];

// LNEWG lui-même utilise son propre SaaS : quand le nom du tenant est littéralement "LNEWG"
// (son compte), on affiche le nom de marque stylisé (NEW en bleu électrique) au lieu du texte
// brut affiché pour n'importe quel autre client.
function TenantName({ name, className }: { name: string; className: string }) {
  if (name === "LNEWG") {
    return (
      <span translate="no" className={`${className} tracking-widest`}>
        <span>L</span>
        <span className="text-electric">NEW</span>
        <span>G</span>
      </span>
    );
  }
  return <span className={className}>{name}</span>;
}

export default function AppShell() {
  const { data: tenant } = useQuery({
    queryKey: ["tenant"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tenants").select("*").single();
      if (error) throw error;
      return data as Tenant;
    },
  });

  const { profile, isPlatformAdmin } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const visibleNavItems = navItems.filter((item) => {
    if (item.adminOnly) return isPlatformAdmin;
    if (item.ownerOnly) return profile?.role === "owner";
    if (!item.permission || !profile || profile.role === "owner") return true;
    return profile[item.permission];
  });

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <header className="flex items-center justify-between gap-3 bg-navy px-4 py-3 text-white md:hidden">
        <div className="flex min-w-0 items-center gap-2">
          {tenant?.logo_url && (
            <img src={tenant.logo_url} alt="" className="h-7 w-7 shrink-0 rounded object-contain" />
          )}
          <TenantName name={tenant?.name ?? "…"} className="truncate text-sm font-bold text-white" />
        </div>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
          className="shrink-0 rounded-md p-1.5 text-white/80 hover:text-electric"
        >
          {menuOpen ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
            </svg>
          )}
        </button>
      </header>

      {menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 -translate-x-full flex-col bg-navy text-white transition-transform duration-200 ease-out md:static md:w-60 md:translate-x-0 ${
          menuOpen ? "translate-x-0" : ""
        }`}
      >
        <div className="hidden items-center gap-2 px-5 py-5 md:flex">
          {tenant?.logo_url && (
            <img src={tenant.logo_url} alt="" className="h-8 w-8 shrink-0 rounded object-contain" />
          )}
          <TenantName name={tenant?.name ?? "…"} className="truncate text-base font-bold text-white" />
        </div>
        <nav className="mt-4 flex flex-1 flex-col gap-1 px-3 md:mt-4">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMenuOpen(false)}
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
        <div className="mx-3 mb-4 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/25">
          <Link to="/mentions-legales" className="hover:text-white/60">Mentions légales</Link>
          <Link to="/cgv" className="hover:text-white/60">CGV</Link>
          <Link to="/confidentialite" className="hover:text-white/60">Confidentialité</Link>
        </div>
      </aside>
      <main className="min-w-0 flex-1 bg-bg-light">
        <Outlet />
      </main>
    </div>
  );
}
