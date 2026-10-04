---
title: Project: this portfolio site and its robot assistant
section: hero
source: portfolio
tags: project, portfolio, website, this site, robot, three.js, chatbot, assistant, rag, netlify, how was this built, how do you work
---

This portfolio is a hand-built static site (HTML, CSS and vanilla JavaScript, no framework) deployed on Netlify, with a Netlify Function backend for the contact form and the chat assistant.

The robot in the hero is a procedural Three.js character that tracks the cursor. Clicking it opens this assistant, which is a retrieval-augmented generation (RAG) system: Usaid's resume and portfolio content are split into small knowledge chunks, a BM25 retriever picks the chunks most relevant to each question, and the answer is written only from those chunks. If no language model is configured, the assistant answers directly from the retrieved passages instead.

More of his experiments, tools and open-source work are on GitHub at https://github.com/U-SAIDK.
