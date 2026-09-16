// Code-unit order, not localeCompare: collation differs between ICU builds and would make
// the seed's ordering machine-dependent.
export const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export const normaliseName = (name: string): string => name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
