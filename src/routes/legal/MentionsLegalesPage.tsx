import LegalLayout, { Section } from "./LegalLayout";

export default function MentionsLegalesPage() {
  return (
    <LegalLayout title="Mentions légales" updatedAt="15 septembre 2026">
      <Section title="Éditeur">
        <p>
          LNEWG, entreprise individuelle
          <br />
          SIRET : 100 795 251 00014
          <br />
          Siège social : 4 Cité Denis Soulier, 84700 Sorgues, France
          <br />
          TVA non applicable, article 293 B du Code général des impôts
          <br />
          Représentant : Luca Nouveau
          <br />
          Contact : <a href="mailto:contact@lnewg.com" className="text-electric-dark">contact@lnewg.com</a>
        </p>
      </Section>

      <Section title="Directeur de la publication">
        <p>Luca Nouveau, en qualité de représentant de LNEWG.</p>
      </Section>

      <Section title="Hébergement">
        <p>
          Application (frontend) : Netlify, Inc. (États-Unis) — <a href="https://www.netlify.com" target="_blank" rel="noopener" className="text-electric-dark">www.netlify.com</a>
          <br />
          Base de données et authentification : Supabase, Inc., hébergé dans l'Union européenne (région Paris/Francfort) — <a href="https://supabase.com" target="_blank" rel="noopener" className="text-electric-dark">supabase.com</a>
        </p>
      </Section>

      <Section title="Propriété intellectuelle">
        <p>
          Le logiciel, son code, son interface et sa documentation sont la propriété de LNEWG. Les données que vous
          saisissez (clients, devis, factures) restent votre propriété : voir nos{" "}
          <a href="/cgv" className="text-electric-dark">conditions générales de vente</a>.
        </p>
      </Section>

      <Section title="Données personnelles">
        <p>
          Le traitement de vos données personnelles est détaillé dans notre{" "}
          <a href="/confidentialite" className="text-electric-dark">politique de confidentialité</a>.
        </p>
      </Section>

      <Section title="Droit applicable">
        <p>
          Les présentes mentions légales sont soumises au droit français. À défaut de résolution amiable, les
          tribunaux compétents du ressort du siège social de LNEWG seront seuls compétents.
        </p>
      </Section>
    </LegalLayout>
  );
}
