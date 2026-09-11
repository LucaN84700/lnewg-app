import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";
import type { Profile } from "../types/database";

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  profile: Profile | null;
  profileLoading: boolean;
  isOwner: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  loading: true,
  profile: null,
  profileLoading: true,
  isOwner: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      queryClient.invalidateQueries({ queryKey: ["own-profile"] });
    });

    return () => listener.subscription.unsubscribe();
  }, [queryClient]);

  const userId = session?.user.id;
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["own-profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId!).single();
      if (error) throw error;
      return data as Profile;
    },
  });

  const isOwner = profile?.role === "owner";

  return (
    <AuthContext.Provider
      value={{ session, loading, profile: profile ?? null, profileLoading: !!userId && profileLoading, isOwner }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
