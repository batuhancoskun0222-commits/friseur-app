import { useState, useRef, useEffect } from "react";

export default function Login({ onLogin }) {
  const [vorname, setVorname] = useState("");
  const [nachname, setNachname] = useState("");
  const [passwort, setPasswort] = useState("");
  const [modus, setModus] = useState("login");
  const [meldung, setMeldung] = useState({ text: "", typ: "" });
  const [laden, setLaden] = useState(false);
  const [focused, setFocused] = useState(null);
  const passwortRef = useRef(null);

  function handleKeyDown(e) {
    if (e.key === "Enter") absenden();
  }

  async function absenden() {
    if (!vorname.trim() || !nachname.trim() || !passwort.trim()) {
      setMeldung({ text: "Bitte alle Felder ausfüllen", typ: "fehler" });
      return;
    }
    setLaden(true);
    setMeldung({ text: "", typ: "" });

    const url = modus === "login" ? "/login" : "/register";
    const res = await fetch(`https://friseur-server.onrender.com${url}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vorname: vorname.trim(), nachname: nachname.trim(), passwort })
    });
    const daten = await res.json();
    setLaden(false);

    if (!res.ok) {
      setMeldung({ text: daten.error, typ: "fehler" });
      return;
    }

    if (modus === "register") {
      setMeldung({ text: "Konto erstellt – jetzt anmelden.", typ: "ok" });
      setModus("login");
      setPasswort("");
      setTimeout(() => passwortRef.current?.focus(), 100);
    } else {
      sessionStorage.setItem("salon_benutzer", JSON.stringify(daten.benutzer));
      onLogin(daten.benutzer);
    }
  }

  return (
    <div style={styles.page}>
      {/* Decorative background */}
      <div style={styles.bgDecor1} />
      <div style={styles.bgDecor2} />
      <div style={styles.bgDecor3} />

      <div style={styles.card}>
        {/* Logo / Brand */}
        <div style={styles.brandArea}>
          <div style={styles.scissorIcon}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <path d="M6 3C4.34 3 3 4.34 3 6s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3zm0 4.5c-.83 0-1.5-.67-1.5-1.5S5.17 4.5 6 4.5 7.5 5.17 7.5 6 6.83 7.5 6 7.5zM6 12c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3zm0 4.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm5.5-7l8 4.5-8-9v4.5z" fill="currentColor"/>
            </svg>
          </div>
          <h1 style={styles.brandName}>Atelier</h1>
          <p style={styles.brandSub}>Terminverwaltung</p>
        </div>

        {/* Tab switcher */}
        <div style={styles.tabBar}>
          <button
            style={{ ...styles.tabBtn, ...(modus === "login" ? styles.tabBtnActive : {}) }}
            onClick={() => { setModus("login"); setMeldung({ text: "", typ: "" }); }}
          >
            Anmelden
          </button>
          <button
            style={{ ...styles.tabBtn, ...(modus === "register" ? styles.tabBtnActive : {}) }}
            onClick={() => { setModus("register"); setMeldung({ text: "", typ: "" }); }}
          >
            Registrieren
          </button>
          <div style={{
            ...styles.tabSlider,
            transform: modus === "register" ? "translateX(100%)" : "translateX(0)"
          }} />
        </div>

        {/* Fields */}
        <div style={styles.fields}>
          {[
            { label: "Vorname", val: vorname, set: setVorname, id: "vn", placeholder: "Max", type: "text" },
            { label: "Nachname", val: nachname, set: setNachname, id: "nn", placeholder: "Mustermann", type: "text" },
            { label: "Passwort", val: passwort, set: setPasswort, id: "pw", placeholder: "••••••••", type: "password", ref: passwortRef }
          ].map(({ label, val, set, id, placeholder, type, ref }) => (
            <div key={id} style={styles.fieldGroup}>
              <label style={{
                ...styles.fieldLabel,
                ...(focused === id || val ? styles.fieldLabelFloated : {})
              }}>
                {label}
              </label>
              <input
                ref={ref}
                type={type}
                style={{
                  ...styles.input,
                  ...(focused === id ? styles.inputFocused : {})
                }}
                value={val}
                onChange={e => set(e.target.value)}
                onFocus={() => setFocused(id)}
                onBlur={() => setFocused(null)}
                onKeyDown={handleKeyDown}
                placeholder={focused === id ? placeholder : ""}
                autoFocus={id === "vn"}
              />
            </div>
          ))}
        </div>

        {/* Feedback message */}
        {meldung.text && (
          <div style={{
            ...styles.message,
            background: meldung.typ === "ok" ? "rgba(16, 124, 65, 0.08)" : "rgba(185, 28, 28, 0.06)",
            color: meldung.typ === "ok" ? "#107c41" : "#b91c1c",
            borderColor: meldung.typ === "ok" ? "rgba(16, 124, 65, 0.2)" : "rgba(185, 28, 28, 0.2)",
          }}>
            <span>{meldung.typ === "ok" ? "✓" : "!"}</span>
            {meldung.text}
          </div>
        )}

        <button style={{ ...styles.submitBtn, opacity: laden ? 0.7 : 1 }} onClick={absenden} disabled={laden}>
          {laden ? (
            <span style={styles.loadingDots}>
              <span style={{ ...styles.dot, animationDelay: "0ms" }} />
              <span style={{ ...styles.dot, animationDelay: "160ms" }} />
              <span style={{ ...styles.dot, animationDelay: "320ms" }} />
            </span>
          ) : (
            modus === "login" ? "Anmelden" : "Konto erstellen"
          )}
        </button>

        {modus === "login" && (
          <p style={styles.hint}>Passwort vergessen? Frage den Friseur nach einem Reset.</p>
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=DM+Sans:wght@300;400;500&display=swap');
        @keyframes dotPulse {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f7f4f0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'DM Sans', sans-serif",
    padding: "1rem",
    position: "relative",
    overflow: "hidden",
  },
  bgDecor1: {
    position: "fixed", top: "-120px", right: "-80px",
    width: "400px", height: "400px", borderRadius: "50%",
    background: "radial-gradient(circle, rgba(180,155,120,0.15) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  bgDecor2: {
    position: "fixed", bottom: "-100px", left: "-60px",
    width: "350px", height: "350px", borderRadius: "50%",
    background: "radial-gradient(circle, rgba(100,80,60,0.1) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  bgDecor3: {
    position: "fixed", top: "40%", left: "10%",
    width: "2px", height: "200px",
    background: "linear-gradient(to bottom, transparent, rgba(160,130,90,0.15), transparent)",
    pointerEvents: "none",
  },
  card: {
    background: "white",
    borderRadius: "24px",
    padding: "2.5rem 2rem",
    width: "100%",
    maxWidth: "380px",
    boxShadow: "0 8px 60px rgba(80,60,40,0.12), 0 2px 8px rgba(80,60,40,0.06)",
    border: "1px solid rgba(180,155,120,0.15)",
    animation: "fadeIn 0.5s ease",
  },
  brandArea: {
    textAlign: "center",
    marginBottom: "2rem",
  },
  scissorIcon: {
    width: "52px", height: "52px",
    background: "linear-gradient(135deg, #2c1810 0%, #5c3d2e 100%)",
    borderRadius: "16px",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "#e8d5be",
    margin: "0 auto 14px",
    boxShadow: "0 4px 20px rgba(44,24,16,0.25)",
  },
  brandName: {
    margin: "0 0 4px",
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: "26px", fontWeight: "600",
    color: "#1a0e08",
    letterSpacing: "0.06em",
  },
  brandSub: {
    margin: 0,
    fontSize: "12px", color: "#a0887a",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },
  tabBar: {
    display: "flex",
    background: "#f7f4f0",
    borderRadius: "12px",
    padding: "4px",
    marginBottom: "1.75rem",
    position: "relative",
    overflow: "hidden",
  },
  tabSlider: {
    position: "absolute",
    top: "4px", left: "4px",
    width: "calc(50% - 4px)", height: "calc(100% - 8px)",
    background: "white",
    borderRadius: "8px",
    boxShadow: "0 1px 6px rgba(80,60,40,0.1)",
    transition: "transform 0.25s cubic-bezier(0.34,1.56,0.64,1)",
    pointerEvents: "none",
  },
  tabBtn: {
    flex: 1, padding: "9px 0",
    border: "none", background: "transparent",
    cursor: "pointer", fontSize: "13px",
    color: "#a0887a", fontWeight: "400",
    position: "relative", zIndex: 1,
    transition: "color 0.2s",
    fontFamily: "'DM Sans', sans-serif",
  },
  tabBtnActive: {
    color: "#2c1810", fontWeight: "500",
  },
  fields: {
    display: "flex", flexDirection: "column", gap: "18px",
    marginBottom: "20px",
  },
  fieldGroup: {
    position: "relative",
  },
  fieldLabel: {
    display: "block",
    fontSize: "12px", fontWeight: "500",
    color: "#a0887a",
    marginBottom: "7px",
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    transition: "color 0.2s",
  },
  fieldLabelFloated: {
    color: "#5c3d2e",
  },
  input: {
    width: "100%", boxSizing: "border-box",
    padding: "12px 14px",
    border: "1.5px solid #e8e0d8",
    borderRadius: "10px",
    fontSize: "14px",
    fontFamily: "'DM Sans', sans-serif",
    color: "#1a0e08",
    background: "#fdfcfb",
    outline: "none",
    transition: "border-color 0.2s, box-shadow 0.2s",
  },
  inputFocused: {
    borderColor: "#8b6347",
    boxShadow: "0 0 0 3px rgba(139,99,71,0.1)",
    background: "white",
  },
  message: {
    display: "flex", alignItems: "center", gap: "8px",
    padding: "10px 14px",
    borderRadius: "10px",
    fontSize: "13px",
    border: "1px solid",
    marginBottom: "16px",
    animation: "slideIn 0.25s ease",
  },
  submitBtn: {
    width: "100%", padding: "14px",
    background: "linear-gradient(135deg, #2c1810 0%, #5c3d2e 100%)",
    color: "#e8d5be",
    border: "none", borderRadius: "12px",
    fontSize: "14px", fontWeight: "500",
    cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
    letterSpacing: "0.04em",
    transition: "transform 0.15s, box-shadow 0.15s",
    boxShadow: "0 4px 16px rgba(44,24,16,0.2)",
    marginBottom: "14px",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  loadingDots: {
    display: "flex", gap: "6px", alignItems: "center",
  },
  dot: {
    width: "6px", height: "6px",
    borderRadius: "50%",
    background: "#e8d5be",
    display: "inline-block",
    animation: "dotPulse 1.2s infinite ease-in-out",
  },
  hint: {
    textAlign: "center", margin: 0,
    fontSize: "11px", color: "#c0a898",
    lineHeight: 1.6,
  },
};