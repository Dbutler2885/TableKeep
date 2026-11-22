import { applySheetEdit, sheetPayload } from './sheetIntentionEdits.js';
import { validateSheetIntention } from './sheetIntentionValidation.js';
import { SheetRepair } from './sheetIntentionTypes.js';
/** A missing legacy revision is zero; corrupt revisions require repair. */
export function readSheetRevision(sheet) {
    const revision = sheet.sheetRevision === undefined ? 0 : sheet.sheetRevision;
    if (!Number.isSafeInteger(revision) || revision < 0 || revision === Number.MAX_SAFE_INTEGER)
        throw new SheetRepair('invalid-revision');
    return revision;
}
function committedPlan(sheet, intention) {
    const revision = readSheetRevision(sheet);
    if (intention.baseRevision > revision)
        throw new SheetRepair('future-revision');
    const edited = intention.edits.reduce(applySheetEdit, sheet);
    const outcome = { status: 'committed', operationId: intention.operationId, revision: revision + 1 };
    return { outcome, mutation: { sheet: { ...edited, sheetRevision: outcome.revision }, receipt: { intention, outcome } } };
}
function planCurrentSheet(sheet, intention, receipt) {
    if (receipt) {
        if (sheetPayload(receipt.intention) !== sheetPayload(intention))
            throw new SheetRepair('operation-id-reused');
        return { outcome: receipt.outcome };
    }
    if (!sheet)
        throw new SheetRepair('sheet-deleted');
    return committedPlan(sheet, intention);
}
/** Pure canonical-data planning. No parser or serializer can discard future fields or schema stamps here. */
export function planSheetIntention(sheet, intention, receipt) {
    try {
        validateSheetIntention(intention);
        return planCurrentSheet(sheet, intention, receipt);
    }
    catch (error) {
        if (!(error instanceof SheetRepair))
            throw error;
        return { outcome: { status: 'repair', code: error.code, path: error.path } };
    }
}
