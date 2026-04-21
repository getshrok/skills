#!/usr/bin/env node

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const SKILL_DIR = import.meta.dirname
const MEMORY_FILE = join(SKILL_DIR, 'MEMORY.md')
const BASE = 'https://api.trello.com/1'

function loadMemory() {
  if (!existsSync(MEMORY_FILE)) return {}
  const result = {}
  for (const line of readFileSync(MEMORY_FILE, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    result[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return result
}

function getAuth() {
  const mem = loadMemory()
  if (!mem.TRELLO_API_KEY || !mem.TRELLO_TOKEN) {
    throw new Error('Missing TRELLO_API_KEY or TRELLO_TOKEN in MEMORY.md')
  }
  return { key: mem.TRELLO_API_KEY, token: mem.TRELLO_TOKEN }
}

async function trelloFetch(path, options = {}) {
  const auth = getAuth()
  const sep = path.includes('?') ? '&' : '?'
  const url = `${BASE}${path}${sep}key=${auth.key}&token=${auth.token}`
  const resp = await fetch(url, options)
  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`Trello API ${resp.status}: ${err}`)
  }
  if (resp.status === 204) return null
  return resp.json()
}

function parseArgs(args) {
  const opts = {}
  const positional = []
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2)
      opts[key] = args[++i]
    } else {
      positional.push(args[i])
    }
  }
  return { opts, positional }
}

const [cmd, ...args] = process.argv.slice(2)

if (!cmd || cmd === '--help' || cmd === '-h') {
  console.log(`Usage: trello.mjs <command> [options]

Reads credentials from MEMORY.md (TRELLO_API_KEY, TRELLO_TOKEN).

Commands:
  boards                              List all open boards
  board <id>                          Get board details (lists, labels, members)
  lists <boardId>                     List all lists on a board
  create-list <boardId> --name NAME   Create a new list
  cards <listId>                      List cards in a list
  card <cardId>                       Get card details
  create-card <listId> --name NAME [--desc D] [--due DATE] [--labels L1,L2]
  update-card <cardId> [--name N] [--desc D] [--due DATE] [--list LISTID] [--pos top|bottom]
  archive-card <cardId>               Archive a card
  comment <cardId> --text TEXT        Add a comment to a card
  labels <boardId>                    List labels on a board
  create-label <boardId> --name NAME --color COLOR
  add-label <cardId> --label LABELID  Add label to card
  remove-label <cardId> --label LABELID
  checklist <cardId> --name NAME      Create a checklist on a card
  check-item <checklistId> --name N   Add item to checklist
  complete-item <cardId> <itemId>     Mark checklist item complete
  search --query Q [--type cards|boards]
  me                                  Show authenticated user info`)
  process.exit(0)
}

