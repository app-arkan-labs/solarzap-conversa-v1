/**
 * Standard PMT (Payment) function for fixed-rate loan installments.
 * @param rate Monthly interest rate as percentage (e.g. 1.5 means 1.5%)
 * @param nper Total number of payment periods
 * @param pv Present value (loan amount)
 */
export function calcPMT(rate: number, nper: number, pv: number): number {
  if (rate === 0) return pv / nper;
  const r = rate / 100;
  return (pv * r * Math.pow(1 + r, nper)) / (Math.pow(1 + r, nper) - 1);
}
