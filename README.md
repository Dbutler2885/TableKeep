# Home Boys House (Table Keep)

A tabletop RPG campaign sidecar web app for GMs and players, built with Vite + React + TypeScript on Firebase.
The product is branded **Table Keep** in the UI; this repository is named Home Boys House.

It is a companion to the table, not a virtual tabletop: players keep their character sheets, follow live maps the GM reveals, browse revealed NPCs and reference material, and read session recaps, while the GM manages campaign content in real time.

## Overview

Table Keep is organized around **groups** and **campaigns**:

- A user signs in, claims a username, and can belong to multiple groups.
- A group is the stable social container, with members and email invites.
- A group can hold multiple campaigns over time; each campaign owns its own game system and data, and a group has at most one *current* campaign at a time (campaigns move between `draft`, `active`, and `inactive`).
- Each campaign has exactly one GM (the campaign creator/owner). Everyone else in the group is a player; participation in a campaign is implicit (you participate by owning a character in it).

Data and files live in Firestore and Firebase Storage under the nested `groups/{groupId}/campaigns/{campaignId}/...` structure. Real-time sync uses Firestore listeners, so map, fog, token, and content changes propagate to all viewers without refresh. The UI is mobile-friendly for players (drawer navigation) and desktop-oriented for GMs (left sidebar).

## Supported game systems

Each campaign picks a system, and the available tabs adapt to it.

- **OSE (Old-School Essentials)** - the fuller-featured system. Structured character sheets, inventory/store/economy, spellbooks, monster and treasure references, random tables, and the OSE SRD link.
- **Vampire: The Masquerade (VtM)** - a lighter, mostly-presentational variant: fillable character sheets (clans, attributes, disciplines, XP), NPCs, a monster/reference tab, maps, notes, and calendar. No items/store, treasure tables, or OSE SRD link.

## Features

- **Authentication & accounts** - Google sign-in and email/password, with an email-verification gate and a one-time username claim. (Email-link sign-in is deferred.)
- **Groups & campaigns** - create groups, invite members by email, create/activate/deactivate campaigns, and switch the group's current campaign. Per-campaign settings (including which tabs are enabled) via a GM-only settings modal.
- **Character sheets**
  - *OSE:* attributes, saves, class/level/HP/AC, structured inventory (weapons, armour, ammunition, consumables, general gear), a store/shopping flow, spellbooks (arcane and divine spell catalogs), thief skills, packed items, and character portraits/media. Players edit their own sheet; the GM can edit any.
  - *VtM:* fillable sheets covering clan, attributes, disciplines, and XP tracking.
  - GM approval flow for player requests (adding/selling items, transcribing spells, ability re-rolls) and item transfers between characters with live notifications.
- **Maps, fog & tokens** - GM-uploaded maps with pan/zoom, a fog-of-war reveal/hide brush, a square/hex grid overlay, annotations, and tokens (create, move, rotate, flip, duplicate, animate). Players see the current map and revealed state; updates sync live. Includes basic encounter tracking.
- **NPCs** - NPC editor with media; the GM controls what players can see, and players can edit visible NPC media where allowed.
- **Monsters** - OSE monster catalog/reference (GM-facing for OSE; available to VtM campaigns).
- **Items & treasure** - GM item management plus OSE treasure generation (treasure-type roll engine and magic-item tables).
- **Tables** - reusable random tables with entity pickers.
- **Notes & session summaries** - session summaries (with an importer, detail view, and a cliffhanger highlight modal), shared notes, and a rich-text editor.
- **Calendar** - an in-campaign calendar tab.
- **Reference** - direct link to the OSE SRD.
- **Cloud Functions** - an HTTP `postSessionSummary` endpoint (API-key protected) for posting session summaries from external/local workflows, plus a `health` check.

> Status: this is an actively evolving app well beyond its initial scaffold. Some areas are still maturing - treat the feature list as "present in the code today," and expect parts of the GM tooling and system-specific sheets to keep changing.

