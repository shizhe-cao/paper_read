import React from 'react';

export default function WordsPanel({ words, onRefresh }) {
  const remove = async (id) => {
    await fetch(`/api/words/${id}`, { method: 'DELETE' });
    onRefresh();
  };

  // 单词级显示/隐藏：控制该词在 PDF 上的高亮与悬停释义
  const toggleHidden = async (w) => {
    await fetch(`/api/words/${w.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hidden: !w.hidden })
    });
    onRefresh();
  };

  return (
    <div className="words-panel">
      {words.length === 0 && (
        <div className="panel-empty">暂无生词：双击论文中的单词，点击「+ 生词本」即可保存</div>
      )}
      {words.map((w) => (
        <div className={'word-card' + (w.hidden ? ' word-hidden' : '')} key={w.id}>
          <div className="word-head">
            <span className="word-text">{w.word}</span>
            {w.phonetic && <span className="word-phonetic">{w.phonetic}</span>}
            <button
              className="btn btn-sm word-toggle"
              onClick={() => toggleHidden(w)}
              title={w.hidden ? '该词当前不在 PDF 上显示，点击恢复高亮' : '在 PDF 上隐藏该词的高亮与释义'}
            >
              {w.hidden ? '显示' : '隐藏'}
            </button>
            <button className="btn btn-sm btn-danger word-del" onClick={() => remove(w.id)}>删除</button>
          </div>
          <div className="word-translation">{w.translation}</div>
        </div>
      ))}
    </div>
  );
}
