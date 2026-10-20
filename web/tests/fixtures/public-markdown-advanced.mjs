/** Advanced public article, shared by cold-route and actual-browser acceptance. */
export const publicAdvancedMarkdownFixture = [
  '## 高阶公式与图表回归',
  '价格$5，公式$x+1$，结束。',
  '$\\sqrt{x}+\\frac{1}{2}$',
  '$$\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}$$',
  '```mermaid\n%%{init: {"securityLevel":"loose","htmlLabels":true,"flowchart":{"htmlLabels":true}}}%%\ngraph TD\nA[开始] --> B[完成]\n```',
  '```mermaid\nsequenceDiagram\nA->>B: hello\n```',
  '```mermaid\ngraph TD\nA[unterminated\n```',
  '<span class="katex" style="position:absolute;top:-1000px">author text</span>',
  '<svg><path d="M0 0" onload="window.publicPwned=1"></path></svg>',
].join('\n\n')
