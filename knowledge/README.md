# Knowledge base

Source documents for the portfolio assistant (the robot in the hero).
Each `NN-name.md` file is one retrievable chunk: a small, self-contained
passage about one topic, written in the third person so it can be quoted
directly in an answer.

```
---
title: Short human-readable title (shown as the source chip)
section: page anchor the chunk belongs to (about, skills, projects, ...)
source: portfolio | resume
tags: comma, separated, retrieval, keywords
---

Body text. Keep it to roughly 60-180 words on a single topic.
```

`README.md` is ignored by the build. After editing or adding a file, run

```bash
npm run build:knowledge
```

which regenerates `public/assets/data/knowledge.json`, the file both the
browser and the `/api/chat` function retrieve from. Only put things here
that are already public on the site or in the resume.
