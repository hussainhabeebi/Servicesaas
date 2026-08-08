import { Fragment, useEffect, useState } from "react";
import { api, type Staff, type StaffAvailability } from "../api";
import { pageTitle, table, th, td, Badge, btn, btnPrimary, input, card } from "../ui";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function AvailabilityEditor({ staffId }: { staffId: string }) {
  const [rows, setRows] = useState<StaffAvailability[]>([]);
  const [day, setDay] = useState(1);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("18:00");

  const load = () => api.staffAvailability(staffId).then((r) => setRows(r.availability));
  useEffect(() => { void load(); }, [staffId]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    await api.addStaffAvailability(staffId, { day_of_week: day, start_time: startTime, end_time: endTime });
    load();
  }

  async function remove(id: string) {
    await api.deleteStaffAvailability(staffId, id);
    load();
  }

  return (
    <div style={{ padding: "0.9rem", background: "#f9fafb", borderRadius: 8 }}>
      <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#374151", marginBottom: "0.5rem" }}>Working hours</div>
      {rows.length === 0 && <p style={{ fontSize: "0.8rem", color: "#6b7280", marginBottom: "0.6rem" }}>No hours set — treated as always available.</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginBottom: "0.6rem" }}>
        {rows
          .sort((a, b) => a.day_of_week - b.day_of_week)
          .map((r) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.82rem" }}>
              <span style={{ width: 34, fontWeight: 600 }}>{DAY_LABELS[r.day_of_week]}</span>
              <span>{r.start_time} – {r.end_time}</span>
              <button onClick={() => remove(r.id)} style={{ ...btn, padding: "0.15rem 0.5rem", fontSize: "0.72rem" }}>
                Remove
              </button>
            </div>
          ))}
      </div>
      <form onSubmit={add} style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
        <select value={day} onChange={(e) => setDay(Number(e.target.value))} style={{ ...input, padding: "0.4rem 0.5rem" }}>
          {DAY_LABELS.map((d, i) => (
            <option key={d} value={i}>{d}</option>
          ))}
        </select>
        <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={{ ...input, padding: "0.4rem 0.5rem" }} />
        <span style={{ fontSize: "0.8rem" }}>to</span>
        <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={{ ...input, padding: "0.4rem 0.5rem" }} />
        <button type="submit" style={{ ...btn, padding: "0.4rem 0.7rem", fontSize: "0.78rem" }}>
          Add
        </button>
      </form>
    </div>
  );
}

/**
 * Operational crew (staff table) — distinct from Team (tenant_users logins).
 * A staff member's service_areas + working hours are what location-based
 * auto-assignment matches bookings against (see lib/staff-matching.ts).
 */
export function StaffPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [areasInput, setAreasInput] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = () => api.staff().then((r) => setStaff(r.staff)).catch((e) => setError(String(e)));
  useEffect(() => { void load(); }, []);

  async function addStaff(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const service_areas = areasInput.split(",").map((a) => a.trim()).filter(Boolean);
    await api.createStaff({ name, phone: phone || undefined, service_areas });
    setName("");
    setPhone("");
    setAreasInput("");
    load();
  }

  async function toggleActive(s: Staff) {
    await api.updateStaff(s.id, { active: !s.active });
    load();
  }

  async function updateAreas(s: Staff, text: string) {
    const service_areas = text.split(",").map((a) => a.trim()).filter(Boolean);
    await api.updateStaff(s.id, { service_areas });
    load();
  }

  if (error) return <p style={{ color: "#b91c1c" }}>{error}</p>;

  return (
    <div>
      <h1 style={pageTitle}>Staff</h1>
      <p style={{ color: "#6b7280", marginTop: "-1rem", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
        Crew members who do the on-site work. Give each one the areas they cover and their working hours, and new bookings
        auto-assign to whoever's free and local — leave areas blank to cover everywhere.
      </p>

      <form onSubmit={addStaff} style={{ ...card, display: "flex", gap: "0.6rem", marginBottom: "1.5rem", flexWrap: "wrap", alignItems: "end" }}>
        <div>
          <label style={{ fontSize: "0.78rem", display: "block", marginBottom: 3 }}>Name</label>
          <input style={input} value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label style={{ fontSize: "0.78rem", display: "block", marginBottom: 3 }}>Phone</label>
          <input style={input} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <label style={{ fontSize: "0.78rem", display: "block", marginBottom: 3 }}>Service areas (comma-separated, blank = everywhere)</label>
          <input style={{ ...input, width: "100%" }} value={areasInput} onChange={(e) => setAreasInput(e.target.value)} placeholder="Marina, JLT, Downtown" />
        </div>
        <button type="submit" style={btnPrimary}>
          Add staff
        </button>
      </form>

      <table style={table}>
        <thead>
          <tr>
            <th style={th}>Name</th>
            <th style={th}>Contact</th>
            <th style={th}>Areas</th>
            <th style={th}>Status</th>
            <th style={th}></th>
          </tr>
        </thead>
        <tbody>
          {staff.map((s) => (
            <Fragment key={s.id}>
              <tr>
                <td style={td}>
                  <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 99, background: s.color, marginRight: "0.4rem" }} />
                  {s.name}
                </td>
                <td style={td}>{s.phone ?? s.email ?? "—"}</td>
                <td style={td}>
                  {s.service_areas.length === 0 ? (
                    <Badge color="#6b7280">everywhere</Badge>
                  ) : (
                    <span style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                      {s.service_areas.map((a) => (
                        <Badge key={a} color="#036f71">{a}</Badge>
                      ))}
                    </span>
                  )}
                </td>
                <td style={td}>
                  <Badge color={s.active ? "#16a34a" : "#6b7280"}>{s.active ? "active" : "inactive"}</Badge>
                </td>
                <td style={td}>
                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    <button style={btn} onClick={() => setExpanded(expanded === s.id ? null : s.id)}>
                      {expanded === s.id ? "Close" : "Hours & areas"}
                    </button>
                    <button style={btn} onClick={() => toggleActive(s)}>
                      {s.active ? "Deactivate" : "Reactivate"}
                    </button>
                  </div>
                </td>
              </tr>
              {expanded === s.id && (
                <tr>
                  <td style={{ ...td, borderBottom: "1px solid #f3f4f6" }} colSpan={5}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                      <div>
                        <label style={{ fontSize: "0.78rem", display: "block", marginBottom: 3 }}>Service areas (comma-separated)</label>
                        <input
                          style={{ ...input, width: "100%" }}
                          defaultValue={s.service_areas.join(", ")}
                          onBlur={(e) => updateAreas(s, e.target.value)}
                          placeholder="Marina, JLT, Downtown"
                        />
                      </div>
                      <AvailabilityEditor staffId={s.id} />
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
      {staff.length === 0 && <p style={{ color: "#6b7280", marginTop: "1rem" }}>No crew added yet — as a solo operator, bookings just go unassigned.</p>}
    </div>
  );
}
