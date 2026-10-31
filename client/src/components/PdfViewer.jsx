import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';
import 'pdfjs-dist/web/pdf_viewer.css';
import TranslatePopup from './TranslatePopup.jsx';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const WORD_RE = /([A-Za-z][A-Za-z'’-]*)/g;

/** 将已保存的生词在文字层中高亮，并挂上悬停释义 */
function highlightWords(root, wordsMap) {
  root.querySelectorAll('.textLayer span').forEach((span) => {
    const original = span.dataset.originalText ?? span.textContent;
    if (!original) return;
    span.dataset.originalText = original;
    if (wordsMap.size === 0) {
      span.textContent = original;
      return;
    }
    const frag = document.createDocumentFragment();
    let last = 0;
    let m;
    WORD_RE.lastIndex = 0;
    while ((m = WORD_RE.exec(original)) !== null) {
      if (m.index > last) frag.appendChild(document.createTextNode(original.slice(last, m.index)));
      const token = m[0];
      const trans = wordsMap.get(token.toLowerCase());
      if (trans) {
        const mark = document.createElement('mark');
        mark.className = 'saved-word';
        mark.dataset.trans = trans;
        mark.textContent = token;
        frag.appendChild(mark);
      } else {
        frag.appendChild(document.createTextNode(token));
      }
      last = m.index + token.length;
    }
    if (last < original.length) frag.appendChild(document.createTextNode(original.slice(last)));
    span.replaceChildren(frag);
  });
}

export default function PdfViewer({ paperId, savedWords, onWordAdded, currentPage, onPageChange, initialPage = 1, onProgress, onSelection }) {
  const scrollRef = useRef(null);
  const pagesRef = useRef([]);
  const baseScaleRef = useRef(null);
  const renderTokenRef = useRef(0);
  const popupRef = useRef(null);
  const [numPages, setNumPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [popup, setPopup] = useState(null);

  const renderAllPages = useCallback(async (pdf, zoomFactor) => {
    const container = scrollRef.current;
    if (!container) return;
    const token = ++renderTokenRef.current;
    container.querySelectorAll('.pdf-page').forEach((el) => el.remove());
    pagesRef.current = [];

    // 以容器宽度计算基准缩放（只算一次）
    if (baseScaleRef.current == null) {
      const first = await pdf.getPage(1);
      const vp1 = first.getViewport({ scale: 1 });
      const available = Math.max(container.clientWidth - 48, 320);
      baseScaleRef.current = available / vp1.width;
    }
    const base = baseScaleRef.current;

    for (let i = 1; i <= pdf.numPages; i++) {
      if (token !== renderTokenRef.current) return; // 已被新一次渲染取代
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: base * zoomFactor });
      const pageDiv = document.createElement('div');
      pageDiv.className = 'pdf-page';
      pageDiv.dataset.pageNum = String(i);
      pageDiv.style.width = `${viewport.width}px`;
      pageDiv.style.height = `${viewport.height}px`;

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      pageDiv.appendChild(canvas);

      const textDiv = document.createElement('div');
      textDiv.className = 'textLayer';
      textDiv.style.width = `${viewport.width}px`;
      textDiv.style.height = `${viewport.height}px`;
      textDiv.style.setProperty('--scale-factor', String(viewport.scale));
      pageDiv.appendChild(textDiv);

      container.appendChild(pageDiv);
      pagesRef.current.push(pageDiv);

      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      if (token !== renderTokenRef.current) return;
      const textContent = await page.getTextContent();
      await pdfjsLib.renderTextLayer({
        textContentSource: textContent,
        container: textDiv,
        viewport
      }).promise;
      if (token !== renderTokenRef.current) return;
      setNumPages(i);
    }
  }, []);

  // 加载并渲染 PDF
  useEffect(() => {
    baseScaleRef.current = null;
    setNumPages(0);
    setError('');
    if (!paperId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/papers/${paperId}/file`);
        if (!res.ok) throw new Error('加载 PDF 失败');
        const data = new Uint8Array(await res.arrayBuffer());
        const pdf = await pdfjsLib.getDocument({ data }).promise;
        if (cancelled) return;
        await renderAllPages(pdf, zoom);
        if (cancelled) return;
        // 定位到上次阅读页
        const target = pagesRef.current.find(
          (el) => Number(el.dataset.pageNum) === initialPage
        );
        if (target && initialPage > 1) target.scrollIntoView();
        if (!cancelled) setLoading(false);
      } catch (err) {
        if (!cancelled) { setError(String(err.message || err)); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperId]);

  // 向上上报阅读进度
  useEffect(() => {
    if (!loading && numPages > 0 && paperId) {
      onProgress?.(currentPage, numPages);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, numPages, loading]);

  // 缩放
  const changeZoom = (delta) => {
    setZoom((z) => {
      const next = Math.min(2.5, Math.max(0.5, +(z + delta).toFixed(2)));
      if (next === z) return z;
      (async () => {
        setLoading(true);
        const res = await fetch(`/api/papers/${paperId}/file`);
        const data = new Uint8Array(await res.arrayBuffer());
        const pdf = await pdfjsLib.getDocument({ data }).promise;
        await renderAllPages(pdf, next);
        setLoading(false);
      })();
      return next;
    });
  };

  // 生词高亮
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const map = new Map(savedWords.map((w) => [w.word.toLowerCase(), w.translation || w.phonetic || '']));
    highlightWords(root, map);
  }, [savedWords, numPages, zoom, loading]);

  // 划词 / 双击取词
  const handleMouseUp = (e) => {
    if (popupRef.current && popupRef.current.contains(e.target)) return;
    const sel = window.getSelection();
    const text = sel ? sel.toString().trim() : '';
    // 任意长度划选都上报（供 AI 对话选段使用）
    if (text && /\S/.test(text)) onSelection?.(text);
    if (!text || !/[A-Za-z]/.test(text) || text.length > 120) return;
    let x = e.clientX, y = e.clientY;
    if (sel.rangeCount > 0) {
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) { x = rect.left; y = rect.bottom + 6; }
    }
    setPopup({ text, x, y });
  };

  // 点击弹窗外关闭
  useEffect(() => {
    if (!popup) return;
    const onDown = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) setPopup(null);
    };
    const onKey = (e) => { if (e.key === 'Escape') setPopup(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [popup]);

  // 当前页码追踪
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const mid = container.getBoundingClientRect().top + 80;
        let best = currentPage;
        let bestDist = Infinity;
        for (const el of pagesRef.current) {
          const r = el.getBoundingClientRect();
          const d = Math.abs(r.top - mid);
          if (d < bestDist) { bestDist = d; best = Number(el.dataset.pageNum); }
        }
        if (best !== currentPage) onPageChange(best);
      });
    };
    container.addEventListener('scroll', onScroll);
    return () => container.removeEventListener('scroll', onScroll);
  }, [currentPage, onPageChange]);

  const savedWordSet = new Set(savedWords.map((w) => w.word.toLowerCase()));

  return (
    <div className="pdf-viewer">
      <div className="viewer-toolbar">
        <span className="page-indicator">第 {currentPage} / {numPages} 页</span>
        <div className="zoom-controls">
          <button className="btn btn-sm" onClick={() => changeZoom(-0.15)}>-</button>
          <span className="zoom-label">{Math.round(zoom * 100)}%</span>
          <button className="btn btn-sm" onClick={() => changeZoom(0.15)}>+</button>
        </div>
        <span className="toolbar-hint">双击或划选单词即可翻译</span>
      </div>
      <div className="pdf-scroll" ref={scrollRef} onMouseUp={handleMouseUp}>
        {!paperId && <div className="viewer-empty">上传一篇 PDF 论文开始阅读</div>}
        {loading && <div className="viewer-loading">正在加载…</div>}
        {error && <div className="viewer-error">{error}</div>}
      </div>
      {popup && (
        <TranslatePopup
          ref={popupRef}
          text={popup.text}
          x={popup.x}
          y={popup.y}
          paperId={paperId}
          savedWordSet={savedWordSet}
          onAdd={onWordAdded}
          onClose={() => setPopup(null)}
        />
      )}
    </div>
  );
}
