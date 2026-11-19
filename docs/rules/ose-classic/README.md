# Classic Fantasy rules corpus

`corpus.json` contains 43 pages from the pre-2026 Classic Fantasy SRD, including Cleric, Dwarf, Elf, Fighter, Halfling, Magic-User, and Thief.
The importer uses the English Markdown transcription maintained by the Obsidian TTRPG Community, pinned to its 2024-08-13 revision. [Pinned source](https://github.com/Obsidian-TTRPG-Community/Old-School-Essentials-Markdown/tree/3467db46613fe6f74edf9acd224420aed27e2545)

The rules text and tables are Open Game Content under OGL 1.0a.
`OGL.txt` carries the full license, the upstream Section 15 copyright notices, and the corpus designation.
Distribute the license with the corpus. [Upstream license](https://github.com/Obsidian-TTRPG-Community/Old-School-Essentials-Markdown/blob/3467db46613fe6f74edf9acd224420aed27e2545/License.md) · [Publisher’s guidance](https://necroticgnome.com/blogs/news/publishing-third-party-products-for-old-school-essentials)

## Regenerate

Run these commands from the repository root with Node 24.

```sh
npm run ose:rules:fetch
npm run ose:rules:fetch -- --check
npm test -- scripts/ose/fetch-rules.test.mjs
```

The importer generates both `corpus.json` and `OGL.txt`.
The check command compares both files byte for byte against a fresh import.
Each page has a title, category, and source URL.
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
Spell lists and descriptions, monster entries and encounter catalogs, treasure catalogs, equipment catalogs, and Advanced classes are outside this import.
Core procedures still refer to some excluded material, such as individual weapon ranges and damage, vessel specifications, spell effects, and monster stat blocks.

The transcription flattened some grouped table headers and dropped some captions.
The importer restores column labels for the affected progression, combat, and other rules tables.
It restores the captions for the starting attack values and high-level attack tables, and corrects a confirmed transcription error in the high-level table.
The source notes record the cross-checks against cached legacy SRD pages.
Minor punctuation and cross-reference errors in the transcription may remain. [Legacy player rules](https://osesrd.opengamingnetwork.com/player-characters/) · [Legacy advancement table](https://osesrd.opengamingnetwork.com/player-characters/character-advancement/)

## Prompt size

The rendered corpus is close to the existing Lubec rules document, which measures about 36,800 tokens with the same tokenizer.
A whole-corpus prompt is practical as a benchmark for a session using a single system.
Use rendered Markdown for that benchmark because the formatted JSON alone takes about 86,900 tokens.
The ~38,700-token rules prefix sits alongside Jev's transcript and previous answers.

## Use in the session bot

The session bot answers rules questions in OSE sessions from the whole corpus, with no search.
`bot/src/rules/classicFantasy.ts` renders it as one Markdown document that opens by saying it is the pre-2026 text and what it leaves out.
Each section heading names its page and parent sections, such as "Combat › Initiative", so an answer can cite one section.
The bot's image carries `OGL.txt` beside `corpus.json`, and any other copy of the corpus must carry it too.
