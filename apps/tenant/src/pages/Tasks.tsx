import { useEffect, useState } from "react";
import { api, type Task } from "../api";
import { pageTitle, table, th, td, Badge, btn, btnPrimary, input, card } from "../ui";

export function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");

  const load = () => api.tasks("pending").then((r) => setTasks(r.tasks)).catch((e) => setError(String(e)));
  useEffect(() => { void load(); }, []);

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await api.createTask({ title, type: "general" });
    setTitle("");
    load();
  }

  async function complete(id: string) {
    await api.completeTask(id);
    load();
  }

  if (error) return <p style={{ color: "#b91c1c" }}>{error}</p>;

  return (
    <div>
      <h1 style={pageTitle}>Tasks</h1>
      <form onSubmit={addTask} style={{ ...card, display: "flex", gap: "0.6rem", marginBottom: "1.5rem" }}>
        <input style={{ ...input, flex: 1 }} placeholder="New task…" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button type="submit" style={btnPrimary}>
          Add
        </button>
      </form>
      <table style={table}>
        <thead>
          <tr>
            <th style={th}>Title</th>
            <th style={th}>Type</th>
            <th style={th}>Due</th>
            <th style={th}></th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id}>
              <td style={td}>{t.title}</td>
              <td style={td}>
                <Badge color="#6b7280">{t.type.replace("_", " ")}</Badge>
              </td>
              <td style={td}>{t.due_at ? new Date(t.due_at).toLocaleString() : "—"}</td>
              <td style={td}>
                <button style={btn} onClick={() => complete(t.id)}>
                  Mark done
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {tasks.length === 0 && <p style={{ color: "#6b7280", marginTop: "1rem" }}>Nothing pending — job reminders show up here automatically the day before a booking.</p>}
    </div>
  );
}
