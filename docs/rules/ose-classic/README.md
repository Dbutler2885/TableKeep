# Classic Fantasy rules corpus

`corpus.json` contains 43 pages of core rules from the pre-2026 Classic Fantasy SRD, including Cleric, Dwarf, Elf, Fighter, Halfling, Magic-User, and Thief.
`monsters.json` contains the monsters and encounters, and `spells-and-items.json` contains the spells, equipment, and treasure.
All three files have the same shape.
The importer uses the English Markdown transcription maintained by the Obsidian TTRPG Community, pinned to its 2024-08-13 revision. [Pinned source](https://github.com/Obsidian-TTRPG-Community/Old-School-Essentials-Markdown/tree/3467db46613fe6f74edf9acd224420aed27e2545)

The rules text and tables are Open Game Content under OGL 1.0a.
`OGL.txt` carries the full license, the upstream Section 15 copyright notices, and the designation of all three files.
Distribute the license with any of them. [Upstream license](https://github.com/Obsidian-TTRPG-Community/Old-School-Essentials-Markdown/blob/3467db46613fe6f74edf9acd224420aed27e2545/License.md) · [Publisher’s guidance](https://necroticgnome.com/blogs/news/publishing-third-party-products-for-old-school-essentials)

## Regenerate

Run these commands from the repository root with Node 24.

```sh
npm run ose:rules:fetch
npm run ose:rules:fetch -- --check
npm test -- scripts/ose/fetch-rules.test.mjs
```

The importer generates `corpus.json`, `monsters.json`, `spells-and-items.json`, and `OGL.txt`.
The check command compares every file byte for byte against a fresh import.
It lists the folders of individual monsters, spells, and magic items through the GitHub API at the pinned revision.
Each page has a title, category, and source URL.
A page from one of those folders also has `partOf`, which names the list page it is filed under, such as "Cleric Spells".
Each section has a title, heading level, URL pinned to the upstream line, and Markdown body lines in source order.
Some parent headings introduce subheadings without their own body.

## Coverage and size

The token estimates use `o200k_base` on Markdown rendered from the headings and body lines.
They exclude provenance, the license, and other prompt text.

| Category | Pages | Sections | Tokens |
| --- | ---: | ---: | ---: |
| Character creation, statistics, and advancement | 7 | 65 | ~6,000 |
| Classic classes | 7 | 55 | ~9,100 |
| Adventuring and combat | 15 | 172 | ~13,200 |
| Magic procedures | 3 | 27 | ~1,800 |
| Wealth, weapon and vehicle rules, hiring, and strongholds | 7 | 84 | ~6,200 |
| Refereeing and XP | 4 | 18 | ~2,300 |
| **Total** | **43** | **421** | **~38,700** |

The 421 sections include 29 headings whose rules appear in their subsections.
Core procedures refer to material in the other two files, such as individual weapon ranges and damage, vessel specifications, spell effects, and monster stat blocks.

| File | Category | Pages | Sections | Tokens |
| --- | --- | ---: | ---: | ---: |
| `monsters.json` | Monster statistics rules, the monster index, and 138 monsters | 140 | 277 | ~51,300 |
| `monsters.json` | Dungeon, wilderness, and stronghold encounters, and adventuring parties | 4 | 33 | ~6,100 |
| `spells-and-items.json` | Cleric and Magic-User spell lists and 106 spells | 108 | 141 | ~17,100 |
| `spells-and-items.json` | Adventuring gear, weapons and armor, mounts, and land and water vehicles | 5 | 37 | ~6,300 |
| `spells-and-items.json` | Treasure, gems and jewellery, and 84 magic items | 100 | 230 | ~21,100 |

The weapons and armor page is split: its Weapon Qualities section is in the core rules, and the rest is in `spells-and-items.json`.
The referee chapters on monsters and NPCs, adventure scenarios, and designing dungeons, wildernesses, and base towns are in none of the files, and neither are the Advanced classes.
Index pages that only point to pages already imported are also left out: Character Classes, Equipment, and Checks, Damage, Saves.
One spell, Reincarnation, names its tables' source by product name; the importer names it as Classic Fantasy instead and records that in `spells-and-items.json`.

The transcription flattened some grouped table headers and dropped some captions.
The importer restores column labels for the affected progression, combat, and other rules tables.
It restores the captions for the starting attack values and high-level attack tables, and corrects a confirmed transcription error in the high-level table.
The source notes record the cross-checks against cached legacy SRD pages.
Minor punctuation and cross-reference errors in the transcription may remain. [Legacy player rules](https://osesrd.opengamingnetwork.com/player-characters/) · [Legacy advancement table](https://osesrd.opengamingnetwork.com/player-characters/character-advancement/)

## Prompt size

The rendered core rules are close to the existing Lubec rules document, which measures about 36,800 tokens with the same tokenizer.
Rendered with their openings and headings, the core rules measure about 40,900 tokens, the monsters about 59,200, and the spells, equipment, and treasure about 47,500.
A question that needs all three sends about 147,600 tokens of rules.
Use rendered Markdown for any benchmark because the formatted JSON is more than twice the size.

## Use in the session bot

The session bot answers rules questions in OSE sessions from the whole core corpus, with no search.
`bot/src/rules/classicFantasy.ts` renders it as one Markdown document that opens by saying it is the pre-2026 text and what its core rules leave out.
Each section heading names its page and parent sections, such as "Combat › Initiative", so an answer can cite one section.
A page filed under a list page is headed beneath it, such as "Cleric Spells › Detect Magic (C)".

The same Jev request that asks whether a rules question is waiting also asks whether that question needs a particular monster, and whether it needs a particular spell, magic item, piece of equipment, weapon, armor, mount, vehicle, or treasure.
When there is a question, each of `monsters.json` and `spells-and-items.json` that Jev scores at 0.5 or more is rendered as its own part and sent after the core rules.
The bot's image carries `OGL.txt` beside the three files, and any other copy of them must carry it too.
