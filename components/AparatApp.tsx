"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/database.types";
import { initials } from "@/lib/format";
import NakupSection from "@/components/NakupSection";
import ProdejSection from "@/components/ProdejSection";
import DoplnkySection from "@/components/DoplnkySection";
import PrehledSection from "@/components/PrehledSection";

type Mode = "nakup" | "prodej" | "doplnky" | "prehled";

const MODE_POS: Record<Mode, number> = { nakup: 0, prodej: 1, doplnky: 2, prehled: 3 };

export default function AparatApp({ profile }: { profile: Profile }) {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<Mode>("nakup");
  const [preselectNakupId, setPreselectNakupId] = useState<number | null>(null);
  // Bumped whenever a mutation should force a cross-section refetch
  // (e.g. selling an item removes it from Nákup's dropdown).
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => setRefreshKey((k) => k + 1);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <div className="topbar">
        <div className="brand">
          <div className="brand-dot"></div>
          <div className="brand-name">
            <b>APARAT</b> / interní systém
          </div>
        </div>
        <div className="topbar-right">
          <div className="current-user-pill">
            <div className="avatar">{initials(profile.full_name)}</div>
            {profile.full_name}
          </div>
          <button className="btn-logout" onClick={handleLogout}>
            Odhlásit
          </button>
        </div>
      </div>

      <div className="lens-toggle-wrap">
        <div className="lens-toggle">
          <div className={`lens-slider pos-${MODE_POS[mode]}`}></div>
          <div className={`lens-option ${mode === "nakup" ? "active" : ""}`} onClick={() => setMode("nakup")}>
            Nákup
            <small>co jsme koupili</small>
          </div>
          <div className={`lens-option ${mode === "prodej" ? "active" : ""}`} onClick={() => setMode("prodej")}>
            Prodej
            <small>co a komu jsme prodali</small>
          </div>
          <div className={`lens-option ${mode === "doplnky" ? "active" : ""}`} onClick={() => setMode("doplnky")}>
            Doplňky
            <small>film, baterky, kabely...</small>
          </div>
          <div className={`lens-option ${mode === "prehled" ? "active" : ""}`} onClick={() => setMode("prehled")}>
            Přehled
            <small>zisky a ztráty</small>
          </div>
        </div>
      </div>

      <div className="wrap">
        {mode === "nakup" && (
          <NakupSection
            profile={profile}
            onGoToProdej={(nakupId) => {
              setPreselectNakupId(nakupId);
              setMode("prodej");
            }}
            refreshKey={refreshKey}
            onMutate={bump}
          />
        )}
        {mode === "prodej" && (
          <ProdejSection
            profile={profile}
            refreshKey={refreshKey}
            onMutate={bump}
            preselectNakupId={preselectNakupId}
            onPreselectConsumed={() => setPreselectNakupId(null)}
          />
        )}
        {mode === "doplnky" && <DoplnkySection profile={profile} refreshKey={refreshKey} onMutate={bump} />}
        {mode === "prehled" && <PrehledSection refreshKey={refreshKey} />}
      </div>
    </>
  );
}
