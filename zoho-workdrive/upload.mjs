#!/usr/bin/env node
// upload.mjs — Upload a file to a WorkDrive folder.
// Usage: node upload.mjs --folder-id <id> --file <local-path> [--name <filename>] [--help]

import { parseArgs } from 'node:util'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { EXIT, getAccessToken } from './_shared.mjs'

const { values } = parseArgs({
  options: {
    'folder-id': { type: 'string' },
    file:        { type: 'string' },
    name:        { type: 'string' },
    help:        { type: 'boolean' },
  },
  strict: true,
})

if (values.help || !values['folder-id'] || !values.file) {
  console.log(`Usage: node upload.mjs --folder-id <id> --file <local-path> [--name <filename>]`)
  process.exit(values.help ? EXIT.OK : EXIT.USAGE)
}

const token = await getAccessToken()
const filename = values.name ?? basename(values.file)
const fileContent = readFileSync(values.file)

const form = new FormData()
form.append('filename', filename)
form.append('parent_id', values['folder-id'])
form.append('content', new Blob([fileContent]), filename)

const res = await fetch('https://workdrive.zoho.com/api/v1/upload', {
  method: 'POST',
  headers: { Authorization: `Zoho-oauthtoken ${token}` },
  body: form,
})

if (!res.ok) {
  console.error(`Upload failed (${res.status}): ${await res.text()}`)
  process.exit(EXIT.CONNECTION)
}

const data = await res.json()
console.log(JSON.stringify(data.data ?? data, null, 2))
