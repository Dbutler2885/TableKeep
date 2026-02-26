# Implementation Milestones

## Target
MVP by March 6, 2026.

## Milestone 0: Repo + Firebase Bootstrap (0.5 day)
- Initialize Vite React TypeScript app.
- Configure Firebase project(s) and env vars.
- Add Auth, Firestore, Storage SDK setup.
- Add emulator config.

Exit criteria:
- App boots locally and connects to Firebase emulator/prod config.

## Milestone 1: Auth + Campaign Membership (1 day)
- Implement Google, email/password, email-link auth.
- Build campaign membership model and role-aware route guard.
- Basic campaign selector (even if single campaign used).

Exit criteria:
- GM and players can sign in and load only their campaign.

## Milestone 2: Character Sheets (1 to 1.5 days)
- Build structured OSE sheet form + custom sections.
- Add portrait upload/display.
- Enforce owner vs GM edit permissions in UI + rules.
- Mobile-friendly sheet layout.

Exit criteria:
- Player edits own sheet on mobile; GM edits any.

## Milestone 3: Maps, Fog, Tokens (2 days)
- Map upload and selection (multiple maps).
- Canvas viewer with pan/zoom.
- GM tools: reveal brush, hide brush, token create/move/delete.
- Real-time sync with Firestore listeners.
- GM-only unhidden map toggle.

Exit criteria:
- Live session test with 5 players shows reliable map/fog/token sync.

## Milestone 4: Images + Notes + PDFs (1 day)
- Revealed images gallery with GM toggle.
- Notes tab with Session Summaries + Shared Notes subtabs.
- Reference PDF upload and in-app viewer.

Exit criteria:
- GM posts content; players see only visible items.

## Milestone 5: Summary API + Hardening (1 day)
- Add HTTP function to post session summaries via API key.
- Add validation + audit fields.
- Finish Firestore/Storage rules.
- Smoke test mobile UX and session flow.

Exit criteria:
- External script/postman/curl can post summary securely.

## Stretch (if time remains)
- Better token visuals and labels.
- Offline-friendly caching.
- Basic campaign settings UI.

## QA Checklist
- Auth flows for all 3 methods.
- Role-based visibility checks (GM vs player).
- Mobile viewport checks (iOS Safari + Android Chrome).
- Concurrent map update test with 6 clients.
- PDF load and paging performance checks.
- Rules test cases using emulator.

## Deferred Backlog (Post-MVP)
- Transcript storage pipeline.
- LLM Q&A over prior sessions.
- Campaign archival/export/import.
- Rich token metadata and combat utilities.
