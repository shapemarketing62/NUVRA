import { URL } from "url";
import dns from "dns/promises";
import net from "net";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "metadata.google.internal",
  "169.254.169.254",
]);

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 0) return true;
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
    if (parts[0] === 192 && parts[1] === 0) return true;
    if (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) return true;
    if (parts[0] >= 224) return true;
  }
  const normalized = ip.toLowerCase();
  if (normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80")) return true;
  if (normalized.startsWith("::ffff:")) return isPrivateIp(normalized.slice(7));
  return false;
}

export class UrlValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UrlValidationError";
  }
}

export async function validateAndNormalizeUrl(input: string): Promise<string> {
  let raw = input.trim();
  if (!raw) throw new UrlValidationError("URL vacía");

  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^https?:/i.test(raw)) throw new UrlValidationError("Solo se permiten URLs http o https");
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new UrlValidationError("URL inválida");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new UrlValidationError("Solo se permiten URLs http o https");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (parsed.username || parsed.password) throw new UrlValidationError("No se permiten credenciales dentro de la URL");
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new UrlValidationError("URL no permitida");
  }

  if (net.isIP(hostname) && isPrivateIp(hostname)) {
    throw new UrlValidationError("No se permiten IPs privadas o locales");
  }

  try {
    // lookup usa el resolver del sistema (incluidos CNAME), igual que el navegador.
    // resolve4/resolve6 puede devolver ECONNREFUSED en algunos hosts aunque el dominio
    // resuelva correctamente mediante el sistema operativo.
    const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
    if (addresses.length === 0) throw new UrlValidationError("No se pudo verificar que el dominio sea público");
    for (const { address: ip } of addresses) {
      if (isPrivateIp(ip)) {
        throw new UrlValidationError("El dominio resuelve a una IP privada o local");
      }
    }
  } catch (e) {
    if (e instanceof UrlValidationError) throw e;
    throw new UrlValidationError("No se pudo verificar que el dominio sea público");
  }

  parsed.hash = "";
  const finalUrl = parsed.toString();
  return finalUrl;
}

export async function validateRedirectChain(urls: string[], maxRedirects = 5): Promise<void> {
  if (urls.length - 1 > maxRedirects) throw new UrlValidationError("Demasiadas redirecciones");
  for (const url of urls) await validateAndNormalizeUrl(url);
}

export function isSameOrigin(base: string, target: string): boolean {
  try {
    const a = new URL(base);
    const b = new URL(target);
    return a.hostname.replace(/^www\./, "") === b.hostname.replace(/^www\./, "");
  } catch {
    return false;
  }
}

export const IMPORTANT_PATH_KEYWORDS = [
  "about",
  "nosotros",
  "quienes",
  "productos",
  "products",
  "servicios",
  "services",
  "precios",
  "pricing",
  "contacto",
  "contact",
  "reserv",
  "book",
  "shop",
  "tienda",
];
