import React, { useEffect, useRef, useState } from 'react';
import { playerSrc, videoPageUrl } from '../bili.js';

const LS_KEY = 'paperRead.floatVideo';
const MIN_W = 280;
const MIN_H = 160;

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY));
    if (s && s.pos && s.size) return s;
  } catch { /* 忽略 */ }
  return null;
}

/**
 * 可拖动、可缩放的 B 站讲解视频悬浮窗
 * - 拖动标题栏移动位置
 * - 右下角手柄或 +/− 按钮缩放
 * - 位置与大小记忆在 localStorage
 */
export default function FloatingVideo({ bvid, onHide }) {
  const saved = useRef(loadState()).current;
  const [pos, setPos] = useState(
    // 默认位置避开右侧 340px 侧边栏，放在阅读区内右上角
    () => saved?.pos || { x: Math.max(16, window.innerWidth - 820), y: 80 }
  );
  const [size, setSize] = useState(() => saved?.size || { w: 420, h: 280 });
  const [interacting, setInteracting] = useState(false);

  // 持久化位置与大小
  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify({ pos, size }));
  }, [pos, size]);

  // 视口变化时保持悬浮窗在可视范围内
  useEffect(() => {
    const onResize = () => {
      setPos((p) => clampPos(p));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const clampPos = (p) => ({
    x: Math.min(Math.max(0, p.x), Math.max(0, window.innerWidth - 80)),
    y: Math.min(Math.max(0, p.y), Math.max(0, window.innerHeight - 40))
  });

  const startDrag = (e) => {
    if (e.target.closest('button, a')) return; // 点按钮时不拖动
    e.preventDefault();
    setInteracting(true);
    const startX = e.clientX;
    const startY = e.clientY;
    const origin = { ...pos };
    const onMove = (ev) => {
      setPos(clampPos({
        x: origin.x + ev.clientX - startX,
        y: origin.y + ev.clientY - startY
      }));
    };
    const onUp = () => {
      setInteracting(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const startResize = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setInteracting(true);
    const startX = e.clientX;
    const startY = e.clientY;
    const origin = { ...size };
    const onMove = (ev) => {
      setSize({
        w: Math.max(MIN_W, origin.w + ev.clientX - startX),
        h: Math.max(MIN_H, origin.h + ev.clientY - startY)
      });
    };
    const onUp = () => {
      setInteracting(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const zoom = (factor) => {
    setSize((s) => ({
      w: Math.max(MIN_W, Math.round(s.w * factor)),
      h: Math.max(MIN_H, Math.round(s.h * factor))
    }));
  };

  return (
    <div
      className={interacting ? 'float-video interacting' : 'float-video'}
      style={{ left: pos.x, top: pos.y, width: size.w, height: size.h }}
    >
      <div className="float-video-head" onMouseDown={startDrag}>
        <span className="float-video-title">▶ 讲解视频（拖动移动）</span>
        <span className="float-video-actions">
          <button title="缩小" onClick={() => zoom(0.8)}>−</button>
          <button title="放大" onClick={() => zoom(1.25)}>+</button>
          <a href={videoPageUrl(bvid)} target="_blank" rel="noreferrer" title="在 B 站打开">↗</a>
          <button title="隐藏到侧边栏" onClick={onHide}>×</button>
        </span>
      </div>
      <div className="float-video-body">
        <iframe
          src={playerSrc(bvid)}
          scrolling="no"
          frameBorder="no"
          allowFullScreen
          title="B 站讲解视频"
        />
      </div>
      <div className="float-video-resize" onMouseDown={startResize} title="拖动缩放" />
    </div>
  );
}
