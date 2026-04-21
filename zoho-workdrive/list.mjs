#!/usr/bin/env node
// list.mjs — List files in a WorkDrive folder.
// Usage: node list.mjs --folder-id <id> [--help]

import { parseArgs } from 'node:util'
import { EXIT, getAccessToken, wdGet } from './_shared.mjs'

const { values } = parseArgs({
  options: {
    'folder-id': { type: 'string' },
    help:        { type: 'boolean' },
  },
  strict: true,
})

if (values.help || !values['folder-id']) {
  console.log(`Usage: node list.mjs --folder-id <id>`)
  process.exit(values.help ? EXIT.OK : EXIT.USAGE)
}

const token = await getAccessToken()
const data = await wdGet(`/files/${values['folder-id']}/files`, token)

const files = (data.data ?? []).map(f => ({
  id:       f.id,
  name:     f.attributes?.name,
  type:     f.attributes?.type,
  modified: f.attributes?.last_modified_time,
}))
console.log(JSON.stringify(files, null, 2))
