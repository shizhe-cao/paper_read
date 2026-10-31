import React, { useEffect, useState } from 'react';

export default function NotesPanel({ paperId, currentPage }) {
  const [notes, setNotes] = useState([]);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');

  const load = async () => {
    if (!paperId) { setNotes([]); return; }
    const res = await fetch(`/api/papers/${paperId}/notes`);
    setNotes(await res.json());
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [paperId]);

  const addNote = async () => {
    const content = draft.trim();
    if (!content || !paperId) return;
    await fetch(`/api/papers/${paperId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page: currentPage, content })
    });
    setDraft('');
    load();
  };

  const saveEdit = async (id) => {
    const content = editText.trim();
    if (!content) return;
    await fetch(`/api/notes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    setEditingId(null);
    load();
  };

  const deleteNote = async (id) => {
    await fetch(`/api/notes/${id}`, { method: 'DELETE' });
    load();
  };

  const formatTime = (ts) => new Date(ts).toLocaleString('zh-CN', { hour12: false });

  return (
    <div className="notes-panel">
      <div className="note-composer">
        <textarea
          placeholder={`在第 ${currentPage} 页记录笔记…`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
        />
        <button className="btn btn-primary" onClick={addNote} disabled={!draft.trim()}>
          添加笔记（第 {currentPage} 页）
        </button>
      </div>
      <div className="notes-list">
        {!paperId && <div className="panel-empty">请先选择论文</div>}
        {paperId && notes.length === 0 && <div className="panel-empty">暂无笔记</div>}
        {notes.map((n) => (
          <div className="note-card" key={n.id}>
            <div className="note-meta">
              <span className="note-page">第 {n.page} 页</span>
              <span className="note-time">{formatTime(n.updated_at || n.created_at)}</span>
              <span className="note-actions">
                {editingId === n.id ? (
                  <>
                    <button className="btn btn-sm" onClick={() => saveEdit(n.id)}>保存</button>
                    <button className="btn btn-sm" onClick={() => setEditingId(null)}>取消</button>
                  </>
                ) : (
                  <>
                    <button
                      className="btn btn-sm"
                      onClick={() => { setEditingId(n.id); setEditText(n.content); }}
                    >
                      编辑
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => deleteNote(n.id)}>删除</button>
                  </>
                )}
              </span>
            </div>
            {editingId === n.id ? (
              <textarea
                className="note-edit"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={4}
              />
            ) : (
              <div className="note-content">{n.content}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
