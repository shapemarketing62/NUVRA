import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();

export const businessUpdateSchema = z.object({
  expectedUpdatedAt: z.string().datetime(),
  business: z.object({
    nombre: z.string().trim().min(1).max(120).optional(),
    rubro: z.string().trim().min(1).max(120).optional(),
    descripcion: optionalText(2000),
    ubicacion: optionalText(240),
    ciudad: optionalText(120),
    pais: optionalText(120),
    empleados: optionalText(120),
    webUrl: optionalText(2048),
    instagramHandle: optionalText(2048),
    noWebDeclared: z.boolean().optional(),
    noInstagramDeclared: z.boolean().optional(),
    otrosCanales: optionalText(4000),
    canales: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
    inversionMarketing: z.number().min(0).max(1_000_000_000_000).optional().nullable(),
  }).strict().optional(),
  goal: z.object({
    objetivo: z.string().trim().min(1).max(500),
    objetivoCustom: optionalText(500),
    magnitud: z.number().min(0).max(1000).optional().nullable(),
    plazoDias: z.number().int().min(1).max(3650),
    plazoLabel: z.string().trim().min(1).max(80),
  }).strict().optional(),
}).strict().refine((value) => value.business || value.goal, {
  message: "No hay cambios para guardar.",
}).superRefine((value, context) => {
  if (value.business?.noWebDeclared && value.business.webUrl) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["business", "webUrl"], message: "No se puede declarar que no hay página web y enviar una URL." });
  }
  if (value.business?.noInstagramDeclared && value.business.instagramHandle) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["business", "instagramHandle"], message: "No se puede declarar que no hay Instagram y enviar un perfil." });
  }
});

export type BusinessUpdateInput = z.infer<typeof businessUpdateSchema>;

export const ANALYSIS_RELEVANT_BUSINESS_FIELDS = [
  "nombre", "rubro", "ubicacion", "ciudad", "pais", "empleados", "webUrl",
  "instagramHandle", "noWebDeclared", "noInstagramDeclared", "canales", "inversionMarketing",
] as const;

export const MINOR_BUSINESS_FIELDS = ["descripcion", "otrosCanales"] as const;
