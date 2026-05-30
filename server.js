const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const http = require('http');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

db.connect(err => {
  if (err) console.error('DB Fehler:', err);
  else console.log('Mit Datenbank verbunden');
});

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(c => { if (c.readyState === 1) c.send(msg); });
}
wss.on('connection', ws => ws.send(JSON.stringify({ typ: 'verbunden' })));

// ─── AUTH ─────────────────────────────────────────────────────────────────────

app.post('/register', async (req, res) => {
  const { vorname, nachname, passwort } = req.body;
  if (!vorname || !nachname || !passwort)
    return res.status(400).json({ error: 'Alle Felder sind Pflicht' });
  const hash = await bcrypt.hash(passwort, 10);
  db.query(
    'INSERT INTO Benutzer (vorname, nachname, passwort, typ) VALUES (?, ?, ?, ?)',
    [vorname, nachname, hash, 'kunde'],
    err => {
      if (err) return res.status(500).json({ error: 'Name bereits vergeben' });
      res.json({ message: 'Registrierung erfolgreich' });
    }
  );
});

app.post('/login', (req, res) => {
  const { vorname, nachname, passwort } = req.body;
  db.query(
    'SELECT * FROM Benutzer WHERE vorname = ? AND nachname = ?',
    [vorname, nachname],
    async (err, results) => {
      if (err || results.length === 0)
        return res.status(401).json({ error: 'Benutzer nicht gefunden' });
      const b = results[0];
      const richtig = await bcrypt.compare(passwort, b.passwort);
      if (!richtig)
        return res.status(401).json({ error: 'Falsches Passwort' });
      res.json({
        message: 'Login erfolgreich',
        benutzer: { id: b.benutzer_id, vorname: b.vorname, nachname: b.nachname, typ: b.typ }
      });
    }
  );
});

// ─── KUNDEN ───────────────────────────────────────────────────────────────────

// BUG FIX: Verfügbare Termine + abgesagte die dem Kunden gehören (damit er sie sieht)
app.get('/termine/verfuegbar', (req, res) => {
  db.query(
    `SELECT * FROM Termin
     WHERE status IN ('offen', 'angefragt', 'gebucht')
       AND zeitdatum >= NOW()
       AND zeitdatum <= DATE_ADD(NOW(), INTERVAL 1 WEEK)
     ORDER BY zeitdatum ASC`,
    (err, r) => { if (err) return res.status(500).json({ error: 'Datenbankfehler' }); res.json(r); }
  );
});

// BUG FIX: Alle Termine des Kunden – auch abgesagte + abgelehnte, zeitlich nicht eingeschränkt
// damit der Kunde Benachrichtigungen sieht. Nur die letzten 7 Tage rückwirkend mitliefern.
app.get('/termine/meine/:id', (req, res) => {
  db.query(
    `SELECT * FROM Termin
     WHERE benutzer_id = ?
       AND (
         zeitdatum >= NOW()
         OR (status IN ('abgesagt', 'abgelehnt') AND zeitdatum >= DATE_SUB(NOW(), INTERVAL 7 DAY))
       )
     ORDER BY zeitdatum ASC`,
    [req.params.id],
    (err, r) => { if (err) return res.status(500).json({ error: 'Datenbankfehler' }); res.json(r); }
  );
});

app.get('/warteliste/status/:id', (req, res) => {
  db.query(`SELECT termin_id FROM Warteliste WHERE benutzer_id = ?`, [req.params.id],
    (err, r) => {
      if (err) return res.status(500).json({ error: 'Datenbankfehler' });
      res.json(r.map(x => x.termin_id));
    }
  );
});

// Kunde stellt Anfrage
app.post('/termine/anfragen', (req, res) => {
  const { benutzer_id, termin_id } = req.body;
  db.query(
    `SELECT * FROM Termin WHERE benutzer_id = ? AND zeitdatum >= NOW() AND status IN ('gebucht', 'angefragt')`,
    [benutzer_id],
    (err, r) => {
      if (err) return res.status(500).json({ error: 'Datenbankfehler' });
      if (r.length > 0) {
        const status = r[0].status === 'angefragt' ? 'eine offene Anfrage' : 'einen gebuchten Termin';
        return res.status(400).json({ error: `Du hast bereits ${status}` });
      }
      db.query(
        `UPDATE Termin SET benutzer_id = ?, status = 'angefragt', absage_grund = NULL
         WHERE termin_id = ? AND status = 'offen'`,
        [benutzer_id, termin_id],
        (err, result) => {
          if (err) return res.status(500).json({ error: 'Datenbankfehler' });
          if (result.affectedRows === 0)
            return res.status(400).json({ error: 'Termin nicht mehr verfügbar' });
          db.query(`DELETE FROM Warteliste WHERE benutzer_id = ? AND termin_id = ?`, [benutzer_id, termin_id]);
          broadcast({ typ: 'update' });
          res.json({ message: 'Anfrage gesendet – warte auf Bestätigung des Friseurs' });
        }
      );
    }
  );
});

