# Table Keep

[![CI](https://github.com/Dbutler2885/TableKeep/actions/workflows/ci.yml/badge.svg)](https://github.com/Dbutler2885/TableKeep/actions/workflows/ci.yml)

**Table Keep** is the campaign memory for a tabletop RPG group: character sheets, live fog-of-war maps, an NPC roster the GM reveals a piece at a time, and AI-generated session recaps built from a recording of the game you just played.

<p align="center">
  <img src=".github/media/table-keep-fog-hero.webp" alt="A player's map view: fog of war peeling back around a token as it moves through a village" width="560">
</p>

<p align="center"><em>A player's view of the village, revealed as their token moves. The GM paints the fog; every client sees it change live.</em></p>

## Try it in two minutes

```bash
git clone https://github.com/Dbutler2885/TableKeep.git
cd TableKeep
npm install
npm run demo
```

Then open <http://127.0.0.1:5173> and pick a seat.

No Firebase project.
No account to create.
No API keys, no `.env` file, nothing to sign up for.

`npm run demo` boots the local Firebase emulators from a committed snapshot of a real authored campaign - maps, characters, NPCs and session history already in place - and starts the Vite dev server pointed at them.
The sign-in screen offers two seeded seats:

| Seat | Email | Password |
| --- | --- | --- |
| Game Master | `demo-gm@tablekeep.test` | `tablekeep-demo` |
| Player | `demo-player@tablekeep.test` | `tablekeep-demo` |

The same two lines are printed in the startup banner, so you never have to come back here for them.

Sign in as both, in two windows, and look at the same campaign from both sides.
The GM sees every map, every NPC, and every character sheet.
The player sees their own sheet, the part of the map that has been revealed to them, and only the NPCs and notes the GM has shared.
That gap is the product.

Those accounts exist only inside your own emulator and are not secrets.
**Nothing you do in the demo touches the committed snapshot** - the visitor mode imports the snapshot and never writes it back, so break whatever you like.

Prerequisites: Node.js 24+, npm 11+, and Java 21+ (the Firestore and Storage emulators are JVM processes).
Stop the demo with `Ctrl+C`.

## What it is

The group plays remotely, over Discord.
Discord carries the voice and the dice; Table Keep is what they have open alongside it.
It does not try to be the whole table, because Discord already is - which is why there is no OSE dice roller.

And it closes the loop.
The same Discord call that carries the session is what gets recorded, transcribed, and turned into the recaps and NPC notes waiting in the app afterwards.

What exists today is three things.
A place to watch maps update live as pieces move across them.
A place where every character sheet lives and stays current, in one place.
And a place where the campaign's memory is preserved, as AI-generated session recaps and per-session NPC descriptions.

It is organized around **groups** and **campaigns**:

- A user signs in, claims a username, and can belong to multiple groups.
- A group is the stable social container - members and email invites live there.
- A group holds many campaigns over their lifetime; each campaign owns its own game system and data, and a group has at most one *current* campaign at a time.
  Campaigns move between `draft`, `active`, and `inactive`.
- Each campaign has exactly one GM, its creator.
  Everyone else in the group is a player, and participation is implicit: you are in the campaign because you own a character in it.

Everything lives in Firestore and Firebase Storage under `groups/{groupId}/campaigns/{campaignId}/...`, and everything reads through Firestore listeners.
When the GM erases a patch of fog, moves a token, or publishes an NPC, it is on the players' screens before they look up.
The player UI is mobile-friendly with drawer navigation; the GM UI is desktop-oriented with a left sidebar.

## A guided tour

### Maps, fog, and tokens

<p align="center">
  <img src=".github/media/table-keep-map-tools.webp" alt="The GM's map view: the full tool rail across the top, a village half-hidden under fog, and a token being placed and labelled The Clumsy Fox" width="640">
</p>

**The map tools, 33 seconds** - the whole GM rail in one pass: brush size, fog, vision blocking, measurement, player view, selection and pan, annotation, grid.
Then a token is placed on the map and labelled *The Clumsy Fox*, and the label renders on the board where the table will read it.
[Full-quality recording](.github/media/table-keep-map-tools.mp4).

<p align="center">
  <img src=".github/media/table-keep-scene-npcs.webp" alt="Eric the Town Reeve selected on the map, his portrait and GM notes filling the right sidebar, his name label appearing under his token" width="640">
</p>

**Scene NPCs, 14 seconds** - Eric the Town Reeve, selected, with his portrait and notes filling the sidebar, so the GM has what Eric wants and what he will pay for it in front of them without leaving the map.
It ends on his name label appearing on the board, where the table will read it.
Scene NPCs attach to a map from the campaign roster, so the people in a location travel with it.
[Full-quality recording](.github/media/table-keep-scene-npcs.mp4).

Fog is the feature the rest of the map tooling exists to serve.
The GM paints reveals with a sizeable brush, blocks line of sight with vision walls, and can flip to player view at any time to check exactly what the table can see.
Revealed state is stored per map and synced live, so a player who joins late or reloads gets the world in the state the GM left it.

<p align="center">
  <img src=".github/media/map-player-vision-mobile.webp" alt="The same village map on a player's phone: almost entirely black, with only the revealed wedge around their token visible" width="300">
</p>

Here is the same village from a player's phone, at the same moment.
Almost all of it is black.
They know there is a road, two buildings, and something south of them - and that is all they know.

### NPCs

![The NPC tab: searchable NPC list on the left showing player visibility, and Cedric's record with portrait, player description, auto-notes and GM notes](.github/media/npc-detail-cedric.webp)

The NPC roster is split down the middle by who is allowed to see what.
Every record has a portrait, a player-facing description, and private GM notes; the list on the left is grouped by visibility so the GM can see at a glance what the table has met.
Under the portrait, **Auto-Notes** are written by AI from the session transcript - here, Cedric picked up a line from Session 11 about the party passing through his store on the thief's trail.
Nobody typed that.

### Character sheets

![A full OSE character sheet for Mirelda Crow: ability scores, saving throws, combat block, THAC0 with the descending AC matrix, adventuring skills, portrait](.github/media/character-sheet-mirelda.webp)

The OSE sheet is a real sheet, not a text field with a label.
Ability scores carry their derived modifiers, saving throws are broken out by category, and the combat block computes AC from armour and DEX and lays THAC0 out against the full descending AC matrix so a player can read a to-hit off it without doing arithmetic.
Players edit their own character; the GM can edit any of them, and hand one over from the sidebar.

Behind the core sheet is the half of a campaign a table normally keeps on paper and loses by the third session: who is carrying what, who bought what, what got used up, and who handed what to whom.

Inventory is slot-based, and the slots are derived rather than declared - carrying capacity comes off Strength, and equipped gear does not compete with packed gear for space.
Gold is carried as real coin items at 100 gp to a slot, so money has weight.
Go over capacity and the overflow does not silently vanish: the newest packed items, and any gold that no longer fits, move to Dropped Items as campaign objects tagged with who dropped them, to be reorganized and granted back rather than quietly deleted.
The store validates a cart against the character's actual gold before it will sell, and weapon and armour templates know which classes are allowed to use them.

Handing something to another character is a two-sided transfer, not an edit.
The offer carries a snapshot of the item, and accepting it re-validates that snapshot against the sender's live inventory: if the item has since been sold, changed kind, or dropped in quantity, the transfer fails rather than duplicating it, and it will not push the receiver past their carrying capacity.
Buying, selling, transcribing a spell and re-rolling an ability all reach the GM as approval requests, so the economy has exactly one referee.

## Features

**Two game systems.** *Old-School Essentials* is the deeper of the two: structured sheets, inventory with weapons/armour/ammunition/consumables/gear, a store and shopping flow, arcane and divine spellbooks, thief skills, a monster catalog, treasure-type generation with magic-item tables, and the OSE SRD link.
The structured data is deliberately in place - items, NPCs, monsters, maps, tables, treasure - as the groundwork for automating a lot of play.
That automation is a future build rather than something already shipped: what runs today computes the sheet and polices the economy, it does not run the rules of the game.
*Vampire: The Masquerade* gets a lot of play at the table, and a real slice of it is implemented: sheets for clan, attributes, abilities, disciplines, backgrounds and virtues, a d10 dice-pool roller with initiative and soak presets, XP priced by category with separate in-clan and out-of-clan discipline costs, clan weaknesses, and generation-based blood pool maximums.
It stops there, and it is worth being plain about that.
There is no items, store or treasure machinery on the VtM side, and the full ruleset is a future build rather than something already shipped - a working foundation, not a finished system.
Each campaign picks a system, and the tab set follows.

**GM approval flow.** Players do not silently mutate the world.
Item, spell and re-roll requests land in a GM queue with live notifications, and character-to-character transfers are handshaked on both sides.

**Live everything else.** Groups with email invites, per-campaign settings including which tabs are enabled, reusable random tables with entity pickers, a shared rich-text notes surface, an in-campaign calendar, session summaries with an importer, detail view and a cliffhanger highlight modal, and basic encounter tracking.

**Auth.** Google sign-in and email/password, gated on email verification, with a one-time username claim.

## AI-generated session recaps

The session recaps and the NPC auto-notes above are not typed by hand.
A recording of the actual game goes in one end and a structured recap comes out the other.

The pipeline that produces them is a separate macOS service, outside this repository.
This repo owns the receiving end of it: the `postSessionSummary` Cloud Function in [`functions/`](functions/), plus a `getCampaignNpcs` endpoint the pipeline reads first so it can match people it hears about against the campaign's real roster.
Both are shared-secret authenticated HTTP endpoints.

```text
Discord recording (one audio track per speaker)
  -> dropped into a watched folder
  -> split per speaker, resampled to 16 kHz mono
  -> voice-activity detection finds the speech regions in each track
  -> each region transcribed on-device by a Parakeet speech model
  -> regions restamped and merged into one chronological transcript
  -> language model returns a structured session recap
       (summary, scenes, NPC mentions, cliffhangers, in-world calendar)
  -> POST  ->  postSessionSummary  (this repo, functions/)
               matches NPC mentions to the roster, creates stubs for new ones,
               writes the summary into the campaign
```

The transcription itself runs locally on the machine - Silero VAD for segmentation, a CoreML Parakeet model through a small Swift bridge for recognition - so the session audio never leaves the room.
Only the finished text transcript goes out to a language model, and only the structured recap comes back.

What lands in Table Keep is a normalized object: an overall summary, named scenes with details, NPC mentions with facts, cliffhangers, and calendar entries.
The receiver matches each NPC mention case-insensitively against the campaign roster, links unambiguous matches to the existing record, creates a stub for anyone new, and files the whole thing as a session summary with `api` source markers so a human editing it later is distinguishable from the generator.
That is why Cedric's card, in the screenshot above, knows about a store visit in Session 11.

## How it is built and tested

**Stack.** Vite + React 19 + TypeScript, React Router, Konva for the map canvas.
Firebase Authentication, Cloud Firestore, Storage, Cloud Functions (2nd gen), Hosting.
Iconify (game-icons) and lucide-react for iconography.
Vitest for tests, ESLint for linting.

### Continuous integration

Every pull request, and every push to `main`, runs [`.github/workflows/ci.yml`](.github/workflows/ci.yml).
The workflow only ever reads the repository, holds no secrets, and deploys nothing.
It runs seven jobs in parallel, each one a command you can reproduce locally:

| Check | Command |
| --- | --- |
| Lint (web app) | `npm run lint` |
| Typecheck (web app) | `npm run typecheck` |
| Unit tests (web app) | `npm test` |
| Production build (web app) | `npm run build` |
| Emulator tests (Firestore + Storage rules) | `npm run test:emulator` |
| Browser smoke (desktop + mobile) | `npm run test:browser-smoke` |
| Cloud Functions (lint + build) | `npm run lint` and `npm run build` in `functions/` |

The web app jobs run on Node 24, matching the prerequisites above.
The Cloud Functions job runs on Node 20, matching `engines.node` in `functions/package.json` and the deployed function runtime.
The split is deliberate.

### Test layers

- **Unit** (`npm test`) - Vitest over pure logic: spell catalogs and spellbook rules, inventory synchronization, VtM creation/roll/XP rules, item-transfer resolution, and the map tool-state and token-placement machines.
- **Rules** (`npm run test:emulator`) - every `src/**/*.emulator.test.ts` runs against a live Firestore + Storage emulator with the repository's real `firestore.rules` and `storage.rules` loaded, so authorization is tested as deployed rather than as intended.
  Needs JDK 21+.
- **Browser smoke** (`npm run test:browser-smoke`) - Puppeteer against local services only.
  It starts Vite inside `firebase emulators:exec`, creates isolated emulator users, completes email verification through the emulator's OOB API, claims a handle, and creates a group at both desktop and mobile viewports.
  It fails on page errors and console errors, and uploads review-only screenshots even when the run fails.

### Project layout

- `src/features/*` - feature modules: auth, groups, campaign, character (OSE and VtM), maps, monsters, items, treasure, npcs, tables, notes, transfers, tokens, navigation, common.
- `src/firebase/*` - Firebase SDK setup and emulator wiring.
- `functions/` - Cloud Functions source: session-summary ingestion, NPC roster lookup, item-transfer callable, health check.
- `scripts/demo/` - the demo harness and its committed emulator snapshot tooling.
- `emulator-data/` - the committed snapshot the demo boots from, size-budgeted at 25 MB total and 1 MB per file (`npm run demo:size`).
- Firebase config: `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`, `storage.rules`.

### Firestore data model

- `users/{userId}` - platform identity: email, username, timestamps.
- `groups/{groupId}` - the group, with `members/{userId}`, `invites/{inviteId}`, and `campaigns/{campaignId}` subcollections.
- `groups/{groupId}/campaigns/{campaignId}/...` - per-campaign data: `characters`, `npcs`, `maps` (each with `tokens`, `annotations`, `fogChunks`), `items`, `tables`, `sessionSummaries`, and per-user UI scratch under `userState/{userId}`.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check and production build |
| `npm run typecheck` | `tsc -b`, no bundle |
| `npm run lint` | ESLint |
| `npm test` | Unit tests |
| `npm run test:watch` | Unit tests in watch mode |
| `npm run test:emulator` | Firestore/Storage rules tests against live emulators |
| `npm run test:browser-smoke` | Desktop + mobile Puppeteer smoke flow |
| `npm run preview` | Preview the production build |
| `npm run demo` | Visitor demo: emulators from the committed snapshot plus the dev server, snapshot never written |
| `npm run demo:author` | Authoring demo: the same, but exports back to `./emulator-data` on exit. The only command that overwrites the committed snapshot |
| `npm run demo:save` | Export a running demo emulator without quitting it |
| `npm run demo:seed` | Re-seed the two demo accounts into a running demo emulator |
| `npm run demo:size` | Check `./emulator-data` against its commit budget |
| `npm run emulators` | Start the auth/firestore/storage emulators bare |
| `npm run emulators:import` | Start emulators with persisted state |
| `npm run emulators:export` | Export emulator state |
| `npm run deploy:hosting` | Deploy hosting |
| `npm run deploy:functions` | Deploy Cloud Functions |
| `npm run firebase:login` | Log in to the Firebase CLI |

Data-import helpers for OSE reference content also exist as `npm run ose:*`; see `package.json` and `scripts/`.

## Running against a real Firebase project

The demo needs none of this.
It is here for anyone who wants to deploy their own instance.

```bash
npm run firebase:login
npx firebase projects:create your-project-id     # or skip, and use an existing one
npx firebase use --add                           # select it, alias it "default"
npx firebase firestore:databases:create --location=us-central
npx firebase deploy --only firestore:rules,firestore:indexes,storage
```

Then copy `.env.example` to `.env.local` and fill in the `VITE_FIREBASE_*` values from the project's web app config.
Set `VITE_USE_FIREBASE_EMULATORS=true` to point a normal `npm run dev` at local emulators instead.

Auth provider toggles (Google, email/password) still have to be enabled in the Firebase console; there is no CLI for them.

> `.env.example` still lists `VITE_GM_EMAILS`.
> GM assignment moved to a per-campaign owner (`gmUserId`) some time ago, so that variable is legacy and is not read anywhere in the app.
