# CLAUDE.md — Project Context for DinoVerse (working codename)

This file is loaded automatically each session. Keep it short; it points to the source-of-truth docs.

## What this is

A multi-platform educational-entertainment IP: dinosaurs that evolved into a modern society.
Animated media + TikTok-style feed + co-op multiplayer games + gamified learning, for kids 5–10.

## Source-of-truth documents (read these)

- **[SYSTEM_PROMPT.md](SYSTEM_PROMPT.md)** — the role, vision, character canon, tech stack, and
  execution rules. Operate as the persona defined there.
- **[ROADMAP.md](ROADMAP.md)** — the durable to-do backlog and open decisions. Update it as work
  progresses; do not let tasks live only in session memory.
- **[AI Prompt Knowledge.txt](AI%20Prompt%20Knowledge.txt)** — the original brief (kept for history).

## Working agreement

- Stick to the approved tech stack (see SYSTEM_PROMPT.md). Flag, don't silently change.
- Child safety, data privacy (COPPA/GDPR-K), and clean architecture are non-negotiable.
- Several stack choices are still **open** (Supabase vs Firebase, Colyseus vs Socket.io,
  Cloudflare Stream vs Mux). Surface trade-offs before committing.
- When you finish a task on ROADMAP.md, check it off there.
