---
name: knowledge-studio
description: Search the current DSH Workspace with local evidence and create explicit Studio artifacts.
whenToUse: Use when the user asks about workspace knowledge, evidence-backed workspace synthesis, or requests a briefing, study guide, FAQ, quiz, or flashcards.
user-invocable: true
---

# Knowledge Studio

The current DSH Workspace is the knowledge boundary. Use the existing DSH conversation; never create or imply a separate Notebook, Sources collection, or Studio chat.

## Evidence workflow

1. Workspace knowledge is optional. Use host file reading/search to inspect relevant files directly when no index is ready, while preparation is running, or when indexed evidence is insufficient. If a prepared index is available, `knowledge_studio_search` can strengthen retrieval. Never trigger knowledge preparation just to run Studio.
2. Cite material claims with returned Evidence IDs and their real workspace-relative locators.
3. If evidence is insufficient, say so and refine the local query; never invent an Evidence ID.
4. Indexing and retrieval are local. Do not request or configure embedding or rerank services.

## Studio workflow

Workspace Knowledge is optional and requires explicit first-use consent because its visual knowledge organization may call the current DSH model and consume credits. Do not start it silently. The local retrieval data and visual knowledge pages are one user-facing capability, even though they remain separate internal stages.

When the user invokes Studio, create a persistent artifact in the current conversation. Eight kinds are supported: report (briefing, FAQ, study-guide, custom templates), mindmap, quiz, flashcards, table, slides, audio, video. Wiki belongs to Workspace Knowledge and is optional. Infographics are excluded. Ordinary conversational questions still receive normal answers.

Opening an artifact or source must preserve the user's current conversation and return to the previous Knowledge panel state when the preview closes.

Use `knowledge_studio_create_artifact` for requested Studio outputs. Forward kind, count, focus, pathPrefix, template, columns and style from the user's parameters. Its output is saved to the current conversation and Studio. Do not substitute plain text or a script for the requested artifact. Slides export PPTX, tables export XLSX/CSV, audio exports WAV and video MP4. Media uses local speech and trusted rendering templates. Do not claim a completed file when the tool reports failure; explain its message and preserve already generated content. User modification requests should produce a new version with their changes in focus, preserving original source scope. Never overwrite an existing result silently.
