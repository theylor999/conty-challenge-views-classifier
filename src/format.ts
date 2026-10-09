const int = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const one = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

export const fmt = (n: number) => int.format(Math.round(n));
export const fmt1 = (n: number) => one.format(n);
