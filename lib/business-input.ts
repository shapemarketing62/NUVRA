import { z } from "zod";

export const businessInputSchema = z.object({
  nombre: z.string().trim().min(1).max(120),
  rubro: z.string().trim().min(1).max(120),
  descripcion: z.string().max(2000).optional(),
  ubicacion: z.string().max(240).optional(),
  ciudad: z.string().max(120).optional(),
  pais: z.string().max(120).optional(),
  tamano: z.string().max(120).optional(),
  tipoCliente: z.string().max(120).optional(),
  publicoObjetivo: z.string().max(500).optional(),
  productosServicios: z.string().max(2000).optional(),
  ticketPromedio: z.number().optional().nullable(),
  empleados: z.string().max(120).optional(),
  webUrl: z.string().trim().max(2048).optional(),
  instagramHandle: z.string().max(2048).optional(),
  noWebDeclared: z.boolean().optional().default(false),
  noInstagramDeclared: z.boolean().optional().default(false),
  otrosCanales: z.string().max(4000).optional(),
  canales: z.array(z.string().max(120)).max(30).optional(),
  facturacion: z.number().optional().nullable(),
  clientesMensuales: z.number().int().optional().nullable(),
  inversionMarketing: z.number().optional().nullable(),
  objetivo: z.string().trim().min(1).max(500),
  objetivoCustom: z.string().max(500).optional(),
  magnitud: z.number().min(0).max(1000).optional().nullable(),
  plazoDias: z.number().int().min(1).max(3650),
  plazoLabel: z.string().trim().min(1).max(80),
}).superRefine((data, context) => {
  if (data.noWebDeclared && data.webUrl) context.addIssue({ code: z.ZodIssueCode.custom, path: ["webUrl"], message: "No se puede declarar que no hay página web y enviar una URL." });
  if (data.noInstagramDeclared && data.instagramHandle) context.addIssue({ code: z.ZodIssueCode.custom, path: ["instagramHandle"], message: "No se puede declarar que no hay Instagram y enviar un perfil." });
});

export type BusinessInput = z.infer<typeof businessInputSchema>;
