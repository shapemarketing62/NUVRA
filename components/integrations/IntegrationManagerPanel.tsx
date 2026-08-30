"use client";
import { useCallback, useEffect, useState } from "react";
import { Btn, StatusBadge } from "@/components/ui";
import { COLORS } from "@/lib/design-tokens";

type Status = "connected" | "disconnected" | "requires_auth" | "expired" | "error" | "unavailable";
interface Item { provider: string; name: string; contribution: string; status: Status; lastSyncAt?: string | null; }
const statusText: Record<Status, string> = { connected: "Conectada", disconnected: "Desconectada", requires_auth: "Requiere autorización", expired: "Necesita reconexión", error: "Necesita atención", unavailable: "No disponible" };

export function IntegrationManagerPanel({ businessId }: { businessId?: string }) {
  const [items, setItems] = useState<Item[]>([]); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState<string>(); const [message, setMessage] = useState("");
  const load = useCallback(async () => { if (!businessId) return; setLoading(true); try { const response = await fetch(`/api/integrations?businessId=${encodeURIComponent(businessId)}`); const body = await response.json(); if (!response.ok) throw new Error(); setItems(body.integrations || []); } catch { setMessage("No pudimos cargar las conexiones en este momento."); } finally { setLoading(false); } }, [businessId]);
  useEffect(() => { void load(); }, [load]);
  async function act(item: Item) { if (!businessId) return; setBusy(item.provider); setMessage(""); try { const disconnect = item.status === "connected"; const response = await fetch("/api/integrations", { method: disconnect ? "DELETE" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ businessId, provider: item.provider }) }); const body = await response.json(); if (body.authorizationUrl) { window.location.href = body.authorizationUrl; return; } if (!response.ok) throw new Error(); await load(); } catch { setMessage("La conexión no pudo actualizarse. Revisá la autorización o intentá nuevamente."); } finally { setBusy(undefined); } }
  if (!businessId) return <p style={{ color: COLORS.inkSoft, fontSize: 14 }}>Seleccioná un negocio para administrar sus conexiones.</p>;
  return <div style={{ background: "#fff", borderRadius: 16, padding: 24, border: `1px solid ${COLORS.line}` }}>
    <div style={{ marginBottom: 22 }}><h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>Integraciones</h3><p style={{ color: COLORS.inkSoft, fontSize: 13, lineHeight: 1.6 }}>Conectá fuentes verificadas para darle mayor profundidad al diagnóstico. NUVRA solo utiliza la información que cada fuente entrega.</p></div>
    {message && <div style={{ padding: 12, borderRadius: 10, background: COLORS.amberSoft, color: COLORS.inkSoft, fontSize: 13, marginBottom: 16 }}>{message}</div>}
    {loading ? <div style={{ display: "grid", gap: 12 }}>{[1,2,3].map((key)=><div key={key} style={{ height: 94, borderRadius: 12, background: COLORS.paperDim }}/>)}</div> : <div style={{ display: "grid", gap: 12 }}>{items.map((item) => <div key={item.provider} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, padding: 18, border: `1px solid ${COLORS.line}`, borderRadius: 14 }}>
      <div style={{ minWidth: 0 }}><div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}><strong style={{ fontSize: 15 }}>{item.name}</strong><StatusBadge tone={item.status === "connected" ? "success" : item.status === "error" || item.status === "expired" ? "danger" : "neutral"}>{statusText[item.status]}</StatusBadge></div><p style={{ color: COLORS.inkSoft, fontSize: 13, marginTop: 7, lineHeight: 1.5 }}>{item.contribution}</p><div style={{ color: COLORS.inkFaint, fontSize: 12, marginTop: 6 }}>{item.lastSyncAt ? `Última sincronización: ${new Date(item.lastSyncAt).toLocaleDateString("es-AR")}` : item.status === "requires_auth" ? "Hace falta autorizar esta cuenta." : "Todavía no se sincronizó."}</div></div>
      <Btn variant={item.status === "connected" ? "ghost" : "primary"} disabled={busy === item.provider || item.status === "unavailable"} onClick={() => void act(item)}>{busy === item.provider ? "Procesando" : item.status === "connected" ? "Desconectar" : item.status === "expired" ? "Reconectar" : item.status === "unavailable" ? "No disponible" : "Conectar"}</Btn>
    </div>)}</div>}
  </div>;
}
