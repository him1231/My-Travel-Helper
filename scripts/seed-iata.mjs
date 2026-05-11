#!/usr/bin/env node
// One-time seed script: pushes src/data/iata-airlines.json and
// src/data/iata-airports.json into Firestore.
//
// Layout (single doc per collection, keeps reads cheap):
//   iata/airlines  → { list: [...], updatedAt: <serverTimestamp> }
//   iata/airports  → { list: [...], updatedAt: <serverTimestamp> }
//
// The app does NOT depend on this for autocomplete (it imports the JSON
// directly from src/data). Seeding is here so the data is available to any
// future server-side feature, or to other clients that prefer Firestore.
//
// Usage:
//   1) From Firebase Console → Project Settings → Service accounts → Generate
//      new private key. Save it as `service-account.json` at the repo root
//      (it's gitignored).
//   2) npm run seed:iata

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..')

const SERVICE_ACCOUNT_PATH = join(repoRoot, 'service-account.json')

async function loadJson(rel) {
  const buf = await readFile(join(repoRoot, rel), 'utf8')
  return JSON.parse(buf)
}

async function main() {
  let serviceAccount
  try {
    serviceAccount = JSON.parse(await readFile(SERVICE_ACCOUNT_PATH, 'utf8'))
  } catch (err) {
    console.error(
      '\n  Missing service-account.json at the repo root.\n' +
      '  Download it from Firebase Console → Project Settings → Service accounts.\n' +
      '  (The file is already gitignored.)\n',
    )
    process.exitCode = 1
    return
  }

  initializeApp({ credential: cert(serviceAccount) })
  const db = getFirestore()

  const [airlines, airports] = await Promise.all([
    loadJson('src/data/iata-airlines.json'),
    loadJson('src/data/iata-airports.json'),
  ])

  console.log(`Seeding ${airlines.length} airlines and ${airports.length} airports…`)

  await db.collection('iata').doc('airlines').set({
    list: airlines,
    count: airlines.length,
    updatedAt: FieldValue.serverTimestamp(),
  })
  await db.collection('iata').doc('airports').set({
    list: airports,
    count: airports.length,
    updatedAt: FieldValue.serverTimestamp(),
  })

  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