// Kunde zieht Anfrage zurück
app.put('/termine/anfrage-zurueckziehen/:id', (req, res) => {
  const { benutzer_id } = req.body;
  db.query(
    `UPDATE Termin SET status = 'offen', benutzer_id = NULL
     WHERE termin_id = ? AND benutzer_id = ? AND status = 'angefragt'`,
    [req.params.id, benutzer_id],
    (err, result) => {
      if (err) return res.status(500).json({ error: 'Datenbankfehler' });
      if (result.affectedRows === 0)
        return res.status(400).json({ error: 'Anfrage konnte nicht zurückgezogen werden' });
      broadcast({ typ: 'update' });
      res.json({ message: 'Anfrage zurückgezogen' });
    }
  );
});

// Kunde sagt bestätigten Termin ab (min. 24h vorher)
app.put('/termine/absagen/:id', (req, res) => {
  const { benutzer_id } = req.body;
  db.query(
    `UPDATE Termin SET status = 'offen', benutzer_id = NULL, absage_grund = NULL
     WHERE termin_id = ? AND benutzer_id = ? AND status = 'gebucht'
       AND zeitdatum > DATE_ADD(NOW(), INTERVAL 24 HOUR)`,
    [req.params.id, benutzer_id],
    (err, result) => {
      if (err) return res.status(500).json({ error: 'Datenbankfehler' });
      if (result.affectedRows === 0)
        return res.status(400).json({ error: 'Absage nicht möglich (zu kurzfristig oder falscher Status)' });
      db.query(`SELECT * FROM Warteliste WHERE termin_id = ? ORDER BY erstellt_am ASC LIMIT 1`, [req.params.id], (err, w) => {
        if (!err && w.length > 0) {
          db.query(
            `UPDATE Termin SET benutzer_id = ?, status = 'angefragt' WHERE termin_id = ?`,
            [w[0].benutzer_id, req.params.id]
          );
          db.query(`DELETE FROM Warteliste WHERE id = ?`, [w[0].id]);
        }
      });
      broadcast({ typ: 'update' });
      res.json({ message: 'Termin abgesagt' });
    }
  );
});

app.post('/warteliste', (req, res) => {
  const { benutzer_id, termin_id } = req.body;
  db.query(`INSERT INTO Warteliste (benutzer_id, termin_id) VALUES (?, ?)`, [benutzer_id, termin_id],
    err => {
      if (err) return res.status(500).json({ error: 'Bereits auf der Warteliste' });
      res.json({ message: 'Du bist auf der Warteliste' });
    }
  );
});

app.delete('/warteliste', (req, res) => {
  const { benutzer_id, termin_id } = req.body;
  db.query(`DELETE FROM Warteliste WHERE benutzer_id = ? AND termin_id = ?`, [benutzer_id, termin_id],
    err => {
      if (err) return res.status(500).json({ error: 'Datenbankfehler' });
      res.json({ message: 'Von Warteliste entfernt' });
    }
  );
});

// ─── ADMIN ────────────────────────────────────────────────────────────────────

app.get('/admin/termine', (req, res) => {
  const { von, bis, status } = req.query;
  let q = `SELECT t.*, b.vorname, b.nachname FROM Termin t
           LEFT JOIN Benutzer b ON t.benutzer_id = b.benutzer_id WHERE 1=1`;
  const p = [];
  if (von) { q += ' AND t.zeitdatum >= ?'; p.push(von); }
  if (bis) { q += ' AND t.zeitdatum <= ?'; p.push(bis); }
  if (status && status !== 'alle') { q += ' AND t.status = ?'; p.push(status); }
  q += ' ORDER BY t.zeitdatum ASC';
  db.query(q, p, (err, r) => { if (err) return res.status(500).json({ error: 'Datenbankfehler' }); res.json(r); });
});

app.post('/admin/termine', (req, res) => {
  const { zeitdatum } = req.body;
  db.query(`INSERT INTO Termin (zeitdatum, status) VALUES (?, 'offen')`, [zeitdatum], err => {
    if (err) return res.status(500).json({ error: 'Datenbankfehler' });
    broadcast({ typ: 'update' });
    res.json({ message: 'Termin erstellt' });
  });
});

