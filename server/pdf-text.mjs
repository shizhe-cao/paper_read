/** PDF 全文提取（Node 环境，使用 pdfjs-dist legacy build） */
import fs from 'node:fs';
import path from 'node:path';

let pdfjs = null;
async function getPdfjs() {
  if (!pdfjs) {
    const mod = await import('pdfjs-dist/legacy/build/pdf.js');
    pdfjs = mod.default ?? mod;
  }
  return pdfjs;
}

/**
 * 提取 PDF 文本
 * @param {string} filePath PDF 文件路径
 * @returns {Promise<{text: string, pages: number}>}
 */
export async function extractPdfText(filePath) {
  const pdfjs = await getPdfjs();
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const numPages = doc.numPages;
  const parts = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      // 按行拼接：text item 的 y 坐标变化视为换行
      let lastY = null;
      let line = '';
      const lines = [];
      for (const item of content.items) {
        if (!item.str) continue;
        const y = item.transform?.[5];
        if (lastY !== null && Math.abs(y - lastY) > 2) {
          lines.push(line);
          line = '';
        }
        line += item.str;
        if (item.hasEOL) { lines.push(line); line = ''; }
        lastY = y;
      }
      if (line) lines.push(line);
      parts.push(`\n===== 第 ${i} 页 =====\n` + lines.join('\n'));
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return { text: parts.join('\n').trim(), pages: numPages };
}
