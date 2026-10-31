import React, { useCallback, useEffect, useRef, useState } from 'react';
import PaperLibrary from './components/PaperLibrary.jsx';
import PdfViewer from './components/PdfViewer.jsx';
import NotesPanel from './components/NotesPanel.jsx';
import WordsPanel from './components/WordsPanel.jsx';
import VideoPanel from './components/VideoPanel.jsx';
import FloatingVideo from './components/FloatingVideo.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import AiSettingsModal from './components/AiSettingsModal.jsx';

export default function App() {
  const [view, setView] = useState('library'); // library | reader
  const [papers, setPapers] = useState([]);
  const [currentPaperId, setCurrentPaperId] = useState(null);
  const [words, setWords] = useState([]);
  const [tab, setTab] = useState('notes');
  const [currentPage, setCurrentPage] = useState(1);
  const [videoVisible, setVideoVisible] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [lastSelection, setLastSelection] = useState('');

  const progressTimerRef = useRef(null);
  const lastProgressRef = useRef({ page: 1, total: 0 });

  const loadPapers = useCallback(async () => {
    const res = await fetch('/api/papers');
    setPapers(await res.json());
  }, []);

  useEffect(() => { loadPapers(); }, [loadPapers]);

  // 全局 AI 配置状态（对所有论文生效）
  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((s) => setAiConfigured(Boolean(s.ai_api_key_set)))
      .catch(() => {});
  }, [showSettings]); // 关闭设置弹窗后刷新状态

  const loadWords = useCallback(async (paperId) => {
    if (!paperId) { setWords([]); return; }
    const res = await fetch(`/api/papers/${paperId}/words`);
    setWords(await res.json());
  }, []);

  useEffect(() => { loadWords(currentPaperId); }, [currentPaperId, loadWords]);

  const currentPaper = papers.find((p) => p.id === currentPaperId);

  /* ---------------- 进度上报（防抖） ---------------- */
  const sendProgress = useCallback((paperId, page, total) => {
    if (!paperId) return;
    fetch(`/api/papers/${paperId}/progress`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page, totalPages: total })
    }).then(() => loadPapers());
  }, [loadPapers]);

  const handleProgress = useCallback((page, total) => {
    lastProgressRef.current = { page, total };
    if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
    const pid = currentPaperId;
    progressTimerRef.current = setTimeout(() => {
      const { page: p, total: t } = lastProgressRef.current;
      sendProgress(pid, p, t);
    }, 1500);
  }, [currentPaperId, sendProgress]);

  const flushProgress = useCallback(() => {
    if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
    const { page, total } = lastProgressRef.current;
    if (currentPaperId) sendProgress(currentPaperId, page, total);
  }, [currentPaperId, sendProgress]);

  /* ---------------- 打开 / 返回 ---------------- */
  const openPaper = async (id) => {
    const paper = papers.find((p) => p.id === id);
    setCurrentPaperId(id);
    setCurrentPage(paper?.last_page || 1);
    setView('reader');
    if (paper && paper.status === 'unread') {
      await fetch(`/api/papers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'reading' })
      });
      loadPapers();
    }
    // 上报一次进度以刷新 last_read_at
    if (paper) {
      sendProgress(id, paper.last_page || 1, paper.total_pages || 0);
    }
  };

  const backToLibrary = () => {
    flushProgress();
    setView('library');
  };

  const changeStatus = async (id, status) => {
    await fetch(`/api/papers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    loadPapers();
  };

  const handleVideoChange = async () => {
    await loadPapers();
  };

  /* ---------------- 上传 / 删除 ---------------- */
  const handleUpload = async (file) => {
    if (!file) return;
    const buf = await file.arrayBuffer();
    const name = encodeURIComponent(file.name);
    const res = await fetch(`/api/papers?name=${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf' },
      body: buf
    });
    if (res.ok) {
      const paper = await res.json();
      await loadPapers();
      openPaper(paper.id);
    } else {
      alert('上传失败：' + (await res.json()).error);
    }
  };

  const handleDeletePaper = async (id, name) => {
    if (!confirm(`确定删除《${name}》及其所有笔记和生词吗？`)) return;
    if (id === currentPaperId) {
      if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
      setView('library');
      setCurrentPaperId(null);
    }
    await fetch(`/api/papers/${id}`, { method: 'DELETE' });
    await loadPapers();
  };

  /* ---------------- 视图渲染 ---------------- */
  if (view === 'library') {
    return (
      <div className="app">
        <PaperLibrary
          papers={papers}
          onOpen={openPaper}
          onUpload={handleUpload}
          onDelete={handleDeletePaper}
          onStatusChange={changeStatus}
          aiConfigured={aiConfigured}
          onOpenSettings={() => setShowSettings(true)}
        />
        {showSettings && (
          <AiSettingsModal
            onClose={() => setShowSettings(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-left">
          <button className="btn btn-sm" onClick={backToLibrary}>← 论文库</button>
          <span className="topbar-title">{currentPaper?.name || '阅读中'}</span>
          {currentPaper && (
            <span className={`status-badge status-badge-${currentPaper.status}`}>
              {{ unread: '未读', reading: '在读', read: '已读' }[currentPaper.status]}
            </span>
          )}
        </div>
        <div className="topbar-actions">
          <select
            className="status-select"
            value={currentPaper?.status || 'unread'}
            onChange={(e) => changeStatus(currentPaperId, e.target.value)}
          >
            <option value="unread">未读</option>
            <option value="reading">在读</option>
            <option value="read">已读</option>
          </select>
          <button
            className="btn"
            onClick={() => changeStatus(currentPaperId, currentPaper?.status === 'read' ? 'reading' : 'read')}
          >
            {currentPaper?.status === 'read' ? '标记为在读' : '标记为已读'}
          </button>
          <button
            className="btn btn-danger"
            onClick={() => handleDeletePaper(currentPaperId, currentPaper?.name || '这篇论文')}
          >
            删除
          </button>
        </div>
      </header>
      <main className="main">
        <section className="viewer-area">
          <PdfViewer
            key={currentPaperId ?? 'none'}
            paperId={currentPaperId}
            savedWords={words}
            onWordAdded={() => loadWords(currentPaperId)}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            initialPage={currentPaper?.last_page || 1}
            onProgress={handleProgress}
            onSelection={setLastSelection}
          />
        </section>
        <aside className="sidebar">
          <VideoPanel
            paperId={currentPaperId}
            bvid={currentPaper?.bvid || null}
            onVideoChange={handleVideoChange}
            videoVisible={videoVisible}
            onToggleVisible={() => setVideoVisible((v) => !v)}
          />
          <div className="sidebar-tabs">
            <button className={tab === 'notes' ? 'tab active' : 'tab'} onClick={() => setTab('notes')}>
              笔记
            </button>
            <button className={tab === 'words' ? 'tab active' : 'tab'} onClick={() => setTab('words')}>
              生词本 ({words.length})
            </button>
            <button className={tab === 'chat' ? 'tab active' : 'tab'} onClick={() => setTab('chat')}>
              AI 对话
            </button>
          </div>
          {tab === 'notes' ? (
            <NotesPanel paperId={currentPaperId} currentPage={currentPage} />
          ) : tab === 'words' ? (
            <WordsPanel words={words} onRefresh={() => loadWords(currentPaperId)} />
          ) : (
            <ChatPanel paperId={currentPaperId} currentPage={currentPage} selectionText={lastSelection} />
          )}
        </aside>
      </main>
      {currentPaper?.bvid && videoVisible && (
        <FloatingVideo bvid={currentPaper.bvid} onHide={() => setVideoVisible(false)} />
      )}
    </div>
  );
}
