# Character characterization tests

Production source is unchanged.
The tests record current behavior, including validation order, selection-keyed finalization state, embedded filtering, sorting, permissions, ability editing, approval routing, and dialog callbacks.
Real controls and domain hooks are exercised alongside isolated callback contracts; Firebase IO is mocked and no emulator or production service was used.

| Measure | CharacterTab before | CharacterTab after | useCharacterRoster before | useCharacterRoster after |
| --- | ---: | ---: | ---: | ---: |
| Complexity | 61 | 61 | 26 | 26 |
| Branch coverage | 26.12% | 98.19% | 19.56% | 97.82% |
| CRAP | 1561.1 | 61.0 | 377.8 | 26.0 |
| Mutation score | 9.64% | 97.50% | 22.22% | 96.30% |

StrykerJS 10.1.1 with the Vitest runner generated 388 mutants, scoped to the two source files.
Overall mutation score: **13.14% before; 97.16% after** (375 killed, 2 timeouts, 9 survivors, 2 uncovered).
Both timeout mutants were killed in an isolated recheck with a 20-second timeout; the score is unchanged.
No mutation operators were excluded and no mutants were suppressed.

Measured with `crapper --no-coverage` for complexity and the full `npm test -- --coverage` run with Vitest v8 LCOV restricted to these two files.
`crapper --use-existing-coverage` read that LCOV for the branch coverage and CRAP figures above.
Validation: 2,184 tests passed (75 added), root lint, project typecheck, and a separate typecheck of the new tests passed on Node 24.15.

Run mutation tests with `npm run test:mutation:character`; reports go to `artifacts/character-mutation/` and nothing was added to CI.

Remaining mutants (ids from the JSON report; reasons refer to current call paths):

| File | Mutant | Reason |
| --- | --- | --- |
| CharacterTab | 116, line 291 | Removing the null-selection guard is equivalent because `canEditAbilityScores` is false without a selected character. |
| CharacterTab | 167, line 329 | The class callback is only passed to a mounted core sheet, which requires a non-null selection. |
| CharacterTab | 232, line 538 | Removing the empty-id guard only adds `Set.delete('')`; seeded ids are nonempty Firestore document ids. |
| CharacterTab | 239, line 555 | Calling grant-exit unconditionally is equivalent because that hook itself checks whether grant mode is active. |
| CharacterTab | 245, line 560 | Setting pane state on a wide layout is invisible; the resize hook recomputes it when entering single-pane mode. |
| CharacterTab | 277, line 664 | Bottom navigation never consumes its back-to-list callback. |
| CharacterTab | 278, line 664 (uncovered) | The altered string is inside that same unused bottom-navigation callback. |
| useCharacterRoster | 296, line 21 | Changing the no-selection key to another unique literal preserves all comparisons and setter behavior. |
| useCharacterRoster | 330, line 38 | Validation is private and only called after the request handler rejects a null selection. |
| useCharacterRoster | 331, line 38 (uncovered) | The no-selection validation message is unreachable behind that request guard. |
| useCharacterRoster | 361, line 43 | Both the original empty-name fallback and its replacement fail the `holy symbol` substring check. |
