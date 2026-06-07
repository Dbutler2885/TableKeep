# OSE Magic-User Spell Import

The old `osesrd.opengamingnetwork.com` host is gone, but the live OSE SRD is available on Necrotic Gnome's MediaWiki site:

- https://oldschoolessentials.necroticgnome.com/srd/index.php/Magic-User_Spells

That means there are now two viable pull paths:

1. Live fetch from the Necrotic Gnome SRD
2. Local import from the plain-text spell book

## Recommended source

Prefer the live SRD fetcher when you have network access:

```bash
npm run ose:magic-user:fetch -- tmp/ose-magic-user-spells.json
```

To generate a TypeScript module instead of JSON:

```bash
npm run ose:magic-user:fetch -- src/features/character/generatedArcaneSpellCatalog.ts
```

The fetcher uses the MediaWiki API, starting from the `Magic-User Spells` index page and then pulling each individual spell page.

## Plain-text fallback

Use the plain-text edition of `Old-School Essentials: Cleric and Magic-User Spells` from Necrotic Gnome / DriveThruRPG if you want an offline source or if the site changes.

Download it as either:

- `.rtf`
- `.txt`

## Import command

```bash
npm run ose:magic-user:import -- /path/to/OSE-Cleric-and-Magic-User-Spells.rtf tmp/ose-magic-user-spells.json
```

If you omit the output path, the script prints JSON to stdout.

To generate a TypeScript module instead of JSON, point the output to a `.ts` file:

```bash
npm run ose:magic-user:import -- /path/to/OSE-Cleric-and-Magic-User-Spells.rtf src/features/character/generatedArcaneSpellCatalog.ts
```

## What the script does

- `fetch-ose-magic-user-spells.mjs`
  - reads the live `Magic-User Spells` SRD page
  - discovers spell links by level
  - pulls each spell page
  - extracts:
    - `name`
    - `level`
    - `description`
    - `rangeText`
    - `durationText`
    - `areaText`
    - `savingThrowText`
- `import-ose-magic-user-spells.mjs`
- strips basic RTF control markup when needed
- finds the `Magic-User Spells` section
- splits the text into the standard OSE magic-user spell entries
- extracts:
  - `name`
  - `level`
  - `description`
  - `rangeText`
  - `durationText`
  - `areaText`
  - `savingThrowText`
  - `reversible`
- emits normalized JSON that can be mapped into [`CharacterSpell`](/Users/davidb/Documents/Code/HomeBoysHouse/src/types/app.ts#L130)
- can also emit a TS module exporting `ARCANE_SPELL_CATALOG`

## Notes

- The scripts expect the standard OSE Classic Fantasy magic-user spell list, levels 1-6.
- Some spells have reversible counterparts. Those are flagged with `reversible: true` and `reversedName`.
- Descriptions are preserved as body text; if you want exact field-by-field modeling beyond the top-line headers, add a second normalization pass after import.
- I left the current [`spellCatalog.ts`](/Users/davidb/Documents/Code/HomeBoysHouse/src/features/character/spellCatalog.ts) untouched because it is an untracked working file in this repo. Once you have the source text locally, generate a TS module and then swap that file over in a separate pass.
