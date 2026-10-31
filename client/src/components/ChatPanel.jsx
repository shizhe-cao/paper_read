import React, { useCallback, useEffect, useRef, useState } from 'react';

export default function ChatPanel({ paperId, currentPage, onNoteCreated, selectionText }) {
  const [sessions, setSessions] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [renamingId, setRenamingId] = useState(null);
  const [renameText, setRenameText] = useState('');
  const [creating, setCreating] = useState(false);
  const [contextDraft, setContextDraft] = useState('');
  const [contextExpanded, setContextExpanded] = useState(false);
  const listEndRef = useRef(null);

  const loadSessions = useCallback(async () => {
    if (!paperId) { setSessions([]); return; }
    const res = await fetch(`/api/papers/${paperId}/chats`);
    const list = await res.json();
    setSessions(list);
    setActiveId((prev) => (prev && list.some((s) => s.id === prev) ? prev : null));
  }, [paperId]);

  useEffect(() => {
    loadSessions();
    setMessages([]); setError(''); setNotice(''); setActiveId(null);
    setCreating(false); setContextDraft('');
  }, [paperId]);

  const openSession = async (id) => {
    setActiveId(id);
    setError('');
    setNotice('');
    const res = await fetch(`/api/chats/${id}/messages`);
    setMessages(await res.json());
  };

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const newSession = async () => {
    const res = await fetch(`/api/papers/${paperId}/chats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: contextDraft.trim() })
    });
    const s = await res.json();
    setCreating(false);
    setContextDraft('');
    await loadSessions();
    openSession(s.id);
  };

  const fillSelection = () => {
    if (selectionText) setContextDraft(selectionText);
  };

  const deleteSession = async (id) => {
    if (!confirm('确定删除该对话及其所有消息吗？')) return;
    await fetch(`/api/chats/${id}`, { method: 'DELETE' });
    if (activeId === id) { setActiveId(null); setMessages([]); }
    loadSessions();
  };

  const startRename = (s) => { setRenamingId(s.id); setRenameText(s.title); };

  const saveRename = async (id) => {
    const title = renameText.trim();
    if (title) {
      await fetch(`/api/chats/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title })
      });
    }
    setRenamingId(null);
    loadSessions();
  };

  const send = async () => {
    const content = draft.trim();
    if (!content || sending || !activeId) return;
    setSending(true);
    setError('');
    setNotice('');
    setDraft('');
    // 乐观显示用户消息
    setMessages((m) => [...m, { role: 'user', content }]);
    try {
      const res = await fetch(`/api/chats/${activeId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '发送失败');
      setMessages((m) => [...m, data.assistant]);
      loadSessions(); // 标题可能已自动更新
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setSending(false);
    }
  };

  const summarize = async () => {
    if (summarizing || messages.length === 0) return;
    if (!confirm('让 AI 把当前对话整理成一条笔记（保存到笔记面板）？')) return;
    setSummarizing(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`/api/chats/${activeId}/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page: currentPage })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '整理失败');
      setNotice('已生成笔记，可在「笔记」面板查看');
      onNoteCreated?.();
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setSummarizing(false);
    }
  };

  if (!paperId) {
    return <div className="panel-empty">请先选择论文</div>;
  }

  const activeSession = sessions.find((s) => s.id === activeId);

  // ---- 无激活会话：显示会话列表 ----
  if (!activeId) {
    return (
      <div className="chat-panel">
        <div className="chat-sessions">
          {!creating ? (
            <button className="btn btn-primary chat-new" onClick={() => { setCreating(true); if (selectionText) setContextDraft(selectionText); }}>
              + 新建对话
            </button>
          ) : (
            <div className="chat-create">
              <div className="chat-create-title">新建对话：选定要讨论的选段</div>
              <textarea
                autoFocus
                className="chat-create-textarea"
                placeholder="在左侧论文中划选一段文字，然后点击下方「填入划选内容」；或直接粘贴要讨论的选段…"
                value={contextDraft}
                rows={5}
                onChange={(e) => setContextDraft(e.target.value)}
              />
              <div className="chat-create-actions">
                <button className="btn btn-sm" onClick={fillSelection} disabled={!selectionText} title={selectionText || '先在论文中划选一段文字'}>
                  填入划选内容
                </button>
                <span className="chat-create-spacer" />
                <button className="btn btn-sm" onClick={() => { setCreating(false); setContextDraft(''); }}>取消</button>
                <button className="btn btn-sm btn-primary" onClick={newSession}>
                  创建对话
                </button>
              </div>
              {!contextDraft.trim() && (
                <div className="chat-create-hint">未绑定选段也可以创建，AI 将基于通用知识回答</div>
              )}
            </div>
          )}
          {sessions.length === 0 && !creating && (
            <div className="panel-empty">
              还没有对话。先在论文中划选一段内容，再新建对话，
              AI 将围绕这段内容与你讨论。
            </div>
          )}
          {sessions.map((s) => (
            <div className="chat-session-item" key={s.id}>
              {renamingId === s.id ? (
                <span className="chat-rename">
                  <input
                    autoFocus
                    value={renameText}
                    onChange={(e) => setRenameText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveRename(s.id);
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                  />
                  <button className="btn btn-sm" onClick={() => saveRename(s.id)}>存</button>
                </span>
              ) : (
                <>
                  <div className="chat-session-main" onClick={() => openSession(s.id)}>
                    <div className="chat-session-title">{s.title}</div>
                    {s.context ? (
                      <div className="chat-session-snippet">选段：{s.context.replace(/\s+/g, ' ').slice(0, 44)}…</div>
                    ) : (
                      <div className="chat-session-snippet no-ctx">未绑定选段</div>
                    )}
                    <div className="chat-session-time">{s.updated_at}</div>
                  </div>
                  <button className="btn btn-sm" title="重命名" onClick={() => startRename(s)}>改</button>
                  <button className="btn btn-sm btn-danger" title="删除" onClick={() => deleteSession(s.id)}>删</button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---- 聊天视图 ----
  return (
    <div className="chat-panel">
      <div className="chat-head">
        <button className="btn btn-sm" onClick={() => { setActiveId(null); setMessages([]); }}>← 对话列表</button>
        <span className="chat-head-title">{activeSession?.title}</span>
        <button
          className="btn btn-sm chat-summarize"
          onClick={summarize}
          disabled={summarizing || messages.length === 0}
          title="AI 整理当前对话为一条笔记"
        >
          {summarizing ? '整理中…' : '📄 整理为笔记'}
        </button>
      </div>
      {activeSession?.context ? (
        <div
          className="chat-context"
          onClick={() => setContextExpanded((v) => !v)}
          title={contextExpanded ? '点击收起' : '点击展开完整选段'}
        >
          <span className="chat-context-label">📌 绑定选段{contextExpanded ? '（收起）' : '：'}</span>
          {contextExpanded
            ? activeSession.context
            : activeSession.context.replace(/\s+/g, ' ').slice(0, 60) + '…'}
        </div>
      ) : (
        <div className="chat-context empty">未绑定选段（基于通用知识讨论）</div>
      )}
      <div className="chat-messages">
        {messages.map((m, i) => (
          <div className={m.role === 'user' ? 'chat-msg user' : 'chat-msg ai'} key={m.id ?? `tmp-${i}`}>
            <div className="chat-msg-role">{m.role === 'user' ? '我' : 'AI'}</div>
            <div className="chat-msg-content">{m.content}</div>
          </div>
        ))}
        {sending && <div className="chat-msg ai"><div className="chat-msg-role">AI</div><div className="chat-msg-content chat-typing">思考中…</div></div>}
        <div ref={listEndRef} />
      </div>
      {(error || notice) && (
        <div className={error ? 'chat-error' : 'chat-notice'}>{error || notice}</div>
      )}
      <div className="chat-input-row">
        <textarea
          placeholder="向 AI 提问论文内容…（Enter 发送，Shift+Enter 换行）"
          value={draft}
          rows={2}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
          }}
        />
        <button className="btn btn-primary" onClick={send} disabled={sending || !draft.trim()}>
          发送
        </button>
      </div>
    </div>
  );
}
