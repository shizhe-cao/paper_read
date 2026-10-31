import React, { useState } from 'react';
import { videoPageUrl } from '../bili.js';

export default function VideoPanel({ paperId, bvid, onVideoChange, videoVisible, onToggleVisible }) {
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!url.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/papers/${paperId}/video`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '关联失败');
      } else {
        setUrl('');
        setEditing(false);
        onVideoChange?.(data.bvid);
      }
    } catch {
      setError('网络错误，请重试');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm('确定取消关联该视频吗？')) return;
    await fetch(`/api/papers/${paperId}/video`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: '' })
    });
    setEditing(false);
    onVideoChange?.(null);
  };

  if (!paperId) return null;

  // 未关联或编辑中：显示输入框
  if (!bvid || editing) {
    return (
      <div className="video-panel">
        <div className="video-head">
          <span className="video-title">{bvid ? '更换讲解视频' : '关联 B 站讲解视频'}</span>
          {bvid && editing && (
            <button className="btn btn-sm" onClick={() => setEditing(false)}>取消</button>
          )}
        </div>
        <div className="video-input-row">
          <input
            className="video-input"
            placeholder="粘贴 B 站视频链接或 BV 号"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          />
          <button className="btn btn-sm btn-primary" onClick={submit} disabled={busy || !url.trim()}>
            {busy ? '关联中…' : '关联'}
          </button>
        </div>
        {error && <div className="video-error">{error}</div>}
      </div>
    );
  }

  // 已关联视频：控制条（播放器为可拖动悬浮窗）
  return (
    <div className="video-panel">
      <div className="video-head">
        <span className="video-title">讲解视频</span>
        <span className="video-actions">
          <button className="btn btn-sm" onClick={onToggleVisible}>
            {videoVisible ? '隐藏浮窗' : '显示浮窗'}
          </button>
          <button className="btn btn-sm" onClick={() => setEditing(true)}>更换</button>
          <button className="btn btn-sm btn-danger" onClick={remove}>移除</button>
        </span>
      </div>
      <a className="video-link" href={videoPageUrl(bvid)} target="_blank" rel="noreferrer">
        在 B 站打开 ↗
      </a>
    </div>
  );
}
