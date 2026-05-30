import { useState, useEffect, useCallback } from "react";

const API = "https://friseur-server.onrender.com";

// BUG FIX: WebSocket nutzt jetzt die richtige IP statt localhost
function useWebSocket(onUpdate) {
  useEffect(() => {
    const ws = new WebSocket(`wss://friseur-server.onrender.com`);
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.typ === "update") onUpdate();
    };
    ws.onerror = () => {};
    return () => ws.close();
  }, []); // eslint-disable-line
}

function getMondayOfWeek(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

export default function AdminSeite({ benutzer, onLogout }) {
  const [termine, setTermine] = useState([]);
  const [benutzerListe, setBenutzerListe] = useState([]);
  const [meldung, setMeldung] = useState({ text: "", typ: "" });
  const [tab, setTab] = useState("kalender");
  const [liveIndikator, setLiveIndikator] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Kalender
  const [kalWoche, setKalWoche] = useState(getMondayOfWeek(new Date()));
  const [gewählterTag, setGewählterTag] = useState(null);

  // Erstellen
  const [eDatum, setEDatum] = useState("");
  const [eUhrzeit, setEUhrzeit] = useState("");
  const [batchAktiv, setBatchAktiv] = useState(false);
  const [bVon, setBVon] = useState("");
  const [bBis, setBBis] = useState("");
  const [bVonUhr, setBVonUhr] = useState("08:00");
  const [bBisUhr, setBBisUhr] = useState("20:00");
  const [bIntervall, setBIntervall] = useState("30");
  const [bIntervallModus, setBIntervallModus] = useState("auswahl");

  // Aktionen
  const [bearbeitenId, setBearbeitenId] = useState(null);
  const [bearbeitenDatum, setBearbeitenDatum] = useState("");
  const [bearbeitenUhr, setBearbeitenUhr] = useState("");
  const [bearbeitenNotiz, setBearbeitenNotiz] = useState("");
  const [absageId, setAbsageId] = useState(null);
  const [absageGrund, setAbsageGrund] = useState("");
  const [ablehnId, setAblehnId] = useState(null);
  const [ablehnGrund, setAblehnGrund] = useState("");
  const [bestätigenId, setBestätigenId] = useState(null);
  const [bestätigenNotiz, setBestätigenNotiz] = useState("");

  // Mehrfachauswahl
  const [auswahlModus, setAuswahlModus] = useState(false);
  const [ausgewählt, setAusgewählt] = useState(new Set());

  // Passwort
  const [resetBenutzer, setResetBenutzer] = useState("");
  const [resetPasswort, setResetPasswort] = useState("");

  useEffect(() => {
    setTimeout(() => setMounted(true), 50);
  }, []);

  const ladeTermine = useCallback(async () => {
    const res = await fetch(`${API}/admin/termine`);
    setTermine(await res.json());
  }, []);

  useWebSocket(() => {
    setLiveIndikator(true);
    ladeTermine();
    setTimeout(() => setLiveIndikator(false), 2000);
  });

  useEffect(() => { ladeTermine(); }, [ladeTermine]);
  useEffect(() => {
    fetch(`${API}/admin/benutzer`).then(r => r.json()).then(setBenutzerListe);
  }, []);

  // Automatisches Löschen alter Termine beim Laden
  useEffect(() => {
    fetch(`${API}/admin/termine/alt/alle`, { method: "DELETE" })
      .then(r => r.json())
      .then(d => {
        if (d.deleted > 0) {
          zeig(`${d.deleted} abgelaufene Termine automatisch gelöscht`, "ok");
          ladeTermine();
        }
      })
      .catch(() => {});
  }, []); // eslint-disable-line

  function zeig(text, typ = "ok") {
    setMeldung({ text, typ });
    setTimeout(() => setMeldung({ text: "", typ: "" }), 3500);
  }

  async function terminErstellen() {
    if (!eDatum || !eUhrzeit) return zeig("Datum und Uhrzeit eingeben", "fehler");
    const res = await fetch(`${API}/admin/termine`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zeitdatum: `${eDatum} ${eUhrzeit}` })
    });
    const d = await res.json();
    zeig(d.error || d.message, d.error ? "fehler" : "ok");
    if (!d.error) { setEDatum(""); setEUhrzeit(""); }
    ladeTermine();
  }

  async function batchErstellen() {
    if (!bVon || !bBis) return zeig("Von- und Bis-Datum eingeben", "fehler");
    const intervallNum = Number(bIntervall);
    if (!intervallNum || intervallNum < 5 || intervallNum > 480)
      return zeig("Intervall muss zwischen 5 und 480 Minuten liegen", "fehler");
    const res = await fetch(`${API}/admin/termine/batch`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vonDatum: bVon, bisDatum: bBis, vonUhr: bVonUhr, bisUhr: bBisUhr, intervall: intervallNum })
    });
    const d = await res.json();
    zeig(d.error || d.message, d.error ? "fehler" : "ok");
    ladeTermine();
  }

  async function terminBearbeiten(id) {
    if (!bearbeitenDatum || !bearbeitenUhr) return zeig("Datum und Uhrzeit eingeben", "fehler");
    const res = await fetch(`${API}/admin/termine/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zeitdatum: `${bearbeitenDatum} ${bearbeitenUhr}`, notiz: bearbeitenNotiz })
    });
    const d = await res.json();
    zeig(d.error || d.message, d.error ? "fehler" : "ok");
    setBearbeitenId(null);
    ladeTermine();
  }

  function bearbeitenStarten(t) {
    const dt = new Date(t.zeitdatum);
    setBearbeitenId(t.termin_id);
    setBearbeitenDatum(dt.toISOString().slice(0, 10));
    setBearbeitenUhr(dt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }));
    setBearbeitenNotiz(t.notiz || "");
  }

  async function anfrageBestaetigen(id) {
    const res = await fetch(`${API}/admin/termine/${id}/bestaetigen`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notiz: bestätigenNotiz || undefined })
    });
    const d = await res.json();
    zeig(d.error || d.message, d.error ? "fehler" : "ok");
    setBestätigenId(null);
    setBestätigenNotiz("");
    ladeTermine();
  }

  async function anfrageAblehnen(id) {
    const res = await fetch(`${API}/admin/termine/${id}/ablehnen`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ absage_grund: ablehnGrund || undefined })
    });
    const d = await res.json();
    zeig(d.error || d.message, d.error ? "fehler" : "ok");
    setAblehnId(null);
    setAblehnGrund("");
    ladeTermine();
  }

  async function terminAbsagen(id) {
    const res = await fetch(`${API}/admin/termine/${id}/absagen`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ absage_grund: absageGrund || undefined })
    });
    const d = await res.json();
    zeig(d.error || d.message, d.error ? "fehler" : "ok");
    setAbsageId(null);
    setAbsageGrund("");
    ladeTermine();
  }

  async function terminLoeschen(id) {
    if (!window.confirm("Termin wirklich löschen? Falls ein Kunde diesen Termin hat, wird er benachrichtigt.")) return;
    const res = await fetch(`${API}/admin/termine/${id}`, { method: "DELETE" });
    const d = await res.json();
    zeig(d.error || d.message, d.error ? "fehler" : "ok");
    ladeTermine();
  }

  // Mehrere Termine auf einmal löschen
  async function ausgewählteLoeschen() {
    if (ausgewählt.size === 0) return;
    if (!window.confirm(`${ausgewählt.size} Termin${ausgewählt.size > 1 ? "e" : ""} wirklich löschen? Kunden mit gebuchten Terminen werden benachrichtigt.`)) return;
    const ids = Array.from(ausgewählt);
    let gelöscht = 0;
    for (const id of ids) {
      const res = await fetch(`${API}/admin/termine/${id}`, { method: "DELETE" });
      if (res.ok) gelöscht++;
    }
    zeig(`${gelöscht} Termin${gelöscht > 1 ? "e" : ""} gelöscht`, "ok");
    setAusgewählt(new Set());
    setAuswahlModus(false);
    ladeTermine();
  }

  function toggleAuswahl(id) {
    setAusgewählt(prev => {
      const neu = new Set(prev);
      if (neu.has(id)) neu.delete(id);
      else neu.add(id);
      return neu;
    });
  }

  function alleTagTermineAuswählen(tagTermine) {
    const alleIds = tagTermine.map(t => t.termin_id);
    const alleGewählt = alleIds.every(id => ausgewählt.has(id));
    setAusgewählt(prev => {
      const neu = new Set(prev);
      if (alleGewählt) {
        alleIds.forEach(id => neu.delete(id));
      } else {
        alleIds.forEach(id => neu.add(id));
      }
      return neu;
    });
  }

  function fmt(dt) {
    const d = new Date(dt);
    return {
      zeit: d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
      full: d
    };
  }

  const wochentage = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(kalWoche);
    d.setDate(d.getDate() + i);
    return d;
  });

  function termineAmTag(tag) {
    return termine.filter(t => {
      const d = new Date(t.zeitdatum);
      return d.toDateString() === tag.toDateString();
    }).sort((a, b) => new Date(a.zeitdatum) - new Date(b.zeitdatum));
  }

  const tagTermine = gewählterTag ? termineAmTag(gewählterTag) : [];
  const offeneAnfragen = termine.filter(t => t.status === "angefragt");

  const stats = {
    anfragen: offeneAnfragen.length,
    gebucht: termine.filter(t => t.status === "gebucht").length,
    offen: termine.filter(t => t.status === "offen").length,
    abgesagt: termine.filter(t => t.status === "abgesagt" || t.status === "abgelehnt").length,
  };

  const heute = new Date();
  heute.setHours(0, 0, 0, 0);

  function closeAllOverlays() {
    setBearbeitenId(null);
    setAbsageId(null);
    setAblehnId(null);
    setBestätigenId(null);
  }

  function renderTerminKarte(t) {
    const { zeit } = fmt(t.zeitdatum);
    const istBearbeiten = bearbeitenId === t.termin_id;
    const istAbsagen = absageId === t.termin_id;
    const istAblehnen = ablehnId === t.termin_id;
    const istBestätigen = bestätigenId === t.termin_id;
    const aktiv = istBearbeiten || istAbsagen || istAblehnen || istBestätigen;
    const istAusgewählt = ausgewählt.has(t.termin_id);

    const statusColors = {
      offen: { bg: "#fafaf8", border: "#ede8e0", badge: "rgba(160,136,122,0.1)", badgeText: "#a0887a" },
      angefragt: { bg: "#fffbeb", border: "#fcd34d", badge: "rgba(245,158,11,0.12)", badgeText: "#92400e" },
      gebucht: { bg: "#f0faf4", border: "#86efac", badge: "rgba(74,222,128,0.12)", badgeText: "#166534" },
      // BUG FIX: abgesagt und abgelehnt haben eigene Farben
      abgesagt: { bg: "#fff7ed", border: "#fdba74", badge: "rgba(251,146,60,0.12)", badgeText: "#c2410c" },
      abgelehnt: { bg: "#fef2f2", border: "#fca5a5", badge: "rgba(239,68,68,0.1)", badgeText: "#b91c1c" },
    };
    const statusLabels = {
      offen: "Offen",
      angefragt: "⏳ Anfrage",
      gebucht: "✓ Gebucht",
      abgesagt: "✕ Abgesagt",
      abgelehnt: "✕ Abgelehnt",
    };

    const sc = statusColors[t.status] || statusColors.offen;

    // BUG FIX: Abgesagte/Abgelehnte Termine können nicht bearbeitet werden (nur gelöscht)
    const kannBearbeiten = t.status !== "abgesagt" && t.status !== "abgelehnt";

    return (
      <div key={t.termin_id} style={{
        ...a.terminCard,
        background: istAusgewählt ? "rgba(44,24,16,0.04)" : sc.bg,
        borderColor: istAusgewählt ? "#2c1810" : sc.border,
        outline: istAusgewählt ? "2px solid rgba(44,24,16,0.15)" : "none",
      }}>
        {/* Card head */}
        <div style={a.terminHead}>
          {auswahlModus && (
            <div
              style={{
                ...a.checkbox,
                background: istAusgewählt ? "#2c1810" : "white",
                borderColor: istAusgewählt ? "#2c1810" : "#d4c5b5",
              }}
              onClick={() => toggleAuswahl(t.termin_id)}
            >
              {istAusgewählt && <span style={{ color: "white", fontSize: "11px", fontWeight: "700" }}>✓</span>}
            </div>
          )}
          <div style={a.terminTime}>{zeit}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {t.vorname
              ? <div style={a.terminName}>{t.vorname} {t.nachname}</div>
              : <div style={a.terminNameEmpty}>— Kein Kunde —</div>
            }
            {t.notiz && <div style={a.terminNotiz}>💬 {t.notiz}</div>}
            {(t.status === "abgesagt" || t.status === "abgelehnt") && t.absage_grund && (
              <div style={{ ...a.terminAbsageGrund, color: t.status === "abgelehnt" ? "#b91c1c" : "#c2410c" }}>
                Grund: „{t.absage_grund}"
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
            <span style={{ ...a.statusBadge, background: sc.badge, color: sc.badgeText }}>
              {statusLabels[t.status] || t.status}
            </span>
            {!auswahlModus && (
              <div style={{ display: "flex", gap: "4px" }}>
                {kannBearbeiten && (
                  <button style={a.iconBtn} onClick={() => { closeAllOverlays(); if (!aktiv) bearbeitenStarten(t); }} title="Bearbeiten">
                    {istBearbeiten ? "✕" : "✎"}
                  </button>
                )}
                <button style={a.iconBtnDanger} onClick={() => terminLoeschen(t.termin_id)} title="Löschen">🗑</button>
              </div>
            )}
          </div>
        </div>

        {/* Action bar – nur wenn nicht im Auswahlmodus */}
        {!aktiv && !auswahlModus && (
          <div style={a.actionBar}>
            {t.status === "angefragt" && (
              <>
                <button style={a.confirmBtn} onClick={() => { closeAllOverlays(); setBestätigenId(t.termin_id); }}>
                  ✓ Bestätigen
                </button>
                <button style={a.declineBtn} onClick={() => { closeAllOverlays(); setAblehnId(t.termin_id); }}>
                  ✕ Ablehnen
                </button>
              </>
            )}
            {t.status === "gebucht" && (
              <button style={a.cancelBtn} onClick={() => { closeAllOverlays(); setAbsageId(t.termin_id); }}>
                Termin absagen
              </button>
            )}
            {t.status === "offen" && (
              <span style={a.waitingText}>Warte auf Anfrage</span>
            )}
            {t.status === "abgesagt" && (
              <span style={{ ...a.waitingText, color: "#c2410c" }}>
                Abgesagt{t.absage_grund ? "" : " – kein Grund angegeben"}
              </span>
            )}
            {t.status === "abgelehnt" && (
              <span style={{ ...a.waitingText, color: "#b91c1c" }}>Abgelehnt</span>
            )}
          </div>
        )}

        {/* Inline: Bestätigen */}
        {istBestätigen && (
          <div style={a.inlineForm}>
            <p style={a.inlineTitle} data-type="ok">✓ {t.vorname} {t.nachname} bestätigen</p>
            <div style={a.formGroup}>
              <label style={a.formLabel}>Nachricht an Kunden (optional)</label>
              <input type="text" style={a.formInput} placeholder="z.B. Bitte pünktlich erscheinen"
                value={bestätigenNotiz} onChange={e => setBestätigenNotiz(e.target.value)} />
            </div>
            <div style={a.inlineBtns}>
              <button style={a.confirmBtnSolid} onClick={() => anfrageBestaetigen(t.termin_id)}>Bestätigen</button>
              <button style={a.ghostBtn} onClick={() => setBestätigenId(null)}>Abbrechen</button>
            </div>
          </div>
        )}

        {/* Inline: Ablehnen */}
        {istAblehnen && (
          <div style={a.inlineForm}>
            <p style={a.inlineTitle} data-type="danger">✕ Anfrage von {t.vorname} {t.nachname} ablehnen</p>
            <div style={a.formGroup}>
              <label style={a.formLabel}>Grund (optional – für den Kunden sichtbar)</label>
              <input type="text" style={a.formInput} placeholder="z.B. Termin bereits vergeben"
                value={ablehnGrund} onChange={e => setAblehnGrund(e.target.value)} />
            </div>
            <div style={a.inlineBtns}>
              <button style={a.dangerBtnSolid} onClick={() => anfrageAblehnen(t.termin_id)}>Ablehnen</button>
              <button style={a.ghostBtn} onClick={() => setAblehnId(null)}>Abbrechen</button>
            </div>
          </div>
        )}

        {/* Inline: Absagen */}
        {istAbsagen && (
          <div style={a.inlineForm}>
            <p style={a.inlineTitle} data-type="danger">Termin von {t.vorname} {t.nachname} absagen</p>
            <p style={{ margin: "0 0 8px", fontSize: "12px", color: "#a0887a" }}>
              Der Kunde wird benachrichtigt und kann einen neuen Termin anfragen.
            </p>
            <div style={a.formGroup}>
              <label style={a.formLabel}>Grund (optional – wird dem Kunden angezeigt)</label>
              <input type="text" style={a.formInput} placeholder="z.B. Erkrankung, Betriebsausflug …"
                value={absageGrund} onChange={e => setAbsageGrund(e.target.value)} />
            </div>
            <div style={a.inlineBtns}>
              <button style={a.dangerBtnSolid} onClick={() => terminAbsagen(t.termin_id)}>Absagen bestätigen</button>
              <button style={a.ghostBtn} onClick={() => setAbsageId(null)}>Abbrechen</button>
            </div>
          </div>
        )}

        {/* Inline: Bearbeiten */}
        {istBearbeiten && (
          <div style={a.inlineForm}>
            <p style={a.inlineTitle}>Termin bearbeiten</p>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <div style={a.formGroup}>
                <label style={a.formLabel}>Datum</label>
                <input type="date" style={a.formInput} value={bearbeitenDatum} onChange={e => setBearbeitenDatum(e.target.value)} />
              </div>
              <div style={a.formGroup}>
                <label style={a.formLabel}>Uhrzeit</label>
                <input type="time" style={a.formInput} value={bearbeitenUhr} onChange={e => setBearbeitenUhr(e.target.value)} />
              </div>
            </div>
            <div style={a.formGroup}>
              <label style={a.formLabel}>Notiz für Kunden</label>
              <input type="text" style={a.formInput} placeholder="z.B. Bitte pünktlich erscheinen"
                value={bearbeitenNotiz} onChange={e => setBearbeitenNotiz(e.target.value)} />
            </div>
            <div style={a.inlineBtns}>
              <button style={a.primaryBtnSolid} onClick={() => terminBearbeiten(t.termin_id)}>Speichern</button>
              <button style={a.ghostBtn} onClick={() => setBearbeitenId(null)}>Abbrechen</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const tabs = [
    { id: "kalender", label: "Kalender", badge: offeneAnfragen.length > 0 ? offeneAnfragen.length : null },
    { id: "erstellen", label: "Erstellen", badge: null },
    { id: "passwort", label: "Passwort", badge: null },
  ];

  return (
    <div style={a.page}>
      <div style={a.bgTop} />

      <div style={{ ...a.container, opacity: mounted ? 1 : 0, transform: mounted ? "none" : "translateY(16px)", transition: "all 0.5s ease" }}>

        {/* Header */}
        <header style={a.header}>
          <div style={a.headerLeft}>
            <div style={a.logo}>✂</div>
            <div>
              <h1 style={a.salonName}>Atelier <span style={a.adminBadge}>Admin</span></h1>
              <div style={a.liveRow}>
                <span style={{ ...a.liveDot, background: liveIndikator ? "#4ade80" : "rgba(92,61,46,0.2)" }} />
                <span style={a.liveTxt}>{liveIndikator ? "Aktualisiert" : "Live"}</span>
              </div>
            </div>
          </div>
          <button style={a.logoutBtn} onClick={() => { sessionStorage.removeItem("salon_benutzer"); onLogout(); }}>
            Abmelden
          </button>
        </header>

        {/* Stats */}
        <div style={a.statsGrid}>
          {[
            { label: "Anfragen", value: stats.anfragen, icon: "⏳", highlight: stats.anfragen > 0 },
            { label: "Gebucht", value: stats.gebucht, icon: "✓" },
            { label: "Offen", value: stats.offen, icon: "○" },
            { label: "Abgesagt", value: stats.abgesagt, icon: "✕" },
          ].map(({ label, value, icon, highlight }) => (
            <div key={label} style={{ ...a.statCard, ...(highlight ? a.statCardHighlight : {}) }}>
              <span style={a.statIcon}>{icon}</span>
              <span style={{ ...a.statValue, color: highlight ? "#92400e" : (label === "Gebucht" ? "#166534" : label === "Abgesagt" ? "#b91c1c" : "#2c1810") }}>
                {value}
              </span>
              <span style={a.statLabel}>{label}</span>
            </div>
          ))}
        </div>

        {/* Pending requests banner */}
        {offeneAnfragen.length > 0 && (
          <div style={a.pendingBanner} onClick={() => setTab("kalender")}>
            <span style={{ fontSize: "18px" }}>⏳</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={a.bannerTitle}>
                {offeneAnfragen.length} Anfrage{offeneAnfragen.length > 1 ? "n" : ""} warte{offeneAnfragen.length === 1 ? "t" : "n"}
              </p>
              <p style={a.bannerSub}>
                {offeneAnfragen.slice(0, 2).map(t => `${new Date(t.zeitdatum).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "short" })} – ${t.vorname}`).join(" · ")}
                {offeneAnfragen.length > 2 && ` · +${offeneAnfragen.length - 2}`}
              </p>
            </div>
            <span style={a.bannerArrow}>→</span>
          </div>
        )}

        {/* Toast */}
        {meldung.text && (
          <div style={{
            ...a.toast,
            background: meldung.typ === "ok" ? "rgba(16,124,65,0.08)" : "rgba(185,28,28,0.07)",
            color: meldung.typ === "ok" ? "#107c41" : "#b91c1c",
            borderColor: meldung.typ === "ok" ? "rgba(16,124,65,0.2)" : "rgba(185,28,28,0.2)",
          }}>
            {meldung.typ === "ok" ? "✓" : "⚠"} {meldung.text}
          </div>
        )}

        {/* Tabs */}
        <div style={a.tabBar}>
          {tabs.map(({ id, label, badge }) => (
            <button key={id} style={{ ...a.tabBtn, ...(tab === id ? a.tabBtnActive : {}) }} onClick={() => setTab(id)}>
              {label}
              {badge && <span style={a.tabBadge}>{badge}</span>}
            </button>
          ))}
        </div>

        {/* ─── TAB: KALENDER ─── */}
        {tab === "kalender" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={a.card}>
              {/* Week nav */}
              <div style={a.calNav}>
                <button style={a.navBtn} onClick={() => { const d = new Date(kalWoche); d.setDate(d.getDate() - 7); setKalWoche(d); setGewählterTag(null); }}>←</button>
                <span style={a.calTitle}>
                  {kalWoche.toLocaleDateString("de-DE", { day: "2-digit", month: "short" })} – {wochentage[6].toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "2-digit" })}
                </span>
                <button style={a.navBtn} onClick={() => { const d = new Date(kalWoche); d.setDate(d.getDate() + 7); setKalWoche(d); setGewählterTag(null); }}>→</button>
              </div>

              {/* Week grid */}
              <div style={a.weekScroll}>
                <div style={a.weekGrid}>
                  {wochentage.map((tag, i) => {
                    const tagT = termineAmTag(tag);
                    const hatAnfrage = tagT.some(t => t.status === "angefragt");
                    const istHeute = tag.toDateString() === new Date().toDateString();
                    const istGewählt = gewählterTag && tag.toDateString() === gewählterTag.toDateString();
                    const istVergangen = tag < heute;
                    return (
                      <div
                        key={i}
                        style={{
                          ...a.dayCell,
                          ...(istHeute && !istGewählt ? a.dayCellToday : {}),
                          ...(istGewählt ? a.dayCellSelected : {}),
                          opacity: istVergangen ? 0.45 : 1,
                          cursor: "pointer",
                        }}
                        onClick={() => setGewählterTag(istGewählt ? null : tag)}
                      >
                        <span style={{ fontSize: "9px", color: istGewählt ? "rgba(255,255,255,0.6)" : "#a0887a", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: "600" }}>
                          {tag.toLocaleDateString("de-DE", { weekday: "short" })}
                        </span>
                        <span style={{ fontSize: "20px", fontWeight: "700", color: istGewählt ? "white" : "#2c1810", lineHeight: 1.2 }}>
                          {tag.getDate()}
                        </span>
                        <span style={{ fontSize: "9px", color: istGewählt ? "rgba(255,255,255,0.5)" : "#c0a898" }}>
                          {tag.toLocaleDateString("de-DE", { month: "short" })}
                        </span>
                        {tagT.length > 0 && (
                          <div style={{ marginTop: "5px", display: "flex", flexDirection: "column", gap: "2px", width: "100%" }}>
                            {tagT.slice(0, 3).map(t => (
                              <div key={t.termin_id} style={{
                                height: "3px", borderRadius: "2px",
                                background: t.status === "gebucht" ? "#22c55e"
                                  : t.status === "angefragt" ? "#f59e0b"
                                  : t.status === "abgesagt" ? "#fb923c"
                                  : t.status === "abgelehnt" ? "#ef4444"
                                  : "rgba(160,136,122,0.3)"
                              }} />
                            ))}
                            {tagT.length > 3 && <span style={{ fontSize: "8px", color: istGewählt ? "rgba(255,255,255,0.5)" : "#c0a898" }}>+{tagT.length - 3}</span>}
                          </div>
                        )}
                        {hatAnfrage && !istGewählt && (
                          <div style={{ position: "absolute", top: "5px", right: "5px", width: "6px", height: "6px", borderRadius: "50%", background: "#f59e0b" }} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Legend */}
              <div style={a.legend}>
                {[["#22c55e", "Gebucht"], ["#f59e0b", "Anfrage"], ["rgba(160,136,122,0.3)", "Offen"], ["#fb923c", "Abgesagt"], ["#ef4444", "Abgelehnt"]].map(([c, l]) => (
                  <div key={l} style={a.legendItem}>
                    <div style={{ width: "10px", height: "3px", borderRadius: "2px", background: c }} />
                    <span>{l}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Day detail */}
            {gewählterTag && (
              <div style={{ ...a.card, animation: "slideDown 0.2s ease" }}>
                <div style={a.dayDetailHeader}>
                  <h3 style={a.dayDetailTitle}>
                    {gewählterTag.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long" })}
                  </h3>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                    {tagTermine.some(t => t.status === "angefragt") && (
                      <span style={a.anfrageBadge}>
                        {tagTermine.filter(t => t.status === "angefragt").length} Anfrage{tagTermine.filter(t => t.status === "angefragt").length > 1 ? "n" : ""}
                      </span>
                    )}
                    <span style={{ fontSize: "12px", color: "#c0a898" }}>{tagTermine.length} gesamt</span>

                    {tagTermine.length > 0 && (
                      <button
                        style={auswahlModus ? a.auswahlBtnActive : a.auswahlBtn}
                        onClick={() => {
                          setAuswahlModus(!auswahlModus);
                          setAusgewählt(new Set());
                          closeAllOverlays();
                        }}
                      >
                        {auswahlModus ? "✕ Abbrechen" : "☑ Auswählen"}
                      </button>
                    )}
                  </div>
                </div>

                {/* Auswahl-Toolbar */}
                {auswahlModus && tagTermine.length > 0 && (
                  <div style={a.auswahlToolbar}>
                    <button
                      style={a.auswahlAlleBtn}
                      onClick={() => alleTagTermineAuswählen(tagTermine)}
                    >
                      {tagTermine.every(t => ausgewählt.has(t.termin_id)) ? "Alle abwählen" : "Alle auswählen"}
                    </button>
                    <span style={{ fontSize: "12px", color: "#a0887a" }}>
                      {ausgewählt.size} ausgewählt
                    </span>
                    {ausgewählt.size > 0 && (
                      <button style={a.auswahlLoeschenBtn} onClick={ausgewählteLoeschen}>
                        🗑 {ausgewählt.size} löschen
                      </button>
                    )}
                  </div>
                )}

                {tagTermine.length === 0 ? (
                  <p style={{ color: "#d4c5b5", textAlign: "center", padding: "24px 0", fontSize: "13px", margin: 0 }}>
                    Keine Termine an diesem Tag
                  </p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {tagTermine.map(t => renderTerminKarte(t))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ─── TAB: ERSTELLEN ─── */}
        {tab === "erstellen" && (
          <div style={a.card}>
            <div style={a.toggleRow}>
              <button style={!batchAktiv ? a.toggleActive : a.toggleBtn} onClick={() => setBatchAktiv(false)}>
                Einzelner Termin
              </button>
              <button style={batchAktiv ? a.toggleActive : a.toggleBtn} onClick={() => setBatchAktiv(true)}>
                Wochenplan
              </button>
            </div>

            {!batchAktiv ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={a.formRow}>
                  <div style={a.formGroup}>
                    <label style={a.formLabel}>Datum</label>
                    <input type="date" style={a.formInput} value={eDatum} onChange={e => setEDatum(e.target.value)} />
                  </div>
                  <div style={a.formGroup}>
                    <label style={a.formLabel}>Uhrzeit</label>
                    <input type="time" style={a.formInput} value={eUhrzeit} onChange={e => setEUhrzeit(e.target.value)} />
                  </div>
                </div>
                <button style={a.primaryBtnSolid} onClick={terminErstellen}>Termin erstellen</button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={a.formRow}>
                  <div style={a.formGroup}>
                    <label style={a.formLabel}>Von Datum</label>
                    <input type="date" style={a.formInput} value={bVon} onChange={e => setBVon(e.target.value)} />
                  </div>
                  <div style={a.formGroup}>
                    <label style={a.formLabel}>Bis Datum</label>
                    <input type="date" style={a.formInput} value={bBis} onChange={e => setBBis(e.target.value)} />
                  </div>
                </div>
                <div style={a.formRow}>
                  <div style={a.formGroup}>
                    <label style={a.formLabel}>Ab Uhr</label>
                    <input type="time" style={a.formInput} value={bVonUhr} onChange={e => setBVonUhr(e.target.value)} />
                  </div>
                  <div style={a.formGroup}>
                    <label style={a.formLabel}>Bis Uhr</label>
                    <input type="time" style={a.formInput} value={bBisUhr} onChange={e => setBBisUhr(e.target.value)} />
                  </div>
                </div>
                <div style={a.formGroup}>
                  <label style={a.formLabel}>Intervall (Minuten)</label>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "6px" }}>
                    <button style={bIntervallModus === "auswahl" ? a.toggleActive : a.toggleBtn} onClick={() => setBIntervallModus("auswahl")}>Liste</button>
                    <button style={bIntervallModus === "manuell" ? a.toggleActive : a.toggleBtn} onClick={() => setBIntervallModus("manuell")}>Manuell</button>
                  </div>
                  {bIntervallModus === "auswahl" ? (
                    <select style={a.formInput} value={bIntervall} onChange={e => setBIntervall(e.target.value)}>
                      {["10","15","20","25","30","45","60","90","120"].map(v => <option key={v} value={v}>{v} min</option>)}
                    </select>
                  ) : (
                    <input type="number" style={a.formInput} placeholder="z.B. 35" min="5" max="480" value={bIntervall} onChange={e => setBIntervall(e.target.value)} />
                  )}
                </div>
                <div style={a.previewBox}>
                  <strong style={{ color: "#8b6347" }}>Vorschau: </strong>
                  {bVon && bBis && bVonUhr && bBisUhr && Number(bIntervall) > 0
                    ? `Mo–Fr von ${bVon} bis ${bBis}, ${bVonUhr}–${bBisUhr} Uhr, alle ${bIntervall} Min.`
                    : "Felder ausfüllen für Vorschau"}
                  <br /><span style={{ color: "#c0a898" }}>Samstag & Sonntag werden übersprungen.</span>
                </div>
                <button style={a.primaryBtnSolid} onClick={batchErstellen}>Wochenplan erstellen</button>
              </div>
            )}
          </div>
        )}

        {/* ─── TAB: PASSWORT ─── */}
        {tab === "passwort" && (
          <div style={a.card}>
            <p style={{ fontSize: "13px", color: "#a0887a", margin: "0 0 18px", lineHeight: 1.7 }}>
              Wenn ein Kunde sein Passwort vergessen hat, kannst du hier ein neues setzen.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={a.formGroup}>
                <label style={a.formLabel}>Benutzer auswählen</label>
                <select style={a.formInput} value={resetBenutzer} onChange={e => setResetBenutzer(e.target.value)}>
                  <option value="">— Bitte wählen —</option>
                  {benutzerListe.filter(b => b.typ === "kunde").map(b => (
                    <option key={b.benutzer_id} value={b.benutzer_id}>{b.vorname} {b.nachname}</option>
                  ))}
                </select>
              </div>
              <div style={a.formGroup}>
                <label style={a.formLabel}>Neues Passwort</label>
                <input style={a.formInput} type="text" placeholder="Mindestens 4 Zeichen" value={resetPasswort} onChange={e => setResetPasswort(e.target.value)} />
              </div>
              <button style={a.primaryBtnSolid} onClick={async () => {
                if (!resetBenutzer) return zeig("Benutzer auswählen", "fehler");
                if (!resetPasswort || resetPasswort.length < 4) return zeig("Passwort mindestens 4 Zeichen", "fehler");
                const res = await fetch(`${API}/admin/passwort-reset/${resetBenutzer}`, {
                  method: "PUT", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ neuesPasswort: resetPasswort })
                });
                const d = await res.json();
                zeig(d.error || d.message, d.error ? "fehler" : "ok");
                if (!d.error) { setResetBenutzer(""); setResetPasswort(""); }
              }}>Passwort setzen</button>
            </div>
          </div>
        )}

      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=DM+Sans:wght@300;400;500&display=swap');
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        * { -webkit-tap-highlight-color: transparent; }
      `}</style>
    </div>
  );
}

