import { getApps, initializeApp } from 'firebase-admin/app'
import type { App } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import type { Firestore } from 'firebase-admin/firestore'

/**
 * The one admin SDK app this package uses.
 *
 * `initializeApp()` throws if it is called twice in a process, which used to
 * mean that at most one emulator suite could import anything reaching into
 * `functions/src`. Going through here instead makes the initialisation
 * idempotent, so a second suite can import a second module without the two
 * colliding.
 */
export function adminApp(): App {
  return getApps()[0] ?? initializeApp()
}

export function adminFirestore(): Firestore {
  return getFirestore(adminApp())
}
