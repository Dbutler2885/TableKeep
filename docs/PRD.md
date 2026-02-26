# Product Requirements Document (PRD)

## Project
Home Boys House (OSE campaign sidecar)

## Date
February 26, 2026

## Goal
Build a web app for one active OSE campaign/module where players can:
- Access character sheets
- View live-updating maps with GM-controlled fog of war and tokens
- View revealed character/NPC images
- Read reference docs and session summaries

GM can control what is visible and manage campaign content in real time.

## Target Release
MVP by March 6, 2026.

## Users and Roles
- GM
- Player

## Platforms
- Desktop for GM
- Mobile-first support for players (required)

## Authentication
Support all of:
- Google sign-in
- Email/password sign-in
- Email link deferred (post-MVP)

## v1 Scope

### 1) Campaign + Access
- One active campaign in UX for v1.
- Data model remains multi-campaign capable for future archival/modules.
- Any authenticated user is auto-added to active campaign as `player`.
- GM role is assigned by configured GM email allowlist.

### 2) Character Sheets
- One sheet per player character for v1.
- Player can edit only their own character sheet.
- GM can edit all sheets in campaign.
- Sheet includes:
  - Core OSE structured fields (attributes/saves/XP/class/level/HP/AC/inventory/spells)
  - Freeform custom sections/notes
  - Character portrait image

### 3) Map + Fog + Tokens (Real Time)
- Multiple maps per campaign.
- Map image uploads by GM.
- Shared/global fog state (all players see same revealed/hidden state).
- GM-only tools:
  - Reveal brush
  - Hide brush
  - Token creation/move/delete
- Players:
  - View current map and fog state
  - See token positions update live
- GM can view full unhidden map (toggle/GM tab).

### 4) Images Reveal
- GM uploads image assets.
- GM controls visibility with "reveal to players" toggle.
- Players only see revealed images.

### 5) Notes + References
- Notes tab with subtabs:
  - Session Summaries
  - Shared Notes
- Reference docs:
  - GM uploads PDF documents
  - In-app PDF viewer for players and GM

### 6) Session Summary Posting
- Manual posting for v1.
- API endpoint available for posting summaries later from local workflows (Codex/Claude/manual script).
- Transcript storage + Q&A with LLM is out of v1.

## Non-Goals (v1)
- Combat/map game logic (line of sight, initiative logic, collision, etc.)
- Automated transcript ingestion pipeline
- LLM chat over past sessions
- Multi-module archival UX beyond minimal campaign model support

## Performance Targets
- 5 concurrent players + 1 GM target.
- Perceived real-time updates for map/fog/tokens (sub-second best effort).

## Risks
- Fog implementation can become bandwidth-heavy if represented as raw pixel deltas.
- Firestore document write/read limits if brush updates are too granular.
- Mobile map interaction UX complexity.

## Success Criteria (MVP)
- GM and players can log in with supported auth methods.
- GM can run a session with live map updates, fog control, and tokens.
- Players can update their own character sheets on mobile.
- GM can publish and players can read session summaries and PDFs.

## Open Decisions (Post-v1 or early v2)
- Exact OSE field set and sheet layout details
- Map file size/resolution constraints
- API auth strategy for external summary posting endpoint
