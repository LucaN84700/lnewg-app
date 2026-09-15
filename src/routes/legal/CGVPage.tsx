import LegalLayout, { Section } from "./LegalLayout";

export default function CGVPage() {
  return (
    <LegalLayout title="Conditions générales de vente" updatedAt="15 septembre 2026">
      <p className="rounded-md border border-line bg-white p-4 text-sm text-gray">
        Ce service est destiné aux professionnels (artisans, TPE, PME) dans le cadre de leur activité. En créant un
        compte ou en souscrivant à un forfait payant, vous acceptez les présentes conditions générales de vente.
      </p>

      <Section title="1. Éditeur">
        <p>
          LNEWG, entreprise individuelle, SIRET 100 795 251 00014, 4 Cité Denis Soulier, 84700 Sorgues —{" "}
          <a href="mailto:contact@lnewg.com" className="text-electric-dark">contact@lnewg.com</a>.
        </p>
      </Section>

      <Section title="2. Description du service">
        <p>
          LNEWG édite un logiciel en ligne (SaaS) de gestion pour professionnels : création de devis, facturation,
          relances clients automatiques, catalogue de prix et suivi comptable, accessible sur abonnement via
          app.lnewg.com.
        </p>
      </Section>

      <Section title="3. Forfaits et tarifs">
        <ul className="list-disc pl-5">
          <li>Starter : 49,99 € HT/mois</li>
          <li>Pro : 89,99 € HT/mois</li>
          <li>Master : 119,99 € HT/mois</li>
        </ul>
        <p>
          Chaque forfait est disponible en facturation mensuelle ou annuelle (-10%). Des utilisateurs ou appareils
          supplémentaires peuvent être ajoutés en libre-service pour 5 € HT/mois chacun. LNEWG étant en franchise en
          base de TVA (article 293 B du CGI), ces montants ne sont pas majorés de TVA. Les tarifs sont indiqués sur la
          page Abonnement de l'application et peuvent évoluer ; tout changement de tarif ne s'applique pas
          rétroactivement à un abonnement en cours avant son prochain renouvellement.
        </p>
      </Section>

      <Section title="4. Essai gratuit">
        <p>
          Toute nouvelle inscription bénéficie d'un accès au forfait Master pendant une période d'essai (7 jours par
          défaut, pouvant être prolongée via un code d'invitation). Une carte bancaire est requise dès l'inscription
          pour démarrer l'essai ; aucun débit n'est effectué avant la fin de la période d'essai. Environ 2 jours avant
          la fin de l'essai, un email vous invite à confirmer si vous souhaitez continuer sur le forfait Master : en
          cas de confirmation, la carte déjà enregistrée est débitée sans nouvelle saisie. Sans confirmation de votre
          part, aucun débit n'a lieu. À l'issue de la période d'essai, si aucun forfait payant n'a été souscrit,
          l'accès au compte est suspendu jusqu'à la souscription d'un forfait (Starter, Pro ou Master) : aucun accès
          gratuit n'est proposé au-delà de la période d'essai.
        </p>
      </Section>

      <Section title="5. Paiement et renouvellement">
        <p>
          Le paiement s'effectue par carte bancaire via Stripe, prestataire de paiement tiers. L'abonnement est sans
          engagement de durée et se renouvelle automatiquement (mensuellement ou annuellement selon l'option choisie)
          jusqu'à résiliation. Un email de rappel est envoyé environ 4 jours avant chaque prélèvement automatique,
          indiquant le montant et la date. LNEWG n'a pas accès à vos coordonnées bancaires, gérées exclusivement par
          Stripe.
        </p>
      </Section>

      <Section title="6. Résiliation">
        <p>
          Vous pouvez résilier votre abonnement à tout moment depuis la page Abonnement de l'application, ou en
          écrivant à <a href="mailto:contact@lnewg.com" className="text-electric-dark">contact@lnewg.com</a>. La
          résiliation prend effet à la fin de la période déjà payée ; aucun remboursement au prorata n'est effectué
          pour la période en cours, sauf disposition légale contraire.
        </p>
      </Section>

      <Section title="7. Droit de rétractation">
        <p>
          Ce service s'adresse à des professionnels agissant dans le cadre de leur activité : le droit de
          rétractation de 14 jours prévu par le Code de la consommation pour les particuliers ne s'applique pas, sauf
          si vous remplissez les conditions prévues à l'article L221-3 du Code de la consommation (activité
          principale différente et 5 salariés ou moins), auquel cas ce droit s'exerce dans les conditions de cet
          article.
        </p>
      </Section>

      <Section title="8. Suspension et résiliation par LNEWG">
        <p>
          LNEWG peut suspendre l'accès à un compte en cas de défaut de paiement (échec du prélèvement lors du
          renouvellement), d'utilisation non conforme aux présentes conditions, ou d'usage frauduleux. En cas de
          défaut de paiement, un email vous informe de la situation et vous invite à mettre à jour votre moyen de
          paiement ; l'accès au compte est rétabli automatiquement dès régularisation.
        </p>
      </Section>

      <Section title="9. Disponibilité et responsabilité">
        <p>
          LNEWG met en œuvre des moyens raisonnables pour assurer la disponibilité et le bon fonctionnement du
          service, sans garantie de disponibilité continue (maintenance, incidents techniques indépendants de notre
          volonté). Vous restez seul responsable de l'exactitude des informations saisies dans vos devis et factures,
          et du respect de vos propres obligations légales et comptables en tant qu'émetteur de ces documents.
        </p>
      </Section>

      <Section title="10. Propriété des données">
        <p>
          Les données que vous saisissez (clients, devis, factures) vous appartiennent. Vous pouvez les exporter et
          en demander la suppression à tout moment, sous réserve des durées de conservation légales applicables aux
          documents comptables. Voir notre{" "}
          <a href="/confidentialite" className="text-electric-dark">politique de confidentialité</a>.
        </p>
      </Section>

      <Section title="11. Modification des présentes conditions">
        <p>
          LNEWG peut modifier les présentes conditions générales de vente ; toute modification substantielle vous
          sera notifiée par email avant son entrée en vigueur.
        </p>
      </Section>

      <Section title="12. Droit applicable et litiges">
        <p>
          Les présentes conditions sont soumises au droit français. En cas de litige, une solution amiable sera
          recherchée en priorité ; à défaut, les tribunaux compétents du ressort du siège social de LNEWG seront
          seuls compétents.
        </p>
      </Section>
    </LegalLayout>
  );
}