app.post('/admin/termine/batch', (req, res) => {
  const { vonDatum, bisDatum, vonUhr, bisUhr, intervall } = req.body;
  if (!vonDatum || !bisDatum || !vonUhr || !bisUhr || !intervall)
    return res.status(400).json({ error: 'Alle Felder erforderlich' });
  const slots = [];
  const end = new Date(bisDatum); end.setHours(23, 59, 59);
  const [vonH, vonM] = vonUhr.split(':').map(Number);
  const [bisH, bisM] = bisUhr.split(':').map(Number);
  for (let d = new Date(vonDatum); d <= end; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    let cur = vonH * 60 + vonM;
    const bisMin = bisH * 60 + bisM;
    while (cur + Number(intervall) <= bisMin) {
      const dt = new Date(d);
      dt.setHours(Math.floor(cur / 60), cur % 60, 0, 0);
      slots.push(dt.toISOString().slice(0, 19).replace('T', ' '));
      cur += Number(intervall);
    }
  }
  if (slots.length === 0)
    return res.status(400).json({ error: 'Keine Slots generiert – Intervall zu groß oder Zeitraum zu kurz' });
  const values = slots.map(s => `('${s}', 'offen')`).join(', ');
  db.query(`INSERT IGNORE INTO Termin (zeitdatum, status) VALUES ${values}`, err => {
    if (err) return res.status(500).json({ error: 'Datenbankfehler' });
    broadcast({ typ: 'update' });
    res.json({ message: `${slots.length} Termine erstellt` });
  });
});

// BUG FIX: Admin bestätigt Anfrage – Status-Check war korrekt, aber Notiz-Handling verbessert
app.put('/admin/termine/:id/bestaetigen', (req, res) => {
  const { notiz } = req.body;
  db.query(
    `UPDATE Termin SET status = 'gebucht', absage_grund = NULL, notiz = COALESCE(?, notiz)
     WHERE termin_id = ? AND status = 'angefragt'`,
    [notiz || null, req.params.id],
    (err, result) => {
      if (err) return res.status(500).json({ error: 'Datenbankfehler' });
      if (result.affectedRows === 0)
        return res.status(400).json({ error: 'Kein angefragt-Termin gefunden' });
      broadcast({ typ: 'update' });
      res.json({ message: 'Termin bestätigt' });
    }
  );
});

// BUG FIX: Admin lehnt Anfrage ab – benutzer_id bleibt erhalten damit Kunde Benachrichtigung sieht
app.put('/admin/termine/:id/ablehnen', (req, res) => {
  const { absage_grund } = req.body;
  db.query(
    `UPDATE Termin SET status = 'abgelehnt', absage_grund = ?
     WHERE termin_id = ? AND status = 'angefragt'`,
    [absage_grund || null, req.params.id],
    (err, result) => {
      if (err) return res.status(500).json({ error: 'Datenbankfehler' });
      if (result.affectedRows === 0)
        return res.status(400).json({ error: 'Kein angefragt-Termin gefunden' });
      broadcast({ typ: 'update' });
      res.json({ message: 'Anfrage abgelehnt' });
    }
  );
});

// BUG FIX: Admin sagt gebuchten Termin ab
// - Status wird auf 'abgesagt' gesetzt (NICHT 'offen' – der Slot bleibt gesperrt mit Grund sichtbar für Kunden)
// - benutzer_id bleibt erhalten damit der Kunde die Benachrichtigung sieht
// - absage_grund wird gespeichert
app.put('/admin/termine/:id/absagen', (req, res) => {
  const { absage_grund } = req.body;
  db.query(
    `UPDATE Termin SET status = 'abgesagt', absage_grund = ?
     WHERE termin_id = ? AND status = 'gebucht'`,
    [absage_grund || null, req.params.id],
    (err, result) => {
      if (err) {
        console.error('Absagen SQL Fehler:', err);
        return res.status(500).json({ error: 'Datenbankfehler: ' + err.message });
      }
      if (result.affectedRows === 0)
        return res.status(400).json({ error: 'Kein gebuchter Termin gefunden' });
      broadcast({ typ: 'update' });
      res.json({ message: 'Termin abgesagt' });
    }
  );
});

