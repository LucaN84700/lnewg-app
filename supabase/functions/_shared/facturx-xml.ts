// Génère le XML CII (Cross Industry Invoice) conforme EN16931, profil Factur-X BASIC.
// Ce XML est ensuite embarqué dans le PDF (voir index.ts) pour former un Factur-X complet.
// Référence : norme EN16931 / spécification Factur-X (FNFE-MPE).

interface Ligne {
  description: string;
  quantite: number;
  unite: string;
  prix_unitaire_ht: number;
}

// deno-lint-ignore no-explicit-any
type AnyRecord = Record<string, any>;

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toCiiDate(isoDate: string) {
  // EN16931/CII exige le format AAAAMMJJ (code 102)
  return isoDate.replaceAll("-", "");
}

function amount(n: number) {
  return n.toFixed(2);
}

// Codes unité UN/CEFACT (rec. 20) les plus courants en BTP ; C62 (unité/pièce) par défaut.
const UNIT_CODES: Record<string, string> = {
  u: "C62",
  unite: "C62",
  h: "HUR",
  heure: "HUR",
  jour: "DAY",
  j: "DAY",
  m: "MTR",
  m2: "MTK",
  "m²": "MTK",
  m3: "MTQ",
  "m³": "MTQ",
  kg: "KGM",
  forfait: "C62",
};

function unitCode(unite: string) {
  return UNIT_CODES[unite.trim().toLowerCase()] ?? "C62";
}

export function buildFacturXml(facture: AnyRecord, tenant: AnyRecord): string {
  const client = facture.clients ?? {};
  const lignes = (facture.lignes ?? []) as Ligne[];
  const franchise = tenant.tva_regime === "franchise";
  const tvaRate = franchise ? 0 : Number(tenant.tva_rate ?? 20);
  const tvaCategory = franchise ? "E" : "S";
  const tvaExemptionReason = franchise ? "TVA non applicable, art. 293 B du CGI" : "";

  const lines = lignes
    .map((ligne, index) => {
      const lineTotal = ligne.quantite * ligne.prix_unitaire_ht;
      return `
      <ram:IncludedSupplyChainTradeLineItem>
        <ram:AssociatedDocumentLineDocument>
          <ram:LineID>${index + 1}</ram:LineID>
        </ram:AssociatedDocumentLineDocument>
        <ram:SpecifiedTradeProduct>
          <ram:Name>${xmlEscape(ligne.description)}</ram:Name>
        </ram:SpecifiedTradeProduct>
        <ram:SpecifiedLineTradeAgreement>
          <ram:NetPriceProductTradePrice>
            <ram:ChargeAmount>${amount(ligne.prix_unitaire_ht)}</ram:ChargeAmount>
          </ram:NetPriceProductTradePrice>
        </ram:SpecifiedLineTradeAgreement>
        <ram:SpecifiedLineTradeDelivery>
          <ram:BilledQuantity unitCode="${unitCode(ligne.unite)}">${ligne.quantite}</ram:BilledQuantity>
        </ram:SpecifiedLineTradeDelivery>
        <ram:SpecifiedLineTradeSettlement>
          <ram:ApplicableTradeTax>
            <ram:TypeCode>VAT</ram:TypeCode>
            <ram:CategoryCode>${tvaCategory}</ram:CategoryCode>
            <ram:RateApplicablePercent>${tvaRate}</ram:RateApplicablePercent>
          </ram:ApplicableTradeTax>
          <ram:SpecifiedTradeSettlementLineMonetarySummation>
            <ram:LineTotalAmount>${amount(lineTotal)}</ram:LineTotalAmount>
          </ram:SpecifiedTradeSettlementLineMonetarySummation>
        </ram:SpecifiedLineTradeSettlement>
      </ram:IncludedSupplyChainTradeLineItem>`;
    })
    .join("");

  const sellerTaxRegistration = tenant.siret
    ? `
        <ram:SpecifiedLegalOrganization>
          <ram:ID schemeID="0002">${xmlEscape(tenant.siret)}</ram:ID>
        </ram:SpecifiedLegalOrganization>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${xmlEscape(facture.numero)}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${toCiiDate(facture.date_facture)}</udt:DateTimeString>
    </ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>${lines}
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:Name>${xmlEscape(tenant.name)}</ram:Name>${sellerTaxRegistration}
        <ram:PostalTradeAddress>
          <ram:CountryID>FR</ram:CountryID>
        </ram:PostalTradeAddress>
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${xmlEscape(client.company_name || client.name || "")}</ram:Name>
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery/>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      <ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:TypeCode>30</ram:TypeCode>
        <ram:Information>${xmlEscape(facture.mode_paiement || "Virement bancaire")}</ram:Information>
        ${tenant.iban ? `<ram:PayeePartyCreditorFinancialAccount><ram:IBANID>${xmlEscape(tenant.iban.replace(/\s+/g, ""))}</ram:IBANID></ram:PayeePartyCreditorFinancialAccount>` : ""}
      </ram:SpecifiedTradeSettlementPaymentMeans>
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${amount(facture.tva_montant)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        ${tvaExemptionReason ? `<ram:ExemptionReason>${xmlEscape(tvaExemptionReason)}</ram:ExemptionReason>` : ""}
        <ram:BasisAmount>${amount(facture.total_ht)}</ram:BasisAmount>
        <ram:CategoryCode>${tvaCategory}</ram:CategoryCode>
        <ram:RateApplicablePercent>${tvaRate}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>
      <ram:SpecifiedTradePaymentTerms>
        <ram:DueDateDateTime>
          <udt:DateTimeString format="102">${toCiiDate(facture.date_echeance)}</udt:DateTimeString>
        </ram:DueDateDateTime>
      </ram:SpecifiedTradePaymentTerms>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${amount(facture.total_ht)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${amount(facture.total_ht)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">${amount(facture.tva_montant)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${amount(facture.total_ttc)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${amount(facture.total_ttc)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
}
