#!/usr/bin/env node
// search.mjs — Search for files in WorkDrive by name (client-side, one folder deep).
// Usage: node search.mjs --query <text> [--folder-id <id>] [--help]
//
// Defaults to the main library root. Pass --folder-id to search within a specific folder.
// Matches are case-insensitive substring on file/folder name.

import { parseArgs } from 'node:util'
import { EXIT, getAccessToken, wdGet } from './_shared.mjs'

const { values } = parseArgs({
  options: {
    query:      { type: 'string' },
    'folder-id': { type: 'string' },
    help:        { type: 'boolean' },
  },
  strict: true,
})

if (values.help || !values.query) {
  console.log(`Usage: node search.mjs --query <text> [--folder-id <id>]

Searches by name within a folder (case-insensitive substring match).
Defaults to ZOHO_WORKDRIVE_MAIN_LIBRARY_ID if --folder-id is omitted.`)
  process.exit(values.help ? EXIT.OK : EXIT.USAGE)
}

const folderId = values['folder-id'] ?? process.env.ZOHO_WORKDRIVE_MAIN_LIBRARY_ID
if (!folderId) {
  console.error('No folder ID — pass --folder-id or set ZOHO_WORKDRIVE_MAIN_LIBRARY_ID')
  process.exit(EXIT.USAGE)
}

const token = await getAccessToken()
const data = await wdGet(`/files/${folderId}/files`, token)
const query = values.query.toLowerCase()

const matches = (data.data ?? [])
  .filter(f => f.attributes?.name?.toLowerCase().includes(query))
  .map(f => ({
    id:       f.id,
    name:     f.attributes?.name,
    type:     f.attributes?.type,
    modified: f.attributes?.last_modified_time,
  }))

console.log(JSON.stringify(matches, null, 2))
