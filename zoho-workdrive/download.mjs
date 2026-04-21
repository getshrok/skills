#!/usr/bin/env node
// download.mjs — Download a file from WorkDrive.
// Usage: node download.mjs --file-id <id> --out <local-path> [--help]

import { parseArgs } from 'node:util'
import { createWriteStream } from 'node:fs'
import { Readable } from 'node:stream'
import { EXIT, getAccessToken } from './_shared.mjs'

const { values } = parseArgs({
  options: {
    'file-id': { type: 'string' },
    out:       { type: 'string' },
    help:      { type: 'boolean' },
  },
  strict: true,
})

if (values.help || !values['file-id'] || !values.out) {
  console.log(`Usage: node download.mjs --file-id <id> --out <local-path>`)
  process.exit(values.help ? EXIT.OK : EXIT.USAGE)
}

const token = await getAccessToken()
const res = await fetch(`https://workdrive.zoho.com/api/v1/files/${values['file-id']}/content`, {
  headers: { Authorization: `Zoho-oauthtoken ${token}` },
})

if (!res.ok) {
  console.error(`Download failed (${res.status}): ${await res.text()}`)
  process.exit(EXIT.CONNECTION)
}

const writer = createWriteStream(values.out)
await Readable.fromWeb(res.body).pipe(writer)
writer.on('finish', () => console.log(JSON.stringify({ saved: values.out })))