## Tech stack

- Vite + React + TypeScript, React Router
- Firebase: Authentication, Cloud Firestore, Storage, Cloud Functions (2nd gen), Hosting
- Iconify (game-icons) and lucide-react for iconography
- Vitest for unit tests, plus emulator-backed integration tests; ESLint for linting

## Prerequisites
- Node.js 24+
- npm 11+
- Java 21+ (required for the Firestore/Storage emulators)

## Install
```bash
npm install
```

## Environment Setup
1. Copy the env file:
```bash
cp .env.example .env.local
```
2. Fill in the Firebase web app config values (`VITE_FIREBASE_*`) in `.env.local`.
3. Set `VITE_USE_FIREBASE_EMULATORS=true` if you want the app to talk to local emulators.

> Note: `.env.example` still lists `VITE_GM_EMAILS`. GM assignment has since moved to a per-campaign owner (`gmUserId`), so this variable is legacy and no longer wired into the app.

## Firebase CLI-First Setup

### 1) Login
```bash
npm run firebase:login
```

### 2) Create project (or use existing)
```bash
npx firebase projects:create homeboyshouse-dev
```

### 3) Select project for this repo
```bash
npx firebase use --add
```
Choose `homeboyshouse-dev` and alias `default`.

### 4) Enable required Firebase products
You can do most via CLI, but Auth provider toggles still often need the console/UI.

CLI-friendly product provisioning:
```bash
npx firebase firestore:databases:create --location=us-central
npx firebase deploy --only firestore:rules,firestore:indexes,storage
```

## Run Locally

### App only
```bash
npm run dev
```

### App + Firebase emulators
1. Set the emulator flag in `.env.local`:
```bash
VITE_USE_FIREBASE_EMULATORS=true
```
2. Start the emulators:
```bash
npm run emulators
```
3. Start the app in another terminal:
```bash
npm run dev
```

## Scripts
- `npm run dev` - start the Vite dev server
- `npm run build` - type-check + production build
- `npm run lint` - run ESLint
- `npm run test` - run the unit test suite (Vitest)
- `npm run test:watch` - run Vitest in watch mode
- `npm run test:emulator` - run emulator-backed integration tests
- `npm run preview` - preview the production build
- `npm run emulators` - start the auth/firestore/storage emulators
- `npm run emulators:import` - start emulators with persisted state
- `npm run emulators:export` - export emulator state
- `npm run deploy:hosting` - deploy web app hosting
- `npm run deploy:functions` - deploy Cloud Functions
- `npm run firebase:login` - log in to the Firebase CLI

Data-import helpers for OSE reference content also exist (`npm run ose:*`); see `package.json` and `scripts/`.

## Project layout
- `src/features/*` - feature modules (auth, groups, campaign, character incl. OSE and VtM, maps, monsters, items, treasure, npcs, tables, notes, transfers, tokens, navigation, common).
- `src/firebase/*` - Firebase SDK setup and emulator wiring.
- `functions/` - Cloud Functions source (session-summary ingestion + health check).
- `docs/` - product and design docs (PRD, architecture, Firestore schema, group/campaign model, IA/navigation, component/UX specs, security-rules plan). Note that some docs predate the group/campaign model and describe the older single-active-campaign design.
- Firebase config lives in `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`, and `storage.rules`.

## Firestore data model (high level)
- `users/{userId}` - platform identity (email, username, timestamps).
- `groups/{groupId}` - group, with `members/{userId}`, `invites/{inviteId}`, and `campaigns/{campaignId}` subcollections.
- `groups/{groupId}/campaigns/{campaignId}/...` - per-campaign data: `characters`, `npcs`, `maps` (with `tokens`/`annotations`/`fogChunks`), `items`, `tables`, `sessionSummaries`, and per-user UI scratch under `userState/{userId}`.

See `docs/GROUP_CAMPAIGN_MODEL.md` and `docs/FIRESTORE_SCHEMA.md` for details.
