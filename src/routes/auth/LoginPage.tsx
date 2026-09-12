import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { setRememberMe, supabase } from "../../lib/supabaseClient";

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    setRememberMe(remember);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    navigate("/");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-8">
        <div className="flex items-center gap-2">
          <img src="/lnewg-icon.png" alt="" className="h-16 w-16 object-contain" />
          <span translate="no" className="font-display text-lg font-extrabold tracking-widest">
            <span className="text-navy">L</span>
            <span className="text-electric">NEW</span>
            <span className="text-navy">G</span>
          </span>
        </div>
        <h1 className="mt-4 text-xl font-bold text-navy">Connexion</h1>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
          <input
            type="email"
            placeholder="Email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-line px-3 py-2 text-sm"
          />
          <input
            type="password"
            placeholder="Mot de passe"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-md border border-line px-3 py-2 text-sm"
          />

          <label className="flex items-center gap-2 text-sm text-navy">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-line"
            />
            Rester connecté
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-md bg-electric px-4 py-2 text-sm font-semibold text-navy disabled:opacity-50"
          >
            {loading ? "Connexion…" : "Se connecter"}
          </button>
        </form>

        <p className="mt-4 text-sm text-gray">
          Pas encore de compte ? <Link to="/signup" className="text-electric-dark">Créer un compte</Link>
        </p>
      </div>
    </div>
  );
}