// Admin: allgemeines PUT (Datum/Zeit/Notiz bearbeiten)
app.put('/admin/termine/:id', (req, res) => {
  const { zeitdatum, notiz } = req.body;
  const felder = [];
  const werte = [];
  if (zeitdatum !== undefined) { felder.push('zeitdatum = ?'); werte.push(zeitdatum); }
  if (notiz !== undefined) { felder.push('notiz = ?'); werte.push(notiz); }
  if (felder.length === 0) return res.status(400).json({ error: 'Keine Änderungen übergeben' });
  werte.push(req.params.id);
  db.query(`UPDATE Termin SET ${felder.join(', ')} WHERE termin_id = ?`, werte, (err) => {
    if (err) return res.status(500).json({ error: 'Datenbankfehler' });
    broadcast({ typ: 'update' });
    res.json({ message: 'Termin aktualisiert' });
  });
});

// BUG FIX: Alte Termine löschen – nur wirklich vergangene, offene Slots löschen
// Abgesagte/abgelehnte Termine mit benutzer_id bleiben noch 7 Tage für Benachrichtigungen
app.delete('/admin/termine/alt/alle', (req, res) => {
  db.query(
    `DELETE FROM Termin
     WHERE zeitdatum < NOW()
       AND (
         status = 'offen'
         OR (status IN ('abgesagt', 'abgelehnt') AND zeitdatum < DATE_SUB(NOW(), INTERVAL 7 DAY))
       )`,
    (err, result) => {
      if (err) return res.status(500).json({ error: 'Datenbankfehler' });
      if (result.affectedRows > 0) broadcast({ typ: 'update' });
      res.json({
        message: `${result.affectedRows} alte Termine gelöscht`,
        deleted: result.affectedRows
      });
    }
  );
});

// BUG FIX: Termin löschen – wenn Termin gebucht/abgesagt war, Kunde per Status benachrichtigen
// Statt sofort löschen: erst auf 'abgesagt' setzen wenn jemand gebucht hatte, damit Kunde es sieht
// Dann nach 7 Tagen automatisch weggeräumt durch den alten-Termine-Job
app.delete('/admin/termine/:id', (req, res) => {
  // Erst prüfen ob ein Kunde betroffen ist
  db.query(`SELECT * FROM Termin WHERE termin_id = ?`, [req.params.id], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Datenbankfehler' });
    if (rows.length === 0) return res.status(404).json({ error: 'Termin nicht gefunden' });

    const termin = rows[0];

    // Wenn Termin gebucht war → erst als abgesagt markieren damit Kunde es sieht
    if (termin.status === 'gebucht' && termin.benutzer_id) {
      db.query(
        `UPDATE Termin SET status = 'abgesagt', absage_grund = 'Termin wurde vom Friseur gelöscht'
         WHERE termin_id = ?`,
        [req.params.id],
        (err) => {
          if (err) return res.status(500).json({ error: 'Datenbankfehler' });
          broadcast({ typ: 'update' });
          res.json({ message: 'Termin als abgesagt markiert (Kunde wird benachrichtigt)' });
        }
      );
    } else if (termin.status === 'angefragt' && termin.benutzer_id) {
      // Anfrage war offen → als abgelehnt markieren
      db.query(
        `UPDATE Termin SET status = 'abgelehnt', absage_grund = 'Termin wurde vom Friseur entfernt'
         WHERE termin_id = ?`,
        [req.params.id],
        (err) => {
          if (err) return res.status(500).json({ error: 'Datenbankfehler' });
          broadcast({ typ: 'update' });
          res.json({ message: 'Termin gelöscht (Kunde wird benachrichtigt)' });
        }
      );
    } else {
      // Kein Kunde betroffen → direkt löschen
      db.query(`DELETE FROM Termin WHERE termin_id = ?`, [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: 'Datenbankfehler' });
        broadcast({ typ: 'update' });
        res.json({ message: 'Termin gelöscht' });
      });
    }
  });
});

app.get('/admin/benutzer', (req, res) => {
  db.query(`SELECT benutzer_id, vorname, nachname, typ FROM Benutzer ORDER BY nachname, vorname`,
    (err, r) => { if (err) return res.status(500).json({ error: 'Datenbankfehler' }); res.json(r); }
  );
});

app.put('/admin/passwort-reset/:id', async (req, res) => {
  const { neuesPasswort } = req.body;
  if (!neuesPasswort || neuesPasswort.length < 4)
    return res.status(400).json({ error: 'Passwort mindestens 4 Zeichen' });
  const hash = await bcrypt.hash(neuesPasswort, 10);
  db.query(`UPDATE Benutzer SET passwort = ? WHERE benutzer_id = ?`, [hash, req.params.id], (err, result) => {
    if (err) return res.status(500).json({ error: 'Datenbankfehler' });
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    res.json({ message: 'Passwort erfolgreich geändert' });
  });
});

server.listen(3000, '0.0.0.0', () => console.log('Server läuft auf http://localhost:3000'));