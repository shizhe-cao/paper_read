import React, { forwardRef, useEffect, useState } from 'react';

const POPUP_W = 340;

const TranslatePopup = forwardRef(function TranslatePopup(
  { text, x, y, paperId, savedWordSet, onAdd, onClose },
  ref
) {
  const [entries, setEntries] = useState(null);
  const [added, setAdded] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEntries(null);
    setAdded({});
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/translate?text=${encodeURIComponent(text)}`);
        const data = await res.json();
        if (!cancelled) setEntries(data.entries || []);
      } catch {
        if (!cancelled) setEntries([]);
      }
    })();
    return () => { cancelled = true; };
  }, [text]);

  const left = Math.min(Math.max(x, 8), window.innerWidth - POPUP_W - 8);
  const top = Math.min(y, window.innerHeight - 180);

  const handleAdd = async (entry) => {
    setSaving(true);
    try {
      await fetch(`/api/papers/${paperId}/words`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          word: entry.word,
          translation: entry.translation || entry.definition || '',
          phonetic: entry.phonetic || ''
        })
      });
      setAdded((a) => ({ ...a, [entry.word]: true }));
      onAdd?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="translate-popup" ref={ref} style={{ left, top: Math.max(top, 8), width: POPUP_W }}>
      <div className="popup-header">
        <span className="popup-text">{text}</span>
        <button className="popup-close" onClick={onClose} aria-label="关闭">×</button>
      </div>
      <div className="popup-body">
        {entries === null && <div className="popup-loading">查询中…</div>}
        {entries !== null && entries.length === 0 && (
          <div className="popup-empty">词典中未找到该词</div>
        )}
        {entries?.map((e) => (
          <div className="popup-entry" key={e.word}>
            <div className="entry-head">
              <span className="entry-word">{e.word}</span>
              {e.phonetic && <span className="entry-phonetic">{e.phonetic}</span>}
              <button
                className="btn btn-sm"
                disabled={saving || added[e.word] || savedWordSet.has(e.word.toLowerCase())}
                onClick={() => handleAdd(e)}
              >
                {added[e.word] || savedWordSet.has(e.word.toLowerCase()) ? '已保存' : '+ 生词本'}
              </button>
            </div>
            {e.translation && <div className="entry-translation">{e.translation}</div>}
            {e.definition && <div className="entry-definition">{e.definition}</div>}
            {!e.found && <div className="entry-notfound">（按词形推测）</div>}
          </div>
        ))}
      </div>
    </div>
  );
});

export default TranslatePopup;
