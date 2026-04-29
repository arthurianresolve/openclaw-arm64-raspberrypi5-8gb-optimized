---
name: qmd
description: Local hybrid search for markdown notes and docs. Use when searching notes, finding related content, or retrieving documents from indexed collections.
homepage: https://github.com/tobi/qmd
---

# qmd - Quick Markdown Search

Local search engine for Markdown notes, docs, and knowledge bases. Index once, search fast.

## When to use

- Search my notes, docs, or knowledge base.
- Find related notes.
- Retrieve a markdown document from my collection.
- Search local markdown files.

## Default behavior

- Prefer `qmd search` first. It is the fast keyword path.
- Use `qmd vsearch` only when keyword search fails and semantic similarity is needed.
- Avoid `qmd query` unless the user explicitly wants hybrid reranking and can tolerate slow runs.

## Prerequisites

- Bun 1.0 or newer.
- macOS users may need `brew install sqlite`.
- Ensure `$HOME/.bun/bin` is on `PATH`.

## Install

```bash
bun install -g https://github.com/tobi/qmd
```

## Setup

```bash
qmd collection add /path/to/notes --name notes --mask "**/*.md"
qmd context add qmd://notes "Description of this collection"
qmd embed
```

## What it indexes

- Markdown collections, commonly `**/*.md`.
- Messy Markdown is fine; chunking is content-based.
- It is not a replacement for code search.

## Search modes

- `qmd search`: fast BM25 keyword search.
- `qmd vsearch`: vector search; slower on cold start.
- `qmd query`: hybrid search plus reranking; usually the slowest option.

## Performance notes

- `qmd search` is usually instant.
- `qmd vsearch` can take around a minute on cold start if it has to load a local model.
- `qmd query` adds another reranking step on top of `vsearch`.

## Common commands

```bash
qmd search "query"
qmd vsearch "query"
qmd query "query"
qmd search "query" -c notes
qmd search "query" -n 10
qmd search "query" --json
qmd search "query" --all --files --min-score 0.3
```

## Retrieve

```bash
qmd get "path/to/file.md"
qmd get "#docid"
qmd multi-get "journals/2025-05*.md"
qmd multi-get "doc1.md, doc2.md, #abc123" --json
```

## Maintenance

```bash
qmd status
qmd update
qmd embed
```

## Keeping the index fresh

- Use `qmd update` for fast keyword refreshes.
- Use `qmd embed` when you rely on semantic or hybrid search.
- A simple cron job is usually enough for recurring updates.

## Relationship to memory search

- `qmd` searches local files you explicitly index.
- `memory_search` searches agent memory.
- Use both when you need both document retrieval and prior-session recall.