try {
  const { opts, positional } = parseArgs(args)

  switch (cmd) {
    case 'boards': {
      const data = await trelloFetch('/members/me/boards?filter=open&fields=name,desc,url,shortUrl')
      console.log(JSON.stringify(data.map(b => ({
        id: b.id, name: b.name, desc: b.desc, url: b.shortUrl || b.url,
      })), null, 2))
      break
    }

    case 'board': {
      const id = positional[0]
      if (!id) { console.error('Usage: trello.mjs board <boardId>'); process.exit(1) }
      const data = await trelloFetch(`/boards/${id}?fields=name,desc,url&lists=open&labels=all&members=all`)
      console.log(JSON.stringify({
        id: data.id, name: data.name, desc: data.desc, url: data.url,
        lists: data.lists?.map(l => ({ id: l.id, name: l.name })),
        labels: data.labels?.map(l => ({ id: l.id, name: l.name, color: l.color })),
        members: data.members?.map(m => ({ id: m.id, username: m.username, fullName: m.fullName })),
      }, null, 2))
      break
    }

    case 'lists': {
      const boardId = positional[0]
      if (!boardId) { console.error('Usage: trello.mjs lists <boardId>'); process.exit(1) }
      const data = await trelloFetch(`/boards/${boardId}/lists?filter=open`)
      console.log(JSON.stringify(data.map(l => ({ id: l.id, name: l.name })), null, 2))
      break
    }

    case 'create-list': {
      const boardId = positional[0]
      if (!boardId || !opts.name) { console.error('Usage: trello.mjs create-list <boardId> --name NAME'); process.exit(1) }
      const data = await trelloFetch('/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: opts.name, idBoard: boardId, pos: opts.pos || 'bottom' }),
      })
      console.log(JSON.stringify({ id: data.id, name: data.name }, null, 2))
      break
    }

    case 'cards': {
      const listId = positional[0]
      if (!listId) { console.error('Usage: trello.mjs cards <listId>'); process.exit(1) }
      const data = await trelloFetch(`/lists/${listId}/cards?fields=name,desc,due,dueComplete,labels,idMembers,shortUrl,pos`)
      console.log(JSON.stringify(data.map(c => ({
        id: c.id, name: c.name, desc: c.desc?.slice(0, 200),
        due: c.due, dueComplete: c.dueComplete,
        labels: c.labels?.map(l => l.name || l.color),
        url: c.shortUrl,
      })), null, 2))
      break
    }

    case 'card': {
      const cardId = positional[0]
      if (!cardId) { console.error('Usage: trello.mjs card <cardId>'); process.exit(1) }
      const data = await trelloFetch(`/cards/${cardId}?fields=name,desc,due,dueComplete,labels,idMembers,idList,shortUrl,closed&checklists=all&members=true`)
      console.log(JSON.stringify({
        id: data.id, name: data.name, desc: data.desc,
        due: data.due, dueComplete: data.dueComplete, closed: data.closed,
        list: data.idList, url: data.shortUrl,
        labels: data.labels?.map(l => ({ id: l.id, name: l.name, color: l.color })),
        members: data.members?.map(m => ({ id: m.id, username: m.username })),
        checklists: data.checklists?.map(cl => ({
          id: cl.id, name: cl.name,
          items: cl.checkItems?.map(ci => ({ id: ci.id, name: ci.name, state: ci.state })),
        })),
      }, null, 2))
      break
    }

    case 'create-card': {
      const listId = positional[0]
      if (!listId || !opts.name) { console.error('Usage: trello.mjs create-card <listId> --name NAME [--desc D] [--due DATE] [--labels L1,L2]'); process.exit(1) }
      const body = { name: opts.name, idList: listId }
      if (opts.desc) body.desc = opts.desc
      if (opts.due) body.due = opts.due
      if (opts.labels) body.idLabels = opts.labels
      if (opts.pos) body.pos = opts.pos
      const data = await trelloFetch('/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      console.log(JSON.stringify({ id: data.id, name: data.name, url: data.shortUrl }, null, 2))
      break
    }

    case 'update-card': {
      const cardId = positional[0]
      if (!cardId) { console.error('Usage: trello.mjs update-card <cardId> [--name N] [--desc D] [--due DATE] [--list LISTID] [--pos top|bottom]'); process.exit(1) }
      const body = {}
      if (opts.name) body.name = opts.name
      if (opts.desc) body.desc = opts.desc
      if (opts.due) body.due = opts.due
      if (opts.list) body.idList = opts.list
      if (opts.pos) body.pos = opts.pos
      const data = await trelloFetch(`/cards/${cardId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      console.log(JSON.stringify({ ok: true, id: data.id, name: data.name }, null, 2))
      break
    }

    case 'archive-card': {
      const cardId = positional[0]
      if (!cardId) { console.error('Usage: trello.mjs archive-card <cardId>'); process.exit(1) }
      await trelloFetch(`/cards/${cardId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ closed: true }),
      })
      console.log(JSON.stringify({ ok: true, archived: cardId }))
      break
    }

    case 'comment': {
      const cardId = positional[0]
      if (!cardId || !opts.text) { console.error('Usage: trello.mjs comment <cardId> --text TEXT'); process.exit(1) }
      const data = await trelloFetch(`/cards/${cardId}/actions/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: opts.text }),
      })
      console.log(JSON.stringify({ ok: true, id: data.id }, null, 2))
      break
    }

    case 'labels': {
      const boardId = positional[0]
      if (!boardId) { console.error('Usage: trello.mjs labels <boardId>'); process.exit(1) }
      const data = await trelloFetch(`/boards/${boardId}/labels`)
      console.log(JSON.stringify(data.map(l => ({ id: l.id, name: l.name, color: l.color })), null, 2))
      break
    }

    case 'create-label': {
      const boardId = positional[0]
      if (!boardId || !opts.name || !opts.color) { console.error('Usage: trello.mjs create-label <boardId> --name NAME --color COLOR'); process.exit(1) }
      const data = await trelloFetch('/labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: opts.name, color: opts.color, idBoard: boardId }),
      })
      console.log(JSON.stringify({ id: data.id, name: data.name, color: data.color }, null, 2))
      break
    }

    case 'add-label': {
      const cardId = positional[0]
      if (!cardId || !opts.label) { console.error('Usage: trello.mjs add-label <cardId> --label LABELID'); process.exit(1) }
      await trelloFetch(`/cards/${cardId}/idLabels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: opts.label }),
      })
      console.log(JSON.stringify({ ok: true }))
      break
    }

    case 'remove-label': {
      const cardId = positional[0]
      if (!cardId || !opts.label) { console.error('Usage: trello.mjs remove-label <cardId> --label LABELID'); process.exit(1) }
      await trelloFetch(`/cards/${cardId}/idLabels/${opts.label}`, { method: 'DELETE' })
      console.log(JSON.stringify({ ok: true }))
      break
    }

    case 'checklist': {
      const cardId = positional[0]
      if (!cardId || !opts.name) { console.error('Usage: trello.mjs checklist <cardId> --name NAME'); process.exit(1) }
      const data = await trelloFetch('/checklists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idCard: cardId, name: opts.name }),
      })
      console.log(JSON.stringify({ id: data.id, name: data.name }, null, 2))
      break
    }

    case 'check-item': {
      const checklistId = positional[0]
      if (!checklistId || !opts.name) { console.error('Usage: trello.mjs check-item <checklistId> --name NAME'); process.exit(1) }
      const data = await trelloFetch(`/checklists/${checklistId}/checkItems`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: opts.name }),
      })
      console.log(JSON.stringify({ id: data.id, name: data.name, state: data.state }, null, 2))
      break
    }

    case 'complete-item': {
      const cardId = positional[0]
      const itemId = positional[1]
      if (!cardId || !itemId) { console.error('Usage: trello.mjs complete-item <cardId> <checkItemId>'); process.exit(1) }
      await trelloFetch(`/cards/${cardId}/checkItem/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: 'complete' }),
      })
      console.log(JSON.stringify({ ok: true }))
      break
    }

    case 'search': {
      if (!opts.query) { console.error('Usage: trello.mjs search --query Q [--type cards|boards]'); process.exit(1) }
      const types = opts.type || 'cards,boards'
      const data = await trelloFetch(`/search?query=${encodeURIComponent(opts.query)}&modelTypes=${types}&cards_limit=10`)
      const result = {}
      if (data.cards) result.cards = data.cards.map(c => ({ id: c.id, name: c.name, desc: c.desc?.slice(0, 100), url: c.shortUrl }))
      if (data.boards) result.boards = data.boards.map(b => ({ id: b.id, name: b.name, url: b.shortUrl }))
      console.log(JSON.stringify(result, null, 2))
      break
    }

    case 'me': {
      const data = await trelloFetch('/members/me?fields=fullName,username,email,url')
      console.log(JSON.stringify(data, null, 2))
      break
    }

    default:
      console.error(`Unknown command: ${cmd}. Run trello.mjs --help`)
      process.exit(1)
  }
} catch (err) {
  console.error(JSON.stringify({ error: err.message }))
  process.exit(1)
}
