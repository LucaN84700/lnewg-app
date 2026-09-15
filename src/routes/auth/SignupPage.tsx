import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";

export default function SignupPage() {
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Pré-rempli depuis ?code=XXXX si le lien envoyé au testeur bêta en contient un, modifiable
  // à la main sinon. Un code invalide ou déjà utilisé ne bloque pas l'inscription : elle bascule
  // simplement sur l'essai standard (voir handle_new_user côté base).
  const [betaCode, setBetaCode] = useState(() => new URLSearchParams(window.location.search).get("code") ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { company_name: companyName, full_name: fullName, beta_code: betaCode.trim() || undefined },
      },
    });

    setLoading(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    navigate("/");
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-navy px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-8">
        <span translate="no" className="font-display text-lg font-extrabold tracking-widest">
          <span className="text-navy">L</span>
          <span className="text-electric">NEW</span>
          <span className="text-navy">G</span>
        </span>
        <h1 className="mt-4 text-xl font-bold text-navy">Créer un compte</h1>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
          <input
            type="text"
            placeholder="Nom de votre entreprise"
            required
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="rounded-md border border-line px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="Votre nom"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="rounded-md border border-line px-3 py-2 text-sm"
          />
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
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-md border border-line px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="Code bêta (facultatif)"
            value={betaCode}
            onChange={(e) => setBetaCode(e.target.value)}
            className="rounded-md border border-line px-3 py-2 text-sm"
          />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-md bg-electric px-4 py-2 text-sm font-semibold text-navy disabled:opacity-50"
          >
            {loading ? "Création…" : "Créer mon compte"}
          </button>
        </form>

        <p className="mt-3 text-xs text-gray">
          En créant un compte, tu acceptes nos{" "}
          <Link to="/cgv" className="text-electric-dark">CGV</Link> et notre{" "}
          <Link to="/confidentialite" className="text-electric-dark">politique de confidentialité</Link>.
        </p>

        <p className="mt-4 text-sm text-gray">
          Déjà un compte ? <Link to="/login" className="text-electric-dark">Se connecter</Link>
        </p>
      </div>
      <p className="absolute bottom-4 flex gap-4 text-xs text-white/40">
        <Link to="/mentions-legales" className="hover:text-white/70">Mentions légales</Link>
        <Link to="/cgv" className="hover:text-white/70">CGV</Link>
        <Link to="/confidentialite" className="hover:text-white/70">Confidentialité</Link>
      </p>
    </div>
  );
}
