import { z } from "zod";
import type { OnboardingV2Input } from "./onboarding-v2-types";

export const PRESUPUESTO_OPTIONS = [
  { label: "Nada por ahora", value: "none", amount: 0 },
  { label: "Hasta USD 100/mes", value: "low", amount: 75 },
  { label: "USD 100–300/mes", value: "medium", amount: 200 },
  { label: "USD 300–1.000/mes", value: "high", amount: 500 },
  { label: "Más de USD 1.000/mes", value: "very_high", amount: 1000 },
  { label: "Prefiero no decirlo", value: "prefiero_no_decir", amount: null },
] as const;

export const CAPACIDAD_OPTIONS = [
  { label: "Yo", value: "self" },
  { label: "Alguien de mi equipo", value: "team" },
  { label: "Una agencia o profesional externo", value: "agency" },
  { label: "Nadie por ahora", value: "none" },
] as const;

export const OBJETIVOS_OPTIONS = [
  { label: "Conseguir más consultas", value: "Conseguir más consultas" },
  { label: "Conseguir más clientes", value: "Conseguir más clientes" },
  { label: "Vender más", value: "Vender más" },
  { label: "Hacer que más personas conozcan mi negocio", value: "Hacer que más personas conozcan mi negocio" },
  { label: "Mejorar mis redes sociales", value: "Mejorar mis redes sociales" },
  { label: "Conseguir más visitas al local", value: "Conseguir más visitas al local" },
  { label: "Mejorar mi página web", value: "Mejorar mi página web" },
  { label: "Lograr que más personas vuelvan a comprar", value: "Lograr que más personas vuelvan a comprar" },
  { label: "Otro", value: "Otro" },
] as const;

export const PLAZO_OPTIONS = [
  { label: "1 mes", value: "30d", dias: 30 },
  { label: "3 meses", value: "3m", dias: 90 },
  { label: "6 meses", value: "6m", dias: 180 },
  { label: "12 meses", value: "12m", dias: 365 },
  { label: "Otro", value: "custom", dias: 0 },
] as const;

export const TIPO_CLIENTE_OPTIONS = [
  { label: "Personas", value: "B2C" },
  { label: "Empresas", value: "B2B" },
  { label: "A ambos", value: "Ambos" },
] as const;

export const CAPACIDAD_COMERCIAL_OPTIONS = [
  { label: "Sí, tenemos capacidad", value: "si" },
  { label: "Algunas más", value: "algunas" },
  { label: "Estamos casi al límite", value: "limite" },
  { label: "No lo sé", value: "no_se" },
] as const;

export const onboardingV2Schema = z.object({
  nombre: z.string().trim().min(1).max(120),
  rubro: z.string().trim().min(1).max(120),
  ubicacion: z.string().trim().min(1).max(240),
  tipoCliente: z.enum(["B2C", "B2B", "Ambos"]),
  webUrl: z.string().trim().max(2048).optional().nullable(),
  instagramHandle: z.string().trim().max(2048).optional().nullable(),
  noWeb: z.boolean().default(false),
  noInstagram: z.boolean().default(false),
  objetivo: z.string().trim().min(1).max(500),
  objetivoLabel: z.string().trim().min(1).max(120),
  plazoDias: z.number().int().min(1).max(3650),
  plazoLabel: z.string().trim().min(1).max(80),
  presupuesto: z.enum(["none", "low", "medium", "high", "very_high", "prefiero_no_decir"]),
  capacidad: z.enum(["self", "team", "agency", "none"]),
  capacidadComercial: z.enum(["si", "algunas", "limite", "no_se"]).optional().nullable(),
  limitaciones: z.string().max(2000).optional().nullable(),
}).superRefine((data, context) => {
  if (data.noWeb && data.webUrl && data.webUrl.trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["webUrl"], message: "Marcaste que no tenés página web." });
  }
  if (data.noInstagram && data.instagramHandle && data.instagramHandle.trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["instagramHandle"], message: "Marcaste que no tenés Instagram." });
  }
});

export type OnboardingV2Validated = z.infer<typeof onboardingV2Schema>;
