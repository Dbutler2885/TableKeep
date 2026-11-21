import { sheetPayload } from './sheetIntentionEdits.js';
import { sheetObject } from './sheetIntentionPath.js';
const baseOf = (value) => value === undefined ? { exists: false } : { exists: true, value: value };
const isRow = (row) => sheetObject(row) && typeof row.id === 'string';
const isRows = (rows) => rows.every(isRow);
const isCounter = (path) => path[0] === 'lubec' && path[1] === 'counters';
function leafEdit(before, after, path) {
    if (after === undefined)
        return { kind: 'remove', path, base: baseOf(before) };
    if (isCounter(path) && typeof before === 'number' && typeof after === 'number')
        return { kind: 'delta', path, base: before, amount: after - before };
    return { kind: 'set', path, base: baseOf(before), value: after };
}
function rowChange(before, after, path) {
    const previous = before.find((row) => row.id === after.id);
    if (!previous)
        return [{ kind: 'insert', path, record: after }];
    return fieldEdits(previous, after, [...path, { recordId: after.id }]);
}
function rowRemoval(after, before, path) {
    if (after.some((row) => row.id === before.id))
        return [];
    return [{ kind: 'remove', path: [...path, { recordId: before.id }], base: baseOf(before) }];
}
function arrayEdits(before, after, path) {
    if (!isRows(before) || !isRows(after))
        return [leafEdit(before, after, path)];
    return [...before.flatMap((row) => rowRemoval(after, row, path)), ...after.flatMap((row) => rowChange(before, row, path))];
}
/** Capture only what the user actually changed in their local before/after view. */
export function sheetEditDiff(before, after, path) {
    if (sheetPayload(before) === sheetPayload(after))
        return [];
    return compositeEdits(before, after, path);
}
function compositeEdits(before, after, path) {
    if (sheetObject(before) && sheetObject(after))
        return fieldEdits(before, after, path);
    if (Array.isArray(before) && Array.isArray(after))
        return arrayEdits(before, after, path);
    return [leafEdit(before, after, path)];
}
function fieldEdits(before, after, path) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    return [...keys].flatMap((key) => sheetEditDiff(before[key], after[key], [...path, key]));
}
const PROTOCOL_FIELDS = new Set(['schemaVersion', 'schemaWrittenAt', 'sheetRevision', 'createdAt', 'updatedAt']);
/** A serialized view is used only to discover edits, never as the saved replacement. */
export function sheetRecordEdits(before, after) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    return [...keys].filter((key) => !PROTOCOL_FIELDS.has(key)).flatMap((key) => sheetEditDiff(before[key], after[key], [key]));
}
