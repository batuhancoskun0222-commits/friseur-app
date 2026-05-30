import { useState, useEffect, useCallback } from "react";

const API = "http://192.168.178.174:3000";

function useWebSocket(onUpdate) {
  useEffect(() => {
    const ws = new WebSocket(`ws://192.168.178.174:3000`);
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.typ === "update") onUpdate();
    };
    ws.onerror = () => {};
    return () => ws.close();
  }, []); // eslint-disable-line
}

export default function KundenSeite({ benutzer, onLogout }) {
  const [verfuegbar, setVerfuegbar] = useState([]);
  const [meineTermine, setMeineTermine] = useState([]);
  const [warteliste, setWarteliste] = useState([]);
  const [meldung, setMeldung] = useState({ text: "", typ: "" });
  const [liveIndikator, setLiveIndikator] = useState(false);
  const [kalenderMonat, setKalenderMonat] = useState(new Date());
  const [gewählterTag, setGewählterTag] = useState(null);
  const [mounted, setMounted] = useState(false);

  // BUG FIX: Für Bestätigungsmodal beim Absagen
  const [absagenId, setAbsagenId] = useState(null);

  useEffect(() => {
    setTimeout(() => setMounted(true), 50);
  }, []);

  const ladeAlles = useCallback(async () => {
    const [r1, r2, r3] = await Promise.all([
      fetch(`${API}/termine/verfuegbar`),
      fetch(`${API}/termine/meine/${benutzer.id}`),
      fetch(`${API}/warteliste/status/${benutzer.id}`)
    ]);
    const [v, m, w] = await Promise.all([r1.json(), r2.json(), r3.json()]);
    setVerfuegbar(Array.isArray(v) ? v : []);
    setMeineTermine(Array.isArray(m) ? m : []);
    setWarteliste(Array.isArray(w) ? w : []);
  }, [benutzer.id]);

  useWebSocket(() => {
    setLiveIndikator(true);
    ladeAlles();
    setTimeout(() => setLiveIndikator(false), 2000);
  });
  useEffect(() => { ladeAlles(); }, [ladeAlles]);

  function zeig(text, typ = "ok") {
    setMeldung({ text, typ });
    setTimeout(() => setMeldung({ text: "", typ: "" }), 4000);
  }

  async function anfragen(termin_id) {
    const res = await fetch(`${API}/termine/anfragen`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ benutzer_id: benutzer.id, termin_id })
    });
    const d = await res.json();
    zeig(d.error || d.message, d.error ? "fehler" : "ok");
    ladeAlles();
  }

  async function anfrageZurueckziehen(termin_id) {
    const res = await fetch(`${API}/termine/anfrage-zurueckziehen/${termin_id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ benutzer_id: benutzer.id })
    });
    const d = await res.json();
    zeig(d.error || d.message, d.error ? "fehler" : "ok");
    ladeAlles();
  }

  async function absagen(termin_id) {
    const res = await fetch(`${API}/termine/absagen/${termin_id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ benutzer_id: benutzer.id })
    });
    const d = await res.json();
    zeig(d.error || d.message, d.error ? "fehler" : "ok");
    setAbsagenId(null);
    ladeAlles();
  }

  async function warteToggle(termin_id, istDrauf) {
    const res = await fetch(`${API}/warteliste`, {
      method: istDrauf ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ benutzer_id: benutzer.id, termin_id })
    });
    const d = await res.json();
    zeig(d.error || d.message, d.error ? "fehler" : "ok");
    ladeAlles();
  }

  // BUG FIX: Benachrichtigungen – auch vergangene abgesagte/abgelehnte anzeigen
  const meineAnfrage = meineTermine.find(t => t.status === "angefragt" && new Date(t.zeitdatum) > new Date());
  const meinAktiverTermin = meineTermine.find(t => t.status === "gebucht" && new Date(t.zeitdatum) > new Date());

  // BUG FIX: abgesagte vom Admin anzeigen – zukünftige UND vergangene (letzte 7 Tage)
  const abgesagteVomAdmin = meineTermine.filter(t => t.status === "abgesagt");
  const abgelehnteAnfragen = meineTermine.filter(t => t.status === "abgelehnt");

  const hatAktivenTermin = !!meinAktiverTermin || !!meineAnfrage;

  function fmtLang(dt) {
    return new Date(dt).toLocaleString("de-DE", {
      weekday: "long", day: "2-digit", month: "long",
      year: "numeric", hour: "2-digit", minute: "2-digit"
    });
  }

  function fmtKurz(dt) {
    const d = new Date(dt);
    return {
      zeit: d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
      d
    };
  }

  function countdown(dt) {
    const diff = new Date(dt) - new Date();
    if (diff <= 0) return "bereits vorbei";
    const h = Math.floor(diff / 3600000);
    const d = Math.floor(h / 24);
    if (d > 1) return `in ${d} Tagen`;
    if (d === 1) return "morgen";
    if (h > 1) return `in ${h} Stunden`;
    return "in weniger als einer Stunde";
  }

  function kannAbsagen(dt) {
    return new Date(dt) - new Date() > 24 * 3600000;
  }

  const heute = new Date();
  heute.setHours(0, 0, 0, 0);

  const ersterTagDesMonats = new Date(kalenderMonat.getFullYear(), kalenderMonat.getMonth(), 1);
  const letzterTagDesMonats = new Date(kalenderMonat.getFullYear(), kalenderMonat.getMonth() + 1, 0);

  let startWt = ersterTagDesMonats.getDay() - 1;
  if (startWt < 0) startWt = 6;

  const kalenderTage = [];
  for (let i = 0; i < startWt; i++) kalenderTage.push(null);
  for (let d = 1; d <= letzterTagDesMonats.getDate(); d++) {
    kalenderTage.push(new Date(kalenderMonat.getFullYear(), kalenderMonat.getMonth(), d));
  }

  // BUG FIX: Alle relevanten Termine am Tag – jetzt auch abgesagte vom Admin einbeziehen
  function alleTermineAmTag(tag) {
    if (!tag) return [];
    const ids = new Set();
    const result = [];

    // Eigene Termine (inkl. abgesagt/abgelehnt vom Admin)
    meineTermine.forEach(t => {
      if (!ids.has(t.termin_id) && new Date(t.zeitdatum).toDateString() === tag.toDateString()) {
        ids.add(t.termin_id);
        result.push(t);
      }
    });

    // Verfügbare fremde Termine (nur offen/angefragt/gebucht)
    verfuegbar.forEach(t => {
      if (!ids.has(t.termin_id) && new Date(t.zeitdatum).toDateString() === tag.toDateString()) {
        ids.add(t.termin_id);
        result.push(t);
      }
    });

    return result.sort((a, b) => new Date(a.zeitdatum) - new Date(b.zeitdatum));
  }

  const tagTermine = gewählterTag ? alleTermineAmTag(gewählterTag) : [];

  return (
    <div style={cs.page}>
      <div style={cs.bgOrb1} />
      <div style={cs.bgOrb2} />

      <div style={{ ...cs.container, opacity: mounted ? 1 : 0, transform: mounted ? "none" : "translateY(16px)", transition: "all 0.5s ease" }}>

        {/* Header */}
        <header style={cs.header}>
          <div style={cs.headerLeft}>
            <div style={cs.logo}>✂</div>
            <div>
              <h1 style={cs.salonName}>Atelier</h1>
              <div style={cs.liveRow}>
                <span style={{ ...cs.liveDot, background: liveIndikator ? "#4ade80" : "rgba(255,255,255,0.25)" }} />
                <span style={cs.liveTxt}>{liveIndikator ? "Aktualisiert" : "Live"}</span>
              </div>
            </div>
          </div>
          <div style={cs.headerRight}>
            <span style={cs.userName}>{benutzer.vorname}</span>
            <button style={cs.logoutBtn} onClick={() => { sessionStorage.removeItem("salon_benutzer"); onLogout(); }}>
              Abmelden
            </button>
          </div>
        </header>

        {/* Toast message */}
        {meldung.text && (
          <div style={{
            ...cs.toast,
            background: meldung.typ === "ok" ? "rgba(16,124,65,0.08)" : "rgba(185,28,28,0.07)",
            color: meldung.typ === "ok" ? "#107c41" : "#b91c1c",
            borderColor: meldung.typ === "ok" ? "rgba(16,124,65,0.2)" : "rgba(185,28,28,0.2)",
          }}>
            {meldung.typ === "ok" ? "✓" : "⚠"} {meldung.text}
          </div>
        )}

        {/* BUG FIX: Abgesagte Termine – prominente Benachrichtigung */}
        {abgesagteVomAdmin.map(t => (
          <div key={t.termin_id} style={cs.cancelledBanner}>
            <div style={cs.cancelledBannerLeft}>
              <div style={cs.cancelledIcon}>✕</div>
              <div>
                <p style={cs.cancelledTitle}>Dein Termin wurde vom Friseur abgesagt</p>
                <p style={cs.cancelledDate}>{fmtLang(t.zeitdatum)}</p>
                {t.absage_grund ? (
                  <div style={cs.cancelledReasonBox}>
                    <span style={cs.cancelledReasonLabel}>Grund:</span>
                    <span style={cs.cancelledReasonText}>„{t.absage_grund}"</span>
                  </div>
                ) : (
                  <p style={cs.cancelledNoReason}>Kein Grund angegeben</p>
                )}
              </div>
            </div>
            <div style={cs.cancelledAction}>
              <p style={cs.cancelledHint}>Du kannst einen neuen Termin anfragen.</p>
              <button style={cs.cancelledBtn} onClick={() => {
                setKalenderMonat(new Date());
                setGewählterTag(null);
                document.getElementById("termin-anfragen")?.scrollIntoView({ behavior: "smooth" });
              }}>
                Neuen Termin wählen ↓
              </button>
            </div>
          </div>
        ))}

        {/* Abgelehnte Anfragen */}
        {abgelehnteAnfragen.map(t => (
          <div key={t.termin_id} style={{ ...cs.cancelledBanner, borderColor: "rgba(239,68,68,0.35)", background: "linear-gradient(135deg, rgba(239,68,68,0.06) 0%, rgba(255,255,255,0.9) 100%)" }}>
            <div style={cs.cancelledBannerLeft}>
              <div style={{ ...cs.cancelledIcon, background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>✕</div>
              <div>
                <p style={{ ...cs.cancelledTitle, color: "#b91c1c" }}>Deine Anfrage wurde abgelehnt</p>
                <p style={cs.cancelledDate}>{fmtLang(t.zeitdatum)}</p>
                {t.absage_grund && (
                  <div style={cs.cancelledReasonBox}>
                    <span style={cs.cancelledReasonLabel}>Grund:</span>
                    <span style={cs.cancelledReasonText}>„{t.absage_grund}"</span>
                  </div>
                )}
              </div>
            </div>
            <div style={cs.cancelledAction}>
              <p style={cs.cancelledHint}>Bitte wähle einen anderen Termin.</p>
            </div>
          </div>
        ))}

        {/* Aktive Anfrage */}
        {meineAnfrage && !meinAktiverTermin && (
          <div style={cs.statusCard}>
            <div style={cs.statusCardInner}>
              <div style={cs.statusBadge} data-type="pending">⏳ Ausstehend</div>
              <p style={cs.statusLabel}>Anfrage gesendet</p>
              <p style={cs.statusDate}>{fmtLang(meineAnfrage.zeitdatum)}</p>
              <p style={cs.statusHint}>Der Friseur wird deine Anfrage in Kürze bearbeiten.</p>
            </div>
            <div style={cs.statusActions}>
              <button style={cs.ghostBtn} onClick={() => anfrageZurueckziehen(meineAnfrage.termin_id)}>
                Anfrage zurückziehen
              </button>
            </div>
          </div>
        )}

        {/* Bestätigter Termin */}
        {meinAktiverTermin && (
          <div style={{ ...cs.statusCard, borderColor: "rgba(74,222,128,0.3)", background: "linear-gradient(135deg, rgba(20,83,45,0.03) 0%, white 100%)" }}>
            <div style={cs.statusCardInner}>
              <div style={{ ...cs.statusBadge, background: "rgba(74,222,128,0.15)", color: "#166534" }}>✓ Bestätigt</div>
              <p style={cs.statusLabel}>Dein nächster Termin</p>
              <p style={cs.statusDate}>{fmtLang(meinAktiverTermin.zeitdatum)}</p>
              <p style={{ ...cs.statusHint, color: "#166534", fontWeight: "500" }}>{countdown(meinAktiverTermin.zeitdatum)}</p>
              {meinAktiverTermin.notiz && (
                <div style={cs.noteBox}>
                  💬 <strong>Nachricht vom Friseur:</strong> {meinAktiverTermin.notiz}
                </div>
              )}
            </div>
            {kannAbsagen(meinAktiverTermin.zeitdatum) ? (
              <div style={cs.statusActions}>
                {absagenId === meinAktiverTermin.termin_id ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <p style={{ margin: 0, fontSize: "13px", color: "#92400e", fontWeight: "500" }}>
                      Termin wirklich absagen?
                    </p>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button style={cs.ghostBtnDanger} onClick={() => absagen(meinAktiverTermin.termin_id)}>
                        Ja, absagen
                      </button>
                      <button style={cs.ghostBtn} onClick={() => setAbsagenId(null)}>
                        Abbrechen
                      </button>
                    </div>
                  </div>
                ) : (
                  <button style={cs.ghostBtnDanger} onClick={() => setAbsagenId(meinAktiverTermin.termin_id)}>
                    Termin absagen
                  </button>
                )}
              </div>
            ) : (
              <div style={cs.statusActions}>
                <p style={cs.tooLateHint}>⏱ Absage nicht mehr möglich – weniger als 24h</p>
              </div>
            )}
          </div>
        )}

        {/* Kein Termin */}
        {!meinAktiverTermin && !meineAnfrage && abgesagteVomAdmin.length === 0 && abgelehnteAnfragen.length === 0 && (
          <div style={cs.emptyCard}>
            <span style={{ fontSize: "24px" }}>📅</span>
            <p style={cs.emptyText}>Noch kein Termin. Wähle unten einen freien Tag.</p>
          </div>
        )}

        {/* Warteliste */}
        {!hatAktivenTermin && warteliste.length > 0 && (
          <div style={cs.infoCard}>
            <span>📋</span>
            <div>
              <p style={{ margin: "0 0 2px", fontWeight: "500", fontSize: "13px", color: "#1e40af" }}>
                Du stehst auf {warteliste.length} Warteliste{warteliste.length > 1 ? "n" : ""}
              </p>
              <p style={{ margin: 0, fontSize: "12px", color: "#3b82f6", lineHeight: 1.5 }}>
                Bei einer Absage wirst du automatisch als nächstes berücksichtigt.
              </p>
            </div>
          </div>
        )}

        {/* Kalender */}
        <section id="termin-anfragen" style={cs.section}>
          <h2 style={cs.sectionTitle}>Termine anfragen</h2>

          <div style={cs.card}>
            <div style={cs.calNav}>
              <button style={cs.navBtn} onClick={() => { const d = new Date(kalenderMonat); d.setMonth(d.getMonth() - 1); setKalenderMonat(d); setGewählterTag(null); }}>←</button>
              <span style={cs.calMonthTitle}>
                {kalenderMonat.toLocaleDateString("de-DE", { month: "long", year: "numeric" })}
              </span>
              <button style={cs.navBtn} onClick={() => { const d = new Date(kalenderMonat); d.setMonth(d.getMonth() + 1); setKalenderMonat(d); setGewählterTag(null); }}>→</button>
            </div>

            <div style={cs.calGrid}>
              {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map(wt => (
                <div key={wt} style={cs.calHeaderCell}>{wt}</div>
              ))}
            </div>

            <div style={cs.calGrid}>
              {kalenderTage.map((tag, i) => {
                if (!tag) return <div key={`leer-${i}`} />;
                const tT = alleTermineAmTag(tag);
                const offenCount = verfuegbar.filter(t => new Date(t.zeitdatum).toDateString() === tag.toDateString() && t.status === "offen").length;
                const istMeinerGebucht = tT.some(t => t.status === "gebucht" && meineTermine.some(m => m.termin_id === t.termin_id));
                const istMeinerAngefragt = tT.some(t => t.status === "angefragt" && meineTermine.some(m => m.termin_id === t.termin_id));
                // BUG FIX: abgesagte Termine im Kalender anzeigen
                const istAbgesagt = tT.some(t => (t.status === "abgesagt" || t.status === "abgelehnt") && meineTermine.some(m => m.termin_id === t.termin_id));
                const istHeute = tag.toDateString() === new Date().toDateString();
                const istGewählt = gewählterTag && tag.toDateString() === gewählterTag.toDateString();
                const istVergangen = tag < heute;
                const hatOffene = offenCount > 0;

                return (
                  <div
                    key={tag.toDateString()}
                    onClick={() => !istVergangen && setGewählterTag(istGewählt ? null : tag)}
                    style={{
                      ...cs.calDay,
                      ...(istHeute && !istGewählt ? cs.calDayToday : {}),
                      ...(istGewählt ? cs.calDaySelected : {}),
                      ...(hatOffene && !istGewählt && !istVergangen ? cs.calDayHasSlots : {}),
                      opacity: istVergangen ? 0.3 : 1,
                      cursor: istVergangen ? "default" : "pointer",
                    }}
                  >
                    <span style={{ fontSize: "13px", fontWeight: istHeute ? "700" : "400", color: istGewählt ? "white" : "#2c1810" }}>
                      {tag.getDate()}
                    </span>
                    {tT.length > 0 && !istVergangen && (
                      <div style={{ display: "flex", gap: "2px", marginTop: "4px", justifyContent: "center" }}>
                        {istMeinerGebucht && (
                          <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: istGewählt ? "white" : "#22c55e" }} />
                        )}
                        {istMeinerAngefragt && (
                          <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: istGewählt ? "white" : "#f59e0b" }} />
                        )}
                        {/* BUG FIX: Roter Punkt für abgesagte/abgelehnte Termine */}
                        {istAbgesagt && (
                          <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: istGewählt ? "rgba(255,255,255,0.7)" : "#ef4444" }} />
                        )}
                        {offenCount > 0 && (
                          <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: istGewählt ? "rgba(255,255,255,0.6)" : "#c8b49a" }} />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={cs.legend}>
              {[["#22c55e", "Mein Termin"], ["#f59e0b", "Meine Anfrage"], ["#ef4444", "Abgesagt"], ["#c8b49a", "Freier Termin"]].map(([c, l]) => (
                <div key={l} style={cs.legendItem}>
                  <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: c }} />
                  <span>{l}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tag-Detail */}
          {gewählterTag && (
            <div style={{ ...cs.card, marginTop: "10px", animation: "slideDown 0.2s ease" }}>
              <div style={cs.dayHeader}>
                <h3 style={cs.dayTitle}>
                  {gewählterTag.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long" })}
                </h3>
                <span style={cs.dayCount}>{tagTermine.length} Termin{tagTermine.length !== 1 ? "e" : ""}</span>
              </div>

              {tagTermine.length === 0 ? (
                <p style={cs.noTermine}>Keine Termine an diesem Tag verfügbar</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {tagTermine.map(t => {
                    const { zeit } = fmtKurz(t.zeitdatum);
                    const istMeiner = meineTermine.some(m => m.termin_id === t.termin_id);
                    const meinerStatus = istMeiner ? meineTermine.find(m => m.termin_id === t.termin_id)?.status : null;
                    const drauf = warteliste.includes(t.termin_id);
                    const fremdGebucht = !istMeiner && t.status === "gebucht";
                    const fremdAngefragt = !istMeiner && t.status === "angefragt";
                    const istOffen = t.status === "offen" && !istMeiner;

                    let slotBg = "white", slotBorder = "#ede8e0";
                    if (meinerStatus === "gebucht") { slotBg = "#f0faf4"; slotBorder = "#86efac"; }
                    if (meinerStatus === "angefragt") { slotBg = "#fffbeb"; slotBorder = "#fcd34d"; }
                    // BUG FIX: Abgesagte und abgelehnte klar hervorheben
                    if (meinerStatus === "abgesagt") { slotBg = "#fff7ed"; slotBorder = "#fdba74"; }
                    if (meinerStatus === "abgelehnt") { slotBg = "#fef2f2"; slotBorder = "#fca5a5"; }
                    if (istOffen && !hatAktivenTermin) { slotBg = "#fdfaf7"; slotBorder = "#d4bfa8"; }

                    return (
                      <div key={t.termin_id} style={{ ...cs.slotRow, background: slotBg, borderColor: slotBorder }}>
                        <div style={{ ...cs.slotTime, color: (fremdGebucht || fremdAngefragt) ? "#d4c5b5" : "#5c3d2e" }}>
                          {zeit}
                        </div>
                        <div style={{ flex: 1 }}>
                          {meinerStatus === "gebucht" && <span style={cs.slotLabel} data-type="ok">✓ Bestätigt</span>}
                          {meinerStatus === "angefragt" && <span style={cs.slotLabel} data-type="pending">⏳ Ausstehend</span>}

                          {/* BUG FIX: Abgesagt vom Admin – mit Grund anzeigen */}
                          {meinerStatus === "abgesagt" && (
                            <div>
                              <span style={{ ...cs.slotLabel, background: "rgba(251,146,60,0.15)", color: "#c2410c" }}>
                                ✕ Vom Friseur abgesagt
                              </span>
                              {t.absage_grund && (
                                <div style={{ fontSize: "11px", color: "#c2410c", marginTop: "4px", fontStyle: "italic" }}>
                                  Grund: „{t.absage_grund}"
                                </div>
                              )}
                            </div>
                          )}

                          {/* BUG FIX: Abgelehnt vom Admin – mit Grund anzeigen */}
                          {meinerStatus === "abgelehnt" && (
                            <div>
                              <span style={{ ...cs.slotLabel, background: "rgba(239,68,68,0.1)", color: "#b91c1c" }}>
                                ✕ Abgelehnt
                              </span>
                              {t.absage_grund && (
                                <div style={{ fontSize: "11px", color: "#b91c1c", marginTop: "4px", fontStyle: "italic" }}>
                                  Grund: „{t.absage_grund}"
                                </div>
                              )}
                            </div>
                          )}

                          {istOffen && !hatAktivenTermin && (
                            <span style={cs.slotFreeLabel}>Freier Termin – jetzt anfragen</span>
                          )}
                          {istOffen && hatAktivenTermin && (
                            <span style={{ fontSize: "13px", color: "#c8b49a" }}>Freier Termin</span>
                          )}
                          {fremdGebucht && (
                            <div>
                              <span style={{ fontSize: "13px", color: "#c8b49a" }}>Belegt</span>
                              {!hatAktivenTermin && (
                                <div style={{ fontSize: "11px", color: "#c8b49a", marginTop: "2px" }}>
                                  {drauf ? "Auf Warteliste" : "Warteliste verfügbar"}
                                </div>
                              )}
                            </div>
                          )}
                          {fremdAngefragt && <span style={{ fontSize: "13px", color: "#c8b49a" }}>Bereits angefragt</span>}
                          {t.notiz && <div style={cs.slotNote}>💬 {t.notiz}</div>}
                        </div>
                        <div>
                          {meinerStatus === "gebucht" ? (
                            kannAbsagen(t.zeitdatum)
                              ? (absagenId === t.termin_id ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "flex-end" }}>
                                  <button style={cs.slotDangerBtn} onClick={() => absagen(t.termin_id)}>Ja, absagen</button>
                                  <button style={cs.slotGhostBtn} onClick={() => setAbsagenId(null)}>Abbrechen</button>
                                </div>
                              ) : (
                                <button style={cs.slotDangerBtn} onClick={() => setAbsagenId(t.termin_id)}>Absagen</button>
                              ))
                              : <span style={{ fontSize: "11px", color: "#c8b49a" }}>Nicht absagbar</span>
                          ) : meinerStatus === "angefragt" ? (
                            <button style={cs.slotGhostBtn} onClick={() => anfrageZurueckziehen(t.termin_id)}>Zurückziehen</button>
                          ) : istOffen && !hatAktivenTermin ? (
                            <button style={cs.slotPrimaryBtn} onClick={() => anfragen(t.termin_id)}>
                              Anfragen →
                            </button>
                          ) : fremdGebucht && !hatAktivenTermin ? (
                            <button
                              style={drauf ? cs.slotWaitlistActive : cs.slotWaitlistBtn}
                              onClick={() => warteToggle(t.termin_id, drauf)}
                            >
                              {drauf ? "✓ Liste" : "+ Liste"}
                            </button>
                          ) : istOffen && hatAktivenTermin ? (
                            <span style={{ fontSize: "11px", color: "#c8b49a" }}>Bereits gebucht</span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=DM+Sans:wght@300;400;500&display=swap');
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulseBorder {
          0%, 100% { box-shadow: 0 0 0 0 rgba(92,61,46,0.15); }
          50% { box-shadow: 0 0 0 4px rgba(92,61,46,0.08); }
        }
      `}</style>
    </div>
  );
}

const cs = {
  page: {
    minHeight: "100vh",
    background: "#f7f4f0",
    fontFamily: "'DM Sans', sans-serif",
    padding: "0 0 3rem",
    position: "relative",
    overflowX: "hidden",
  },
  bgOrb1: {
    position: "fixed", top: "0", left: "0", right: "0",
    height: "200px",
    background: "linear-gradient(to bottom, rgba(92,61,46,0.06) 0%, transparent 100%)",
    pointerEvents: "none",
  },
  bgOrb2: {
    position: "fixed", bottom: "0", right: "0",
    width: "300px", height: "300px", borderRadius: "50%",
    background: "radial-gradient(circle, rgba(180,155,120,0.08) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  container: {
    maxWidth: "700px", margin: "0 auto",
    padding: "0 16px",
    display: "flex", flexDirection: "column", gap: "14px",
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "20px 0 8px",
  },
  headerLeft: { display: "flex", alignItems: "center", gap: "12px" },
  logo: {
    width: "40px", height: "40px",
    background: "linear-gradient(135deg, #2c1810 0%, #5c3d2e 100%)",
    borderRadius: "12px",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: "18px", color: "#e8d5be",
    boxShadow: "0 4px 12px rgba(44,24,16,0.2)",
  },
  salonName: {
    margin: "0 0 2px", fontSize: "18px", fontWeight: "600",
    fontFamily: "'Cormorant Garamond', serif",
    color: "#2c1810", letterSpacing: "0.04em",
  },
  liveRow: { display: "flex", alignItems: "center", gap: "5px" },
  liveDot: { width: "6px", height: "6px", borderRadius: "50%", display: "inline-block", transition: "background 0.4s" },
  liveTxt: { fontSize: "10px", color: "#c0a898", letterSpacing: "0.06em" },
  headerRight: { display: "flex", alignItems: "center", gap: "10px" },
  userName: { fontSize: "13px", color: "#a0887a" },
  logoutBtn: {
    padding: "7px 14px", border: "1px solid #e8e0d8", borderRadius: "8px",
    background: "white", cursor: "pointer", fontSize: "12px", color: "#8b6347",
    fontFamily: "'DM Sans', sans-serif",
  },
  toast: {
    padding: "10px 14px", borderRadius: "10px",
    fontSize: "13px", border: "1px solid",
    fontWeight: "500", animation: "slideDown 0.25s ease",
  },
  cancelledBanner: {
    display: "flex", flexDirection: "column", gap: "14px",
    padding: "18px",
    background: "linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(255,255,255,0.95) 100%)",
    border: "1.5px solid rgba(245,158,11,0.4)",
    borderRadius: "16px",
    animation: "slideDown 0.3s ease",
    boxShadow: "0 4px 16px rgba(245,158,11,0.08)",
  },
  cancelledBannerLeft: { display: "flex", gap: "14px", alignItems: "flex-start" },
  cancelledIcon: {
    width: "36px", height: "36px", borderRadius: "50%", flexShrink: 0,
    background: "rgba(245,158,11,0.15)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: "14px", fontWeight: "700", color: "#d97706",
  },
  cancelledTitle: { margin: "0 0 4px", fontWeight: "600", fontSize: "14px", color: "#92400e" },
  cancelledDate: {
    margin: "0 0 8px", fontSize: "13px", color: "#78350f",
    fontFamily: "'Cormorant Garamond', serif", fontWeight: "500",
  },
  cancelledReasonBox: {
    display: "inline-flex", gap: "6px", alignItems: "baseline",
    padding: "8px 14px",
    background: "rgba(255,255,255,0.8)", border: "1px solid rgba(245,158,11,0.25)",
    borderRadius: "10px", fontSize: "13px",
  },
  cancelledReasonLabel: { fontWeight: "600", color: "#92400e", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.06em" },
  cancelledReasonText: { fontStyle: "italic", color: "#78350f" },
  cancelledNoReason: { margin: 0, fontSize: "12px", color: "#c8a97a", fontStyle: "italic" },
  cancelledAction: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    paddingTop: "12px", borderTop: "1px solid rgba(245,158,11,0.2)",
    flexWrap: "wrap", gap: "8px",
  },
  cancelledHint: { margin: 0, fontSize: "12px", color: "#c8a97a" },
  cancelledBtn: {
    padding: "8px 18px",
    background: "linear-gradient(135deg, #2c1810 0%, #5c3d2e 100%)",
    color: "#e8d5be", border: "none", borderRadius: "10px",
    cursor: "pointer", fontSize: "12px", fontWeight: "500",
    fontFamily: "'DM Sans', sans-serif",
    boxShadow: "0 2px 8px rgba(44,24,16,0.2)",
  },
  statusCard: {
    background: "white", border: "1.5px solid #ede8e0",
    borderRadius: "16px", overflow: "hidden",
    boxShadow: "0 2px 16px rgba(92,61,46,0.06)",
  },
  statusCardInner: { padding: "18px 18px 14px" },
  statusBadge: {
    display: "inline-flex", alignItems: "center",
    padding: "4px 12px", borderRadius: "20px",
    fontSize: "11px", fontWeight: "600",
    background: "rgba(245,158,11,0.12)", color: "#92400e",
    marginBottom: "10px", letterSpacing: "0.02em",
  },
  statusLabel: { margin: "0 0 4px", fontSize: "11px", color: "#a0887a", textTransform: "uppercase", letterSpacing: "0.08em" },
  statusDate: { margin: "0 0 6px", fontSize: "17px", fontWeight: "600", color: "#2c1810", fontFamily: "'Cormorant Garamond', serif", lineHeight: 1.3 },
  statusHint: { margin: 0, fontSize: "13px", color: "#a0887a" },
  noteBox: {
    marginTop: "10px", padding: "10px 12px",
    background: "#f0f7ff", border: "1px solid #bae6fd",
    borderRadius: "10px", fontSize: "13px", color: "#0369a1",
  },
  statusActions: {
    padding: "12px 18px", borderTop: "1px solid #f0ebe4", background: "#fdfcfb",
  },
  ghostBtn: {
    padding: "8px 16px", border: "1px solid #e8e0d8", borderRadius: "8px",
    background: "white", cursor: "pointer", fontSize: "12px", color: "#8b6347",
    fontFamily: "'DM Sans', sans-serif",
  },
  ghostBtnDanger: {
    padding: "8px 16px", border: "1px solid #fca5a5", borderRadius: "8px",
    background: "white", cursor: "pointer", fontSize: "12px", color: "#b91c1c",
    fontFamily: "'DM Sans', sans-serif",
  },
  tooLateHint: { margin: 0, fontSize: "12px", color: "#c8b49a" },
  emptyCard: {
    display: "flex", alignItems: "center", gap: "12px",
    padding: "18px", background: "white",
    border: "1px solid #ede8e0", borderRadius: "14px",
  },
  emptyText: { margin: 0, fontSize: "13px", color: "#c0a898" },
  infoCard: {
    display: "flex", gap: "10px", alignItems: "flex-start",
    padding: "12px 16px",
    background: "rgba(59,130,246,0.05)", border: "1px solid rgba(59,130,246,0.15)",
    borderRadius: "12px", fontSize: "13px",
  },
  section: { display: "flex", flexDirection: "column", gap: "0" },
  sectionTitle: {
    margin: "0 0 10px", fontSize: "13px", fontWeight: "500",
    color: "#a0887a", textTransform: "uppercase", letterSpacing: "0.1em",
  },
  card: {
    background: "white", border: "1px solid #ede8e0",
    borderRadius: "16px", padding: "18px",
    boxShadow: "0 2px 12px rgba(92,61,46,0.05)",
  },
  calNav: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" },
  calMonthTitle: { fontSize: "15px", fontWeight: "600", color: "#2c1810", fontFamily: "'Cormorant Garamond', serif", letterSpacing: "0.02em" },
  navBtn: {
    width: "32px", height: "32px", border: "1px solid #ede8e0", borderRadius: "8px",
    background: "white", cursor: "pointer", fontSize: "14px", color: "#8b6347",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  calGrid: { display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "3px" },
  calHeaderCell: {
    textAlign: "center", fontSize: "10px", fontWeight: "600",
    color: "#c0a898", textTransform: "uppercase", letterSpacing: "0.06em",
    padding: "4px 0 10px",
  },
  calDay: {
    borderRadius: "8px", padding: "8px 4px 6px",
    display: "flex", flexDirection: "column", alignItems: "center",
    border: "1px solid transparent", background: "transparent",
    minHeight: "50px", transition: "all 0.15s",
  },
  calDayToday: { border: "1.5px solid #8b6347", background: "rgba(139,99,71,0.04)" },
  calDaySelected: {
    background: "linear-gradient(135deg, #2c1810 0%, #5c3d2e 100%)",
    border: "1.5px solid #2c1810",
    boxShadow: "0 2px 8px rgba(44,24,16,0.2)",
  },
  calDayHasSlots: {
    background: "rgba(139,99,71,0.04)",
    border: "1px solid rgba(139,99,71,0.2)",
  },
  legend: { display: "flex", gap: "16px", marginTop: "14px", paddingTop: "12px", borderTop: "1px solid #f5f0eb", flexWrap: "wrap" },
  legendItem: { display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#a0887a" },
  dayHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" },
  dayTitle: { margin: 0, fontSize: "15px", fontWeight: "600", color: "#2c1810", fontFamily: "'Cormorant Garamond', serif" },
  dayCount: { fontSize: "12px", color: "#c0a898" },
  noTermine: { textAlign: "center", color: "#d4c5b5", fontSize: "13px", padding: "20px 0", margin: 0 },
  slotRow: {
    display: "flex", alignItems: "center", gap: "12px",
    padding: "12px 14px", borderRadius: "10px",
    border: "1.5px solid #ede8e0", transition: "all 0.15s",
  },
  slotTime: { fontSize: "16px", fontWeight: "700", minWidth: "48px", fontFamily: "'Cormorant Garamond', serif" },
  slotLabel: {
    display: "inline-block", padding: "2px 10px", borderRadius: "20px",
    fontSize: "11px", fontWeight: "600",
    background: "rgba(74,222,128,0.12)", color: "#166534",
  },
  slotFreeLabel: { fontSize: "13px", color: "#5c3d2e", fontWeight: "500" },
  slotNote: { fontSize: "11px", color: "#0369a1", marginTop: "4px" },
  slotPrimaryBtn: {
    padding: "8px 18px",
    background: "linear-gradient(135deg, #2c1810 0%, #5c3d2e 100%)",
    color: "#e8d5be", border: "none", borderRadius: "8px",
    cursor: "pointer", fontSize: "13px", fontWeight: "600",
    fontFamily: "'DM Sans', sans-serif",
    whiteSpace: "nowrap",
    boxShadow: "0 2px 8px rgba(44,24,16,0.25)",
    letterSpacing: "0.02em",
  },
  slotGhostBtn: {
    padding: "6px 12px", border: "1px solid #e8d8c0", borderRadius: "8px",
    background: "white", cursor: "pointer", fontSize: "11px", color: "#8b6347",
    fontFamily: "'DM Sans', sans-serif", whiteSpace: "nowrap",
  },
  slotDangerBtn: {
    padding: "6px 12px", border: "1px solid #fca5a5", borderRadius: "8px",
    background: "white", cursor: "pointer", fontSize: "11px", color: "#b91c1c",
    fontFamily: "'DM Sans', sans-serif", whiteSpace: "nowrap",
  },
  slotWaitlistBtn: {
    padding: "6px 12px", border: "1px solid #e8e0d8", borderRadius: "8px",
    background: "white", cursor: "pointer", fontSize: "11px", color: "#a0887a",
    fontFamily: "'DM Sans', sans-serif", whiteSpace: "nowrap",
  },
  slotWaitlistActive: {
    padding: "6px 12px", border: "1px solid rgba(59,130,246,0.3)", borderRadius: "8px",
    background: "rgba(59,130,246,0.06)", cursor: "pointer", fontSize: "11px",
    color: "#1d4ed8", fontWeight: "500",
    fontFamily: "'DM Sans', sans-serif", whiteSpace: "nowrap",
  },
};