/**
 * Shared chart color palette — Google Material Design finance style.
 * Deeper, less saturated than Tailwind 500 defaults; cohesive across charts.
 */
export const C = {
  // Primary portfolio series
  portfolio: '#1A73E8',        // Google blue
  portfolioReal: '#8AB4F8',    // light blue variant (for dashed real-value line)

  // Drawdown
  drawdown: '#D93025',                      // Google red — less harsh than #ef4444
  drawdownArea: 'rgba(217, 48, 37, 0.12)',
  drawdownMarkArea: 'rgba(217, 48, 37, 0.07)',

  // Annual returns
  positive: '#1E8E3E',   // Google green — deeper/less neon than #22c55e
  negative: '#D93025',

  // Rolling returns — blue → violet → teal spectrum (harmonious)
  roll3y: '#1A73E8',
  roll5y: '#9334EA',   // Google violet
  roll10y: '#007B83',  // Google teal

  // Multi-portfolio overlay (comparison mode)
  series: ['#1A73E8', '#9334EA', '#007B83', '#E37400'] as const,
  //         blue       violet      teal       amber

  // Grid lines — subtler than #f0f0f0
  grid: '#E8EAED',

  // Monte Carlo fan bands
  mc: {
    upperBorder: 'rgba(26, 115, 232, 0.20)',
    upperFillOuter: 'rgba(26, 115, 232, 0.06)',
    upperFillInner: 'rgba(26, 115, 232, 0.10)',
    median: '#1A73E8',
    lowerBorder: 'rgba(217, 48, 37, 0.18)',
    lowerFillInner: 'rgba(217, 48, 37, 0.08)',
    lowerFillOuter: 'rgba(217, 48, 37, 0.05)',
  },
} as const;
