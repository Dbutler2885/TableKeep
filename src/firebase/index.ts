import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'
import { connectStorageEmulator, getStorage } from 'firebase/storage'
import { firebaseConfig, useFirebaseEmulators } from './config'
import { emulatorPortsFromEnv } from './emulatorPorts'

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const db = getFirestore(app)
export const functions = getFunctions(app, 'us-central1')
export const storage = getStorage(app)

if (useFirebaseEmulators) {
  const host = '127.0.0.1'
  const ports = emulatorPortsFromEnv(import.meta.env)

  connectAuthEmulator(auth, `http://${host}:${ports.auth}`, { disableWarnings: true })
  connectFirestoreEmulator(db, host, ports.firestore)
  connectFunctionsEmulator(functions, host, ports.functions)
  connectStorageEmulator(storage, host, ports.storage)
}
