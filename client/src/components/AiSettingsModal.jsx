import React, { useEffect, useState } from 'react';

// 服务商预设：选择后自动填充 API 地址与推荐模型
const PROVIDERS = [
  {
    value: 'qwen',
    label: '通义千问 Qwen（阿里百炼）',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus'
  },
  {
    value: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini'
  },
  {
    value: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat'
  },
  {
    value: 'zhipu',
    label: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash'
  },
  {
    value: 'custom',
    label: '自定义（OpenAI 兼容）',
    baseUrl: '',
    model: ''
  }
];

export default function AiSettingsModal({ onClose }) {
  const [provider, setProvider] = useState('qwen');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [keySet, setKeySet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((s) => {
        setBaseUrl(s.ai_base_url || '');
        setModel(s.ai_model || '');
        setKeySet(Boolean(s.ai_api_key_set));
        // 根据已存配置推断服务商
        const matched = PROVIDERS.find((p) => p.value !== 'custom' && p.baseUrl === s.ai_base_url);
        setProvider(matched ? matched.value : 'custom');
      });
  }, []);

  const applyProvider = (value) => {
    setProvider(value);
    const p = PROVIDERS.find((x) => x.value === value);
    if (p && p.baseUrl) {
      setBaseUrl(p.baseUrl);
      setModel(p.model);
    }
  };

  const save = async () => {
    setSaving(true);
    setMsg('');
    try {
      const body = { ai_base_url: baseUrl, ai_model: model };
      if (apiKey.trim()) body.ai_api_key = apiKey.trim(); // 留空则不覆盖已存 Key
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        setMsg('已保存');
        setTimeout(onClose, 600);
      } else {
        setMsg('保存失败');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-mask" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-head">
          <span>AI 设置（OpenAI 兼容接口）</span>
          <button className="popup-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <label className="modal-label">
            服务商
            <select className="modal-select" value={provider} onChange={(e) => applyProvider(e.target.value)}>
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </label>
          <label className="modal-label">
            API 地址
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1"
            />
          </label>
          <label className="modal-label">
            模型名称
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="qwen-plus"
            />
          </label>
          <label className="modal-label">
            API Key {keySet && <span className="key-set">（已配置，留空则不修改）</span>}
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={keySet ? '••••••••' : 'sk-...'}
            />
          </label>
          <p className="modal-hint">
            通义千问：在阿里云百炼控制台开通并获得 API Key（sk- 开头），模型可选 qwen-plus / qwen-turbo / qwen-max 等。
            也支持其他 OpenAI 兼容服务（DeepSeek / 智谱等）。
          </p>
          {msg && <div className="modal-msg">{msg}</div>}
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !baseUrl.trim() || !model.trim()}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
