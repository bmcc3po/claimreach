"use client";
import { useRef, useState } from "react";

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
  const [error, setError] = useState("");
  const pending = useRef(false);

  async function post() {
    if (!canPost || pending.current || !body.trim()) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const r = await fetch("/api/bulletins", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ board_id: board.id, title, body }),
      });
      const data = await r.json();
      if (!r.ok || data.ok !== true) { setError(data.error || "The post was not confirmed. Your draft is still here."); return; }
      setList((l) => [{ title, body, author_name: "You", created_at: new Date().toISOString() }, ...l]);
      setBody(""); setTitle(""); setOpen(false);
    } catch { setError("Could not confirm the post. Check the board before trying again; your draft is still here."); }
    finally { pending.current = false; setBusy(false); }
  }

  return (
    <div className="board">
      <div className="board-h">
        <h3>{board.title}</h3>
        {canPost && (
          <button className="btn ghost post-btn" disabled={busy} onClick={() => setOpen(!open)}>
            {open ? "Cancel" : "+ Post"}
          </button>
        )}
      </div>
      <div className="board-body">
        {open && canPost && (
          <fieldset disabled={busy} style={{ margin: "0 0 12px", padding: 0, border: 0, minWidth: 0 }}>
            <input aria-label="Post title" placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} style={{ marginBottom: 8 }} />
            <textarea aria-label="Post message" placeholder="Write a post…" value={body} onChange={(e) => setBody(e.target.value)} rows={3} />
            {error && <p role="alert">{error}</p>}
            <button className="btn" onClick={post} disabled={busy || !body.trim()} style={{ marginTop: 8 }}>
              {busy ? "Posting…" : "Post"}
            </button>
          </fieldset>
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
