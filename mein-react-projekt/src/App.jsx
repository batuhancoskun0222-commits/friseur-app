import { useState, useEffect } from "react";
import Login from "./pages/Login";
import KundenSeite from "./pages/KundenSeite";
import AdminSeite from "./pages/AdminSeite";
import "./App.css";

function App() {
  const [benutzer, setBenutzer] = useState(null);
  const [bereit, setBereit] = useState(false);

  // Session aus sessionStorage wiederherstellen (bleibt bis Tab/Browser geschlossen wird)
  useEffect(() => {
    const gespeichert = sessionStorage.getItem("salon_benutzer");
    if (gespeichert) {
      try {
        setBenutzer(JSON.parse(gespeichert));
      } catch (e) {
        sessionStorage.removeItem("salon_benutzer");
      }
    }
    setBereit(true);
  }, []);

  function handleLogin(b) {
    sessionStorage.setItem("salon_benutzer", JSON.stringify(b));
    setBenutzer(b);
  }

  function handleLogout() {
    sessionStorage.removeItem("salon_benutzer");
    setBenutzer(null);
  }

  // Kurz warten bis Session geladen ist (verhindert Login-Flash)
  if (!bereit) return null;

  if (!benutzer) {
    return <Login onLogin={handleLogin} />;
  }

  if (benutzer.typ === "admin") {
    return <AdminSeite benutzer={benutzer} onLogout={handleLogout} />;
  }

  return <KundenSeite benutzer={benutzer} onLogout={handleLogout} />;
}

export default App;