import React, { useRef } from 'react';

const STATUS = [
  { value: 'unread', label: '未读', cls: 'st-unread' },
  { value: 'reading', label: '在读', cls: 'st-reading' },
  { value: 'read', label: '已读', cls: 'st-read' }
];

const fmtTime = (ts) =>
  ts ? new Date(ts.replace(' ', 'T')).toLocaleString('zh-CN', { hour12: false }) : '—';

export default function PaperLibrary({ papers, onOpen, onUpload, onDelete, onStatusChange, aiConfigured, onOpenSettings }) {
  const fileInputRef = useRef(null);

  const handleUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
    e.target.value = '';
  };

  return (
    <div className="library">
      <header className="library-header">
        <div>
          <h1 className="library-title">论文库</h1>
          <p className="library-sub">
            共 {papers.length} 篇 · 在读 {papers.filter((p) => p.status === 'reading').length} ·
            已读 {papers.filter((p) => p.status === 'read').length}
          </p>
        </div>
        <div className="library-header-actions">
          <button className="btn" onClick={onOpenSettings} title="全局 AI 配置（对所有论文生效）">
            AI 设置
            <span className={aiConfigured ? 'ai-dot ok' : 'ai-dot'} title={aiConfigured ? 'AI 已配置' : 'AI 未配置'} />
          </button>
          <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>
            上传 PDF
          </button>
        </div>
        <input ref={fileInputRef} type="file" accept="application/pdf" hidden onChange={handleUpload} />
      </header>

      {papers.length === 0 ? (
        <div className="library-empty">
          <div className="library-empty-icon">📚</div>
          <p>还没有论文，点击右上角「上传 PDF」开始阅读</p>
        </div>
      ) : (
        <div className="library-table-wrap">
          <table className="library-table">
            <thead>
              <tr>
                <th>论文</th>
                <th>阅读状态</th>
                <th>进度</th>
                <th>笔记</th>
                <th>生词</th>
                <th>最后阅读</th>
                <th>添加时间</th>
                <th className="th-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              {papers.map((p) => {
                const st = STATUS.find((s) => s.value === p.status) || STATUS[0];
                const pct =
                  p.total_pages > 0
                    ? Math.min(100, Math.round((p.last_page / p.total_pages) * 100))
                    : 0;
                return (
                  <tr key={p.id} className="lib-row">
                    <td className="td-name" onClick={() => onOpen(p.id)}>
                      {p.bvid && <span className="video-flag" title="已关联讲解视频">▶</span>}
                      {p.name}
                    </td>
                    <td>
                      <select
                        className={`status-select ${st.cls}`}
                        value={p.status}
                        onChange={(e) => onStatusChange(p.id, e.target.value)}
                      >
                        {STATUS.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="td-progress">
                      {p.total_pages > 0 ? (
                        <>
                          <div className="progress-bar">
                            <div className="progress-fill" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="progress-text">
                            {p.last_page}/{p.total_pages} 页
                          </span>
                        </>
                      ) : (
                        <span className="progress-text">—</span>
                      )}
                    </td>
                    <td className="td-count">{p.note_count}</td>
                    <td className="td-count">{p.word_count}</td>
                    <td className="td-time">{fmtTime(p.last_read_at)}</td>
                    <td className="td-time">{fmtTime(p.created_at)}</td>
                    <td className="td-actions">
                      <button className="btn btn-sm" onClick={() => onOpen(p.id)}>
                        {p.status === 'unread' ? '开始阅读' : '继续阅读'}
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => onDelete(p.id, p.name)}
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
