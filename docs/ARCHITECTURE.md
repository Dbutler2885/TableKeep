# Architecture Plan

## Stack
- Frontend: Vite + React + TypeScript
- UI state/data: React Query + Firestore SDK listeners
- Auth: Firebase Authentication
  - Google provider
  - Email/password
  - Email link sign-in
- Database: Cloud Firestore
- File storage: Firebase Storage
- Hosting: Firebase Hosting
- Backend logic:
  - Firebase Functions (2nd gen, HTTP + callable + triggers) for v1
  - Cloud Run deferred unless websocket-like behavior or custom runtime needs appear

## Why Firebase-first
- Native real-time sync via Firestore listeners is sufficient for 6-ish concurrent users.
- Simpler ops and auth integration than introducing Cloud Run now.
- Keeps future path open for Cloud Run APIs.

## High-Level Components
1. React App
- Auth flows
- Role-aware routing/UI
- Map canvas with fog + tokens
- Character sheet editor/view
- Notes/references pages + PDF viewer

2. Firestore
- Campaign model, membership/roles
- Character sheet docs
- Map/fog/token state
- Notes/summaries metadata

3. Firebase Storage
- Portrait images
- Map images
- Revealed image gallery assets
- Reference PDFs

4. Firebase Functions
- Role-aware mutation helpers where needed
- Summary ingestion endpoint (manual external post)
- Optional image/map metadata processing hooks

## Real-Time Strategy

### Map + Tokens
- Subscribe to selected map document and token subcollection.
- Store tokens as independent docs for granular updates.
- Use optimistic UI on drag and commit final coordinates on pointer up.

### Fog of War
Recommended v1 representation:
- Fixed-size fog grid per map (e.g., 128x128 or 256x256 logical cells)
- Store fog as compressed bitset chunks in Firestore docs
- GM brush modifies cell sets in local memory, debounced writes (e.g., 100-200ms)

Reason:
- Avoid per-pixel writes and oversized docs.
- Predictable performance and simple rendering on mobile.

## API Surface (v1)

### Client-direct (via SDK + rules)
- Most reads
- User-owned sheet edits
- GM map/token/fog updates (if rules can enforce cleanly)

### Function-backed
- `POST /api/session-summaries` (HTTP function)
  - Create session summary entry for a campaign
  - v1 auth option: shared secret header or Firebase ID token
- Optional privileged operations if security rule complexity grows

## PDF Viewer Approach
- Store PDFs in Firebase Storage.
- Use a React PDF renderer (`pdfjs-dist` + `react-pdf` or equivalent).
- Persist metadata in Firestore (`title`, `storagePath`, visibility).

## Mobile-First Requirements
- Bottom-tab style navigation for players.
- Large touch targets for map panning/zooming.
- Defer heavy map layers until needed.
- Avoid large synchronous JSON payloads during initial load.

## Environments
- `dev`, `prod` Firebase projects.
- Local emulator suite for Auth/Firestore/Functions in development.

## Observability
- Firebase Logging + Crashlytics for web errors (optional but recommended).
- Basic audit fields (`createdAt`, `updatedAt`, `updatedBy`).

## Future Extension Path
- Add campaign archival and module templates.
- Add transcript storage + embeddings + Q&A service (likely Cloud Run).
- Add more map tooling and token metadata.
