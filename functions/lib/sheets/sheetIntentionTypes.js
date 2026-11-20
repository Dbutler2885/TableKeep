export class SheetRepair extends Error {
    code;
    path;
    constructor(code, path = []) {
        super(code);
        this.code = code;
        this.path = path;
    }
}
