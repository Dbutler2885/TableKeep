import { sheetRecordEdits } from './sheetIntentionDiff.js';
import { sheetPayload } from './sheetIntentionEdits.js';
import { sheetObject } from './sheetIntentionPath.js';
const containerPath = (edit) => edit.kind === 'insert' ? edit.path : edit.path.slice(0, -1);
/** Use the actual captured storage base, including missing fields that the parser presents as defaults. */
export function capturedSheetEdits(before, after, raw) {
    const initialized = new Set();
    return sheetRecordEdits(before, after).flatMap((edit) => captureEdit(edit, raw, after, initialized));
}
function captureEdit(edit, raw, after, initialized) {
    const missing = firstMissingField(raw, containerPath(edit));
    if (missing)
        return initializeContainer(missing, after, initialized);
    if (edit.kind === 'insert')
        return [edit];
    const base = capturedBase(raw, edit.path);
    if (edit.kind === 'delta')
        return [captureDelta(edit, base, after)];
    return [{ ...edit, base }];
}
function captureDelta(edit, base, after) {
    if (base.exists && typeof base.value === 'number')
        return { ...edit, base: base.value };
    return { kind: 'set', path: edit.path, base, value: valueAt(after, edit.path) };
}
function initializeContainer(path, after, initialized) {
    const key = sheetPayload(path);
    if (initialized.has(key))
        return [];
    initialized.add(key);
    return [{ kind: 'set', path, base: { exists: false }, value: valueAt(after, path) }];
}
function valueAt(value, path) {
    return path.reduce((current, segment) => typeof segment === 'string' ? objectField(current, segment) : findRow(current, segment.recordId), value);
}
function objectField(value, key) {
    return sheetObject(value) ? value[key] : undefined;
}
function findRow(value, id) {
    if (!Array.isArray(value))
        return undefined;
    return value.find((row) => sheetObject(row) && row.id === id);
}
function firstMissingField(value, path, prefix = []) {
    const [segment, ...rest] = path;
    if (segment === undefined)
        return undefined;
    if (typeof segment === 'string')
        return missingObjectField(value, segment, rest, prefix);
    return firstMissingField(findRow(value, segment.recordId), rest, [...prefix, segment]);
}
function missingObjectField(value, key, rest, prefix) {
    if (!sheetObject(value))
        return undefined;
    if (!Object.hasOwn(value, key))
        return [...prefix, key];
    return firstMissingField(value[key], rest, [...prefix, key]);
}
function capturedBase(raw, path) {
    const parent = valueAt(raw, path.slice(0, -1));
    const leaf = path.at(-1);
    if (typeof leaf === 'string')
        return objectBase(parent, leaf);
    const row = findRow(parent, leaf.recordId);
    return row === undefined ? { exists: false } : { exists: true, value: row };
}
function objectBase(value, key) {
    if (!sheetObject(value) || !Object.hasOwn(value, key))
        return { exists: false };
    return { exists: true, value: value[key] };
}
