import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `functions/` is a separate npm package with its own Node-targeted flat
  // config; linting it from here would apply the browser/React rule set to a
  // Cloud Functions entrypoint (and to its compiled `lib/` output).
  globalIgnores(['dist', 'functions']),
  {
    name: 'node-scripts',
    files: ['scripts/browser-smoke.mjs'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        document: 'readonly',
      },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // The codebase uses a leading underscore to mark bindings that are
      // destructured for documentation but deliberately not read.
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },

  // ---------------------------------------------------------------------------
  // Recorded lint debt: eslint-plugin-react-hooks v7
  //
  // v7 promoted `set-state-in-effect`, `refs`, `immutability` and `purity` into
  // its recommended set. The files listed below predate those rules, and every
  // remaining violation needs a real behavioural change to a hook rather than a
  // mechanical edit, so they are recorded here as warnings instead of blocking
  // the first CI baseline. Every other file is held to the full error-level rule
  // set, so no new violations can land outside this list.
  //
  // Delete entries as the hooks in them are reworked; do not add new ones.
  // ---------------------------------------------------------------------------
  {
    name: 'react-hooks-v7-debt/set-state-in-effect',
    files: [
      'src/features/character/useItemApprovals.ts',
      'src/features/character/useSpellbookDomain.ts',
      'src/features/invites/AcceptInvite.tsx',
      'src/features/invites/useInvites.ts',
      'src/features/items/useItems.ts',
      'src/features/maps/MapsTab.tsx',
      'src/features/maps/hooks/useTokenSelection.ts',
      'src/features/notes/CliffhangerModal.tsx',
      'src/features/notes/NotesTab.tsx',
      'src/features/notes/SessionNoteDetail.tsx',
      'src/features/notes/useSessionNotes.ts',
      'src/features/npcs/NpcsTab.tsx',
      'src/features/tables/TablesTab.tsx',
      'src/features/tables/useTables.ts',
      'src/features/tokens/TokenIconEditor.tsx',
      'src/features/transfers/usePendingTransfers.ts',
    ],
    rules: { 'react-hooks/set-state-in-effect': 'warn' },
  },
  {
    name: 'react-hooks-v7-debt/refs',
    files: [
      'src/features/character/BlurSyncedTextarea.tsx',
      'src/features/maps/hooks/useTokenAnimation.ts',
    ],
    rules: { 'react-hooks/refs': 'warn' },
  },
  {
    name: 'react-hooks-v7-debt/immutability',
    files: [
      'src/features/character/CharacterPackedItemsSection.tsx',
      'src/features/character/useCharacters.ts',
    ],
    rules: { 'react-hooks/immutability': 'warn' },
  },
  {
    name: 'react-hooks-v7-debt/purity',
    files: ['src/features/groups/GroupHome.tsx'],
    rules: { 'react-hooks/purity': 'warn' },
  },
])
