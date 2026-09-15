import LegalLayout, { Section } from "./LegalLayout";

export default function ConfidentialitePage() {
  return (
    <LegalLayout title="Politique de confidentialité" updatedAt="15 septembre 2026">
      <Section title="Responsable de traitement">
        <p>
          LNEWG (Luca Nouveau), entreprise individuelle, 4 Cité Denis Soulier, 84700 Sorgues —{" "}
          <a href="mailto:contact@lnewg.com" className="text-electric-dark">contact@lnewg.com</a>.
        </p>
      </Section>

      <Section title="Données que nous collectons">
        <ul className="list-disc pl-5">
          <li>Compte : email, nom, nom de l'entreprise, mot de passe (stocké chiffré par notre hébergeur, jamais en clair)</li>
          <li>Données métier que vous saisissez : clients, devis, factures, relances, catalogue de prix</li>
          <li>Dictée vocale : si vous utilisez la création de devis par la voix, l'enregistrement audio est transmis à OpenAI pour transcription et structuration, puis n'est pas conservé au-delà du traitement</li>
          <li>Appareils connectés : un identifiant technique par appareil (pour appliquer la limite du forfait), pas de données de géolocalisation précise</li>
          <li>Paiement : les coordonnées bancaires sont saisies directement chez Stripe et ne transitent jamais par nos serveurs ni ne sont stockées par LNEWG</li>
        </ul>
      </Section>

      <Section title="Pourquoi nous les traitons">
        <p>Fournir le service (devis, factures, relances), gérer votre abonnement et facturation, vous contacter en cas de besoin, et améliorer le produit.</p>
      </Section>

      <Section title="Avec qui elles sont partagées">
        <p>Nous ne vendons aucune donnée. Elles sont transmises aux prestataires strictement nécessaires au fonctionnement du service :</p>
        <ul className="list-disc pl-5">
          <li><strong>Supabase</strong> — hébergement de la base de données et authentification, Union européenne</li>
          <li><strong>Netlify</strong> — hébergement de l'application, États-Unis</li>
          <li><strong>Stripe</strong> — traitement des paiements</li>
          <li><strong>Resend</strong> — envoi des emails de relance à vos clients, en votre nom</li>
          <li><strong>OpenAI</strong> — transcription et structuration des devis dictés à la voix (États-Unis, uniquement si vous utilisez cette fonctionnalité)</li>
        </ul>
        <p>Certains de ces prestataires sont situés hors de l'Union européenne (Netlify, OpenAI) ; ils s'appuient sur des clauses contractuelles types ou un cadre équivalent pour encadrer ce transfert.</p>
      </Section>

      <Section title="Durée de conservation">
        <p>
          Vos données sont conservées tant que votre compte est actif. Les factures sont conservées 10 ans après la
          clôture du compte, conformément à l'obligation légale de conservation des documents comptables. Vous pouvez
          demander la suppression de votre compte et de vos données à tout moment, sous réserve de cette obligation
          légale sur les factures.
        </p>
      </Section>

      <Section title="Sécurité">
        <p>
          Chaque entreprise cliente est isolée des autres par un cloisonnement technique au niveau de la base de
          données (aucune entreprise ne peut accéder aux données d'une autre), et toutes les communications sont
          chiffrées (HTTPS).
        </p>
      </Section>

      <Section title="Vos droits">
        <p>
          Conformément au RGPD, vous disposez d'un droit d'accès, de rectification, d'effacement, de portabilité et
          d'opposition sur vos données. Pour l'exercer, écrivez à{" "}
          <a href="mailto:contact@lnewg.com" className="text-electric-dark">contact@lnewg.com</a>. Vous pouvez aussi
          introduire une réclamation auprès de la CNIL (<a href="https://www.cnil.fr" target="_blank" rel="noopener" className="text-electric-dark">cnil.fr</a>).
        </p>
      </Section>

      <Section title="Cookies">
        <p>
          L'application utilise uniquement des cookies techniques nécessaires à votre connexion (session
          d'authentification). Aucun cookie de mesure d'audience ou publicitaire n'est utilisé.
        </p>
      </Section>
    </LegalLayout>
  );
}
