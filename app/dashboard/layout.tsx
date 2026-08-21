"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { getStoredBusinessId, isDemoMode } from "@/lib/session";
import { DEMO_BUSINESS } from "@/lib/demo-data";
import { normalizePlanTier, type PlanTier } from "@/lib/plans";
import { PageSkeleton } from "@/components/ui";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [businessName, setBusinessName] = useState("...");
  const [isDemo, setIsDemo] = useState(false);
  const [planTier, setPlanTier] = useState<PlanTier>("FREE");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const initialize = async () => {
      const session = await fetch("/api/auth/me", { cache: "no-store" });
      if (!session.ok) { router.replace("/login"); return; }
    const demo = isDemoMode();
    setIsDemo(demo);
    if (demo) {
      setBusinessName(DEMO_BUSINESS.nombre);
      setPlanTier("FREE");
      setReady(true);
      return;
    }
    const id = getStoredBusinessId();
    if (!id) {
      router.push("/onboarding");
      return;
    }
    await fetch(`/api/business?id=${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) router.push("/onboarding");
        else {
          setBusinessName(data.nombre);
          setPlanTier(normalizePlanTier(data.planTier));
        }
        if (!cancelled) setReady(true);
      })
      .catch(() => router.push("/login"));
    };
    initialize().catch(() => router.replace("/login"));
    return () => { cancelled = true; };
  }, [router]);

  if (!ready) {
    return <div className="app-main"><PageSkeleton /></div>;
  }

  return (
    <div className="app-shell">
      <Sidebar
        businessName={businessName}
        isDemo={isDemo}
        planTier={planTier}
      />
      <main className="app-main shp-scrollbar">
        {children}
      </main>
    </div>
  );
}
