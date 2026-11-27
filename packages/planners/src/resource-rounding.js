// Normalize only roundoff next to a nonzero integer before whole-count
// rounding. The cap keeps the tolerance narrow even for large estimates.
const tolerance = (value) => Math.min(1e-7, 8 * Number.EPSILON * Math.abs(value));
function integerBoundary(value) {
  const nearest = Math.round(value);
  return nearest !== 0 && Math.abs(value - nearest) <= tolerance(value) ? nearest : value;
}
export const wholeFloor = (value) => Math.floor(integerBoundary(value));
export const wholeCeil = (value) => Math.ceil(integerBoundary(value));
export const budgetFits = (cost, available) =>
  cost <= available || cost - available <= tolerance(Math.max(Math.abs(cost), Math.abs(available)));

export function decimalParts(value) {
  const [mantissa, exponent = '0'] = String(value).split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  return { units: BigInt(whole + fraction), exponent: Number(exponent) - fraction.length };
}

export const unitsAtExponent = (decimal, exponent) => decimal.units * 10n ** BigInt(decimal.exponent - exponent);