const a = {
  page: {
    minHeight: "100vh", background: "#f7f4f0",
    fontFamily: "'DM Sans', sans-serif",
    padding: "0 0 3rem",
    position: "relative", overflowX: "hidden",
  },
  bgTop: {
    position: "fixed", top: 0, left: 0, right: 0, height: "180px",
    background: "linear-gradient(to bottom, rgba(92,61,46,0.05) 0%, transparent 100%)",
    pointerEvents: "none",
  },
  container: {
    maxWidth: "900px", margin: "0 auto",
    padding: "0 14px",
    display: "flex", flexDirection: "column", gap: "12px",
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "18px 0 8px",
    flexWrap: "wrap", gap: "8px",
  },
  headerLeft: { display: "flex", alignItems: "center", gap: "12px" },
  logo: {
    width: "40px", height: "40px", flexShrink: 0,
    background: "linear-gradient(135deg, #2c1810 0%, #5c3d2e 100%)",
    borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: "18px", color: "#e8d5be",
    boxShadow: "0 4px 12px rgba(44,24,16,0.2)",
  },
  salonName: {
    margin: "0 0 2px", fontSize: "17px", fontWeight: "600",
    fontFamily: "'Cormorant Garamond', serif",
    color: "#2c1810", letterSpacing: "0.04em",
    display: "flex", alignItems: "center", gap: "8px",
  },
  adminBadge: {
    fontSize: "10px", fontWeight: "600",
    padding: "2px 8px", borderRadius: "20px",
    background: "rgba(92,61,46,0.1)", color: "#8b6347",
    letterSpacing: "0.06em", textTransform: "uppercase",
    fontFamily: "'DM Sans', sans-serif",
  },
  liveRow: { display: "flex", alignItems: "center", gap: "5px" },
  liveDot: { width: "6px", height: "6px", borderRadius: "50%", display: "inline-block", transition: "background 0.4s" },
  liveTxt: { fontSize: "10px", color: "#c0a898" },
  logoutBtn: {
    padding: "7px 14px", border: "1px solid #e8e0d8", borderRadius: "8px",
    background: "white", cursor: "pointer", fontSize: "12px", color: "#8b6347",
    fontFamily: "'DM Sans', sans-serif",
  },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" },
  statCard: {
    background: "white", border: "1px solid #ede8e0",
    borderRadius: "12px", padding: "12px 10px",
    display: "flex", flexDirection: "column", alignItems: "center", gap: "3px",
    boxShadow: "0 1px 8px rgba(92,61,46,0.04)",
  },
  statCardHighlight: {
    background: "#fffbeb", border: "1.5px solid #fcd34d",
    boxShadow: "0 2px 12px rgba(245,158,11,0.1)",
  },
  statIcon: { fontSize: "16px", marginBottom: "2px" },
  statValue: { fontSize: "22px", fontWeight: "700", lineHeight: 1, fontFamily: "'Cormorant Garamond', serif" },
  statLabel: { fontSize: "9px", color: "#c0a898", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: "600" },
  pendingBanner: {
    display: "flex", alignItems: "center", gap: "12px",
    padding: "14px 16px",
    background: "#fffbeb", border: "1.5px solid #fcd34d",
    borderRadius: "14px", cursor: "pointer",
    animation: "slideDown 0.3s ease",
  },
  bannerTitle: { margin: "0 0 2px", fontWeight: "600", fontSize: "13px", color: "#92400e" },
  bannerSub: { margin: 0, fontSize: "11px", color: "#a0887a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  bannerArrow: { fontSize: "14px", color: "#a0887a", flexShrink: 0 },
  toast: {
    padding: "10px 14px", borderRadius: "10px",
    fontSize: "13px", border: "1px solid",
    fontWeight: "500", animation: "slideDown 0.25s ease",
  },
  tabBar: {
    display: "flex", gap: "2px",
    borderBottom: "2px solid #ede8e0",
    overflowX: "auto",
  },
  tabBtn: {
    padding: "9px 16px", border: "none",
    background: "transparent", cursor: "pointer",
    fontSize: "13px", color: "#a0887a",
    borderBottom: "2px solid transparent", marginBottom: "-2px",
    borderRadius: "4px 4px 0 0",
    fontFamily: "'DM Sans', sans-serif",
    whiteSpace: "nowrap",
    display: "flex", alignItems: "center", gap: "6px",
    transition: "color 0.15s",
  },
  tabBtnActive: { color: "#2c1810", fontWeight: "600", borderBottom: "2px solid #2c1810" },
  tabBadge: {
    background: "#fcd34d", color: "#92400e",
    borderRadius: "10px", fontSize: "10px",
    fontWeight: "700", padding: "1px 6px",
    minWidth: "18px", textAlign: "center",
  },
  card: {
    background: "white", border: "1px solid #ede8e0",
    borderRadius: "16px", padding: "16px",
    boxShadow: "0 2px 12px rgba(92,61,46,0.05)",
  },
  calNav: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    marginBottom: "14px",
  },
  calTitle: {
    fontSize: "14px", fontWeight: "600", color: "#2c1810",
    fontFamily: "'Cormorant Garamond', serif",
  },
  navBtn: {
    width: "32px", height: "32px",
    border: "1px solid #ede8e0", borderRadius: "8px",
    background: "white", cursor: "pointer",
    fontSize: "14px", color: "#8b6347",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  weekScroll: { overflowX: "auto", marginBottom: "4px" },
  weekGrid: {
    display: "grid", gridTemplateColumns: "repeat(7, minmax(52px, 1fr))",
    gap: "5px", minWidth: "360px",
  },
  dayCell: {
    border: "1px solid #ede8e0", borderRadius: "10px",
    padding: "8px 4px",
    display: "flex", flexDirection: "column", alignItems: "center",
    background: "white", transition: "all 0.15s",
    minHeight: "82px", cursor: "pointer",
    position: "relative", gap: "1px",
  },
  dayCellToday: { border: "1.5px solid #8b6347", background: "rgba(139,99,71,0.03)" },
  dayCellSelected: {
    background: "linear-gradient(135deg, #2c1810 0%, #5c3d2e 100%)",
    border: "1.5px solid #2c1810",
    boxShadow: "0 3px 10px rgba(44,24,16,0.2)",
  },
  legend: {
    display: "flex", gap: "12px",
    marginTop: "12px", paddingTop: "12px",
    borderTop: "1px solid #f5f0eb",
    flexWrap: "wrap",
  },
  legendItem: { display: "flex", alignItems: "center", gap: "5px", fontSize: "10px", color: "#a0887a" },
  dayDetailHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
    marginBottom: "14px", gap: "8px", flexWrap: "wrap",
  },
  dayDetailTitle: {
    margin: 0, fontSize: "15px", fontWeight: "600",
    color: "#2c1810", fontFamily: "'Cormorant Garamond', serif",
  },
  anfrageBadge: {
    padding: "2px 10px", borderRadius: "20px",
    fontSize: "11px", fontWeight: "600",
    background: "rgba(245,158,11,0.12)", color: "#92400e",
    border: "1px solid rgba(245,158,11,0.3)",
  },
  auswahlBtn: {
    padding: "4px 10px",
    border: "1px solid #ede8e0", borderRadius: "6px",
    background: "white", cursor: "pointer",
    fontSize: "11px", color: "#8b6347",
    fontFamily: "'DM Sans', sans-serif",
  },
  auswahlBtnActive: {
    padding: "4px 10px",
    border: "1px solid #fca5a5", borderRadius: "6px",
    background: "rgba(239,68,68,0.05)", cursor: "pointer",
    fontSize: "11px", color: "#b91c1c",
    fontFamily: "'DM Sans', sans-serif",
  },
  auswahlToolbar: {
    display: "flex", alignItems: "center", gap: "10px",
    padding: "10px 12px", marginBottom: "10px",
    background: "#fdfcfb", border: "1px solid #ede8e0",
    borderRadius: "10px", flexWrap: "wrap",
  },
  auswahlAlleBtn: {
    padding: "5px 12px",
    border: "1px solid #ede8e0", borderRadius: "6px",
    background: "white", cursor: "pointer",
    fontSize: "11px", color: "#8b6347",
    fontFamily: "'DM Sans', sans-serif",
  },
  auswahlLoeschenBtn: {
    padding: "5px 14px",
    border: "1px solid #fca5a5", borderRadius: "6px",
    background: "rgba(239,68,68,0.06)", cursor: "pointer",
    fontSize: "11px", fontWeight: "600", color: "#b91c1c",
    fontFamily: "'DM Sans', sans-serif",
    marginLeft: "auto",
  },
  checkbox: {
    width: "20px", height: "20px", flexShrink: 0,
    border: "1.5px solid #d4c5b5", borderRadius: "6px",
    cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    transition: "all 0.15s",
  },
  terminCard: {
    border: "1.5px solid #ede8e0", borderRadius: "12px",
    overflow: "hidden", transition: "all 0.15s",
  },
  terminHead: {
    display: "flex", alignItems: "flex-start", gap: "10px",
    padding: "12px 12px",
  },
  terminTime: {
    fontSize: "17px", fontWeight: "700",
    color: "#5c3d2e", minWidth: "46px",
    fontFamily: "'Cormorant Garamond', serif",
  },
  terminName: { fontWeight: "600", fontSize: "13px", color: "#2c1810" },
  terminNameEmpty: { color: "#d4c5b5", fontSize: "13px" },
  terminNotiz: { fontSize: "11px", color: "#0369a1", marginTop: "3px" },
  terminAbsageGrund: { fontSize: "11px", color: "#a0887a", marginTop: "3px", fontStyle: "italic" },
  statusBadge: {
    display: "inline-flex",
    padding: "3px 9px", borderRadius: "20px",
    fontSize: "10px", fontWeight: "600",
    whiteSpace: "nowrap",
  },
  iconBtn: {
    width: "28px", height: "28px",
    border: "1px solid #ede8e0", borderRadius: "6px",
    background: "white", cursor: "pointer",
    fontSize: "12px", color: "#8b6347",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  iconBtnDanger: {
    width: "28px", height: "28px",
    border: "1px solid #fca5a5", borderRadius: "6px",
    background: "white", cursor: "pointer",
    fontSize: "11px", color: "#b91c1c",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  actionBar: {
    padding: "8px 12px 10px",
    display: "flex", gap: "6px", flexWrap: "wrap",
    borderTop: "1px solid rgba(237,232,224,0.7)",
    background: "rgba(255,255,255,0.6)",
  },
  confirmBtn: {
    padding: "5px 14px",
    border: "1px solid rgba(74,222,128,0.4)", borderRadius: "6px",
    background: "rgba(74,222,128,0.08)", cursor: "pointer",
    fontSize: "12px", fontWeight: "600", color: "#166534",
    fontFamily: "'DM Sans', sans-serif",
  },
  declineBtn: {
    padding: "5px 12px", border: "1px solid #fca5a5", borderRadius: "6px",
    background: "white", cursor: "pointer", fontSize: "12px", color: "#b91c1c",
    fontFamily: "'DM Sans', sans-serif",
  },
  cancelBtn: {
    padding: "5px 12px", border: "1px solid #fca5a5", borderRadius: "6px",
    background: "white", cursor: "pointer", fontSize: "12px", color: "#b91c1c",
    fontFamily: "'DM Sans', sans-serif",
  },
  waitingText: { fontSize: "11px", color: "#c0a898", lineHeight: "28px" },
  inlineForm: {
    padding: "14px 12px", borderTop: "1px solid #ede8e0",
    background: "white", display: "flex", flexDirection: "column", gap: "10px",
  },
  inlineTitle: { margin: 0, fontSize: "13px", fontWeight: "600", color: "#2c1810" },
  formGroup: { display: "flex", flexDirection: "column", gap: "5px", flex: 1 },
  formLabel: {
    fontSize: "10px", fontWeight: "600", color: "#a0887a",
    textTransform: "uppercase", letterSpacing: "0.06em",
  },
  formInput: {
    padding: "9px 12px", border: "1.5px solid #ede8e0", borderRadius: "8px",
    fontSize: "13px", background: "#fdfcfb",
    outline: "none", fontFamily: "'DM Sans', sans-serif",
    color: "#2c1810", width: "100%", boxSizing: "border-box",
  },
  inlineBtns: { display: "flex", gap: "6px", flexWrap: "wrap" },
  confirmBtnSolid: {
    padding: "8px 16px",
    background: "linear-gradient(135deg, #14532d 0%, #166534 100%)",
    color: "white", border: "none", borderRadius: "8px",
    cursor: "pointer", fontSize: "12px", fontWeight: "500",
    fontFamily: "'DM Sans', sans-serif",
  },
  dangerBtnSolid: {
    padding: "8px 16px",
    background: "linear-gradient(135deg, #991b1b 0%, #b91c1c 100%)",
    color: "white", border: "none", borderRadius: "8px",
    cursor: "pointer", fontSize: "12px", fontWeight: "500",
    fontFamily: "'DM Sans', sans-serif",
  },
  primaryBtnSolid: {
    padding: "11px 20px",
    background: "linear-gradient(135deg, #2c1810 0%, #5c3d2e 100%)",
    color: "#e8d5be", border: "none", borderRadius: "10px",
    cursor: "pointer", fontSize: "13px", fontWeight: "500",
    fontFamily: "'DM Sans', sans-serif",
    letterSpacing: "0.02em",
    boxShadow: "0 3px 12px rgba(44,24,16,0.2)",
  },
  ghostBtn: {
    padding: "8px 14px", border: "1px solid #ede8e0", borderRadius: "8px",
    background: "white", cursor: "pointer", fontSize: "12px", color: "#8b6347",
    fontFamily: "'DM Sans', sans-serif",
  },
  formRow: { display: "flex", gap: "10px", flexWrap: "wrap" },
  previewBox: {
    padding: "10px 14px", background: "#fdfcfb", border: "1px solid #ede8e0",
    borderRadius: "8px", fontSize: "12px", color: "#a0887a", lineHeight: 1.6,
  },
  toggleRow: { display: "flex", gap: "6px", marginBottom: "18px" },
  toggleBtn: {
    padding: "7px 16px", border: "1px solid #ede8e0", borderRadius: "8px",
    background: "white", cursor: "pointer", fontSize: "12px", color: "#a0887a",
    fontFamily: "'DM Sans', sans-serif",
  },
  toggleActive: {
    padding: "7px 16px", border: "1.5px solid #2c1810", borderRadius: "8px",
    background: "#2c1810", cursor: "pointer", fontSize: "12px", color: "#e8d5be", fontWeight: "500",
    fontFamily: "'DM Sans', sans-serif",
  },
};