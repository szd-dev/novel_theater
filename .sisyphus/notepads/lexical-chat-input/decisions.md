# Decisions — lexical-chat-input

## 2026-04-29 Initial Setup

- Use Lexical + lexical-beautiful-mentions (per plan research)
- PlainTextPlugin (NOT RichText) — chat input doesn't need rich formatting
- LineBreakNode for newlines (avoid $getTextContent() producing \n\n between paragraphs)
- dynamic(() => import(...), { ssr: false }) for SSR handling
- AGENT_COLORS.actor (#EC4899) for mention pill color
- 5s polling for useCharacters hook (matching SceneIndicator pattern)
