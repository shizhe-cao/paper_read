import React from 'react';

export default function WordsPanel({ words, onRefresh }) {
  const remove = async (id) => {
    await fetch(`/api/words/${id}`, { method: 'DELETE' });
    onRefresh();
  };

  return (
    <div className="words-panel">
      {words.length === 0 && (
        <div className="panel-empty">暂无生词：双击论文中的单词，点击「+ 生词本」即可保存</div>
      )}
      {words.map((w) => (
        <div className="word-card" key={w.id}>
          <div className="word-head">
            <span className="word-text">{w.word}</span>
            {w.phonetic && <span className="word-phonetic">{w.phonetic}</span>}
            <button className="btn btn-sm btn-danger word-del" onClick={() => remove(w.id)}>删除</button>
          </div>
          <div className="word-translation">{w.translation}</div>
        </div>
      ))}
    </div>
  );
}
