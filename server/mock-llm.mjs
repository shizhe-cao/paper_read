/** 本地 mock OpenAI 兼容接口，用于测试 AI 聊天链路（端口 3002） */
import http from 'node:http';

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url.endsWith('/chat/completions')) {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const parsed = JSON.parse(body);
      const sys = parsed.messages.find((m) => m.role === 'system')?.content || '';
      const lastUser = [...parsed.messages].reverse().find((m) => m.role === 'user')?.content || '';
      const hasPaper = sys.includes('选定段落') && !sys.includes('该对话未绑定选段');
      const ctxMatch = sys.match(/===== 选定段落 =====\n([\s\S]*?)$/);
      const isSummarize = sys.includes('整理成');
      let reply;
      if (isSummarize) {
        reply = '## 论文要点\n1. 该选段研究了神经网络泛化问题\n2. 提出新的正则化方法\n3. 实验表明方法能减少过拟合\n\n## 关键结论\n泛化性能依赖训练数据、结构与优化过程。';
      } else if (hasPaper) {
        const ctx = ctxMatch ? ctxMatch[1].slice(0, 60).replace(/\s+/g, ' ') : '';
        reply = `（mock 回复）你绑定的选段是：「${ctx}」。你问的是：${lastUser.slice(0, 50)}`;
      } else {
        reply = '（mock 回复）该对话未绑定选段。' + lastUser.slice(0, 30);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        choices: [{ message: { role: 'assistant', content: reply } }]
      }));
    });
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

server.listen(3002, () => console.log('mock LLM: http://localhost:3002/v1'));
