export interface ParsedTimeframe {
  days: number;
  label: string;
}

export function parseCustomTimeframe(value: string): ParsedTimeframe | null {
  const label = value.trim().replace(/\s+/g, " ");
  const normalized = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const match = normalized.match(/^(\d{1,4})\s*(dia|dias|semana|semanas|mes|meses|ano|anos)$/);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2];
  const multiplier = unit.startsWith("dia") ? 1 : unit.startsWith("semana") ? 7 : unit.startsWith("mes") ? 30 : 365;
  const days = amount * multiplier;
  if (amount < 1 || days > 3650) return null;
  return { days, label };
}
