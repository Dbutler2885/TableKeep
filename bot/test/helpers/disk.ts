/**
 * Room on the journal's disk, for recorders in tests that are not about the
 * disk. A recorder asks the real disk unless told otherwise and will not start
 * a session with less than 1 GiB free, so on a nearly full machine every such
 * test would fail to start. Tests about the disk give their own figure instead.
 */
export const ROOMY_DISK = { freeDiskBytes: () => 50 * 1024 ** 3 }
