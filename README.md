# Home Boys House

OSE campaign sidecar app built with Vite + React + Firebase.

## Current Status
Milestone 0 bootstrap is complete:
- Vite React TypeScript app scaffolded
- Firebase SDK wired (Auth, Firestore, Storage)
- Emulator and rules config added
- CLI scripts added for emulator/deploy workflows

## Prerequisites
- Node.js 24+
- npm 11+
- Java 21+ (required for Firestore emulator)

## Install
```bash
npm install
```

## Environment Setup
1. Copy env file:
```bash
cp .env.example .env.local
```
2. Fill Firebase web app config values in `.env.local`.
3. Set `VITE_GM_EMAILS` to your GM email(s), comma-separated.

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
You can do most via CLI, but Auth provider toggles still often need console/UI.

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
1. Set emulator flag in `.env.local`:
```bash
VITE_USE_FIREBASE_EMULATORS=true
```
2. Start emulators:
```bash
npm run emulators
```
3. Start app in another terminal:
```bash
npm run dev
```

## Scripts
- `npm run dev` - start Vite dev server
- `npm run build` - type-check + production build
- `npm run emulators` - start auth/firestore/storage emulators
- `npm run emulators:import` - start emulators and persist state
- `npm run emulators:export` - export emulator state
- `npm run deploy:hosting` - deploy web app hosting
- `npm run deploy:functions` - deploy Cloud Functions (when added)

## Files Added For Firebase
- `firebase.json`
- `.firebaserc`
- `firestore.rules`
- `firestore.indexes.json`
- `storage.rules`
- `src/firebase/config.ts`
- `src/firebase/index.ts`
- `src/vite-env.d.ts`

## Important Notes
- Single active campaign model is enabled in app bootstrap.
- Any authenticated user is auto-joined to the active campaign as `player`.
- Emails listed in `VITE_GM_EMAILS` are auto-assigned `gm` role.
