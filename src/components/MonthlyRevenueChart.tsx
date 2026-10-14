// Graphique en barres du chiffre d'affaires HT par mois (forfait Master). Pas de librairie de
// graphiques dans le projet : rendu en SVG natif plutôt que d'ajouter une dépendance pour un
// usage aussi simple. Met en avant le meilleur et le moins bon mois en nuances de la même couleur
// de marque (séquentiel), pas une palette rouge/vert : ce ne sont pas des pertes comptables,
// juste des mois à chiffre d'affaires plus faible.

const SHORT_MOIS = ["Janv", "Févr", "Mars", "Avr", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov", "Déc"];

export interface MonthlyRevenuePoint {
  label: string;
  ht: number;
}

export default function MonthlyRevenueChart({
  data,
  highlightLabel,
}: {
  data: MonthlyRevenuePoint[];
  highlightLabel?: string;
}) {
  const width = 760;
  const height = 220;
  const paddingTop = 12;
  const paddingBottom = 26;
  const chartHeight = height - paddingTop - paddingBottom;
  const gap = 8;
  const barWidth = (width - gap * (data.length - 1)) / data.length;
  const max = Math.max(1, ...data.map((d) => d.ht));

  const withRevenue = data.filter((d) => d.ht > 0);
  const best = withRevenue.length > 0 ? withRevenue.reduce((a, b) => (b.ht > a.ht ? b : a)) : null;
  const worst = withRevenue.length > 1 ? withRevenue.reduce((a, b) => (b.ht < a.ht ? b : a)) : null;

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label="Chiffre d'affaires HT par mois"
      >
        {data.map((d, i) => {
          const barHeight = (d.ht / max) * chartHeight;
          const x = i * (barWidth + gap);
          const y = paddingTop + chartHeight - barHeight;
          const isBest = best?.label === d.label;
          const isWorst = worst?.label === d.label;
          const fill = isBest ? "var(--color-electric-dark)" : isWorst ? "var(--color-line)" : "var(--color-electric)";
          const isCurrent = highlightLabel === d.label;
          return (
            <g key={d.label}>
              <rect
                x={x}
                y={d.ht > 0 ? y : paddingTop + chartHeight - 2}
                width={barWidth}
                height={Math.max(d.ht > 0 ? barHeight : 2, 2)}
                rx={4}
                fill={fill}
                stroke={isCurrent ? "var(--color-navy)" : "none"}
                strokeWidth={isCurrent ? 1.5 : 0}
              >
                <title>{`${d.label} : ${d.ht.toFixed(2)} € HT`}</title>
              </rect>
              <text
                x={x + barWidth / 2}
                y={height - 8}
                textAnchor="middle"
                fontSize="10"
                fill="var(--color-gray)"
              >
                {SHORT_MOIS[i] ?? d.label.slice(0, 4)}
              </text>
            </g>
          );
        })}
      </svg>
      {(best || worst) && (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-gray">
          {best && (
            <p className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-electric-dark" />
              Meilleur mois : <strong className="text-navy">{best.label}</strong> ({best.ht.toFixed(2)} € HT)
            </p>
          )}
          {worst && (
            <p className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm border border-line bg-bg-light" />
              Mois le plus faible : <strong className="text-navy">{worst.label}</strong> ({worst.ht.toFixed(2)} € HT)
            </p>
          )}
        </div>
      )}
    </div>
  );
}
