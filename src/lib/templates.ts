export const TEMPLATES: Record<string, string> = {
  "world.md": `# 世界设定\n\n## 地点\n\n### {地点名}\n{地点描述——外观、特征、内部结构、可达路径}\n\n## 势力\n\n### {势力名}\n{势力描述——立场、目标、与主角关系}\n\n## 规则\n\n- {世界运行规则}\n`,
  "style.md": `# 风格指南\n> 一句话描述\n\n## 视角\n\n## 节奏\n\n## 语言特色\n`,
  "timeline.md": `# 时间线\n\n## 纪年\n\n### 已知时间点\n\n| 场景 | 故事时间 | 顺序 | 摘要 |\n|------|----------|------|------|\n\n### 时间规则\n`,
  "plot.md": `# 剧情线\n\n## 主线\n\n## 支线\n`,
  "debts.md": `# 传播债务\n\n<!-- 格式: - [ ] 债务描述 → 影响文件 -->\n`,
  "chapters.md": `# 章节\n\n<!-- 格式:\n## 第N章 标题\n- 起始：[[sXXX]]\n- 结束：[[sXXX]]\n- 概要：...\n-->\n`,
};

export const SUBDIRS = ["characters", "scenes"];
