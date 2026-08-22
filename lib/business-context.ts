export function inferCustomerType(input: { rubro?: string | null; descripcion?: string | null; otrosCanales?: string | null }): "B2B" | "B2C" | "Ambos" | undefined {
  const text = `${input.rubro || ""} ${input.descripcion || ""} ${input.otrosCanales || ""}`.toLowerCase();
  const b2b = /empresa|corporativ|mayorista|consultor[ií]a|software|saas|estudio contable|agencia/.test(text);
  const b2c = /caf[eé]|restaurante|est[eé]tica|salud|gimnasio|tienda|comercio|peluquer|paciente|consumidor|local f[ií]sico/.test(text);
  if (b2b && b2c) return "Ambos";
  if (b2b) return "B2B";
  if (b2c) return "B2C";
  return undefined;
}
