"use client";
import { useState } from "react";

export default function BoardCard({
  board, posts, canPost,
}: {
  board: { id: string; title: string; description: string | null };
  posts: any[];
  canPost: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [title, setTitle] = useState("");
  const [list, setList] = useState(posts);
  const [busy, setBusy] = useState(false);

  async function post() {
    if (!body.trim()) return;
    setBusy(true);
    const r = await fetch("/api/bulletins", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ board_id: board.id, title, body }),
    });
    if (r.ok) {
      setList((l) => [{ title, body, author_name: "You", created_at: new Date().toISOString() }, ...l]);
      setBody(""); setTitle(""); setOpen(false);
    }
    setBusy(false);
  }

  return (
    <div className="board">
      <div className="board-h">
        <h3>{board.title}</h3>
        {canPost && (
          <button className="btn ghost post-btn" onClick={() => setOpen(!open)}>
            {open ? "Cancel" : "+ Post"}
          </button>
        )}
      </div>
      <div className="board-body">
        {open && canPost && (
          <div style={{ marginBottom: 12 }}>
            <input placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} style={{ marginBottom: 8 }} />
            <textarea placeholder="Write a post…" value={body} onChange={(e) => setBody(e.target.value)} rows={3} />
            <button className="btn" onClick={post} disabled={busy} style={{ marginTop: 8 }}>
              {busy ? "Posting…" : "Post"}
            </button>
          </div>
        )}
        {list.length === 0 && <p className="muted">No posts yet.</p>}
        {list.map((p, i) => (
          <div key={i} className="post">
            {p.title && <strong>{p.title}</strong>}
            <div>{p.body}</div>
            <div className="pmeta">{p.author_name ?? "Staff"} · {new Date(p.created_at).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
