#!/usr/bin/env node
// folders.mjs — List all Zoho Mail folders.
// Usage: node folders.mjs

import { getAccessToken, zohoGet } from './_shared.mjs'

const token = await getAccessToken()
const data  = await zohoGet('/folders', token)

const folders = (data.data ?? []).map(f => ({
  id:        f.folderId,
  name:      f.folderName,
  path:      f.folderPath ?? f.folderName,
  unread:    f.unreadCount ?? 0,
  total:     f.messageCount ?? 0,
}))

console.log(JSON.stringify(folders, null, 2))
