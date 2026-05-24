#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SKILL_DIR = import.meta.dirname
const CRED_STORE = process.env.TRELLO_CRED_STORE || join(SKILL_DIR, '.trello-credentials.json')
const BASE = 'https://api.trello.com/1'

// Selected account alias (from --account / -a). The model passes only the alias.
let ACCOUNT = null

// ── Credentials store ─────────────────────────────────────────────────────────
// { "accounts": { "<alias>": { label, api_key, token } }, "default": "<alias>|null" }
// See the committed .trello-credentials.json for the example shape.
function loadCredStore() {
  try {
    const s = JSON.parse(readFileSync(CRED_STORE, 'utf8'))
    if (!s.accounts) s.accounts = {}
    if (!('default' in s)) s.default = null
    return s
  } catch { return { accounts: {}, default: null } }
}
function saveCredStore(store) { writeFileSync(CRED_STORE, JSON.stringify(store, null, 2) + '\n') }
function fingerprint(s) { if (!s) return null; return s.length <= 8 ? '••••' : `…${s.slice(-4)} (len ${s.length})` }

function getAuth() {
  // Env-var override: one-off escape hatch. Normal path is the store via --account.
  if (process.env.TRELLO_API_KEY && process.env.TRELLO_TOKEN) {
    return { key: process.env.TRELLO_API_KEY, token: process.env.TRELLO_TOKEN }
  }
  const store = loadCredStore()
  const aliases = Object.keys(store.accounts)
  const acct = ACCOUNT || store.default || (aliases.length === 1 ? aliases[0] : null)
  if (!acct) throw new Error(`No account selected. Pass --account <alias>. Available: ${aliases.join(', ') || '(none — add one with: trello.mjs creds set <alias> ...)'}`)
  const entry = store.accounts[acct]
  if (!entry) throw new Error(`Unknown account '${acct}'. Available: ${aliases.join(', ') || '(none)'}`)
  if (!entry.api_key || !entry.token) throw new Error(`Account '${acct}' is missing api_key or token. Set with: trello.mjs creds set ${acct} --api-key ... --token ...`)
  return { key: entry.api_key, token: entry.token }
}

function manageCreds(argv) {
  const sub = argv[0]
  const store = loadCredStore()
  if (sub === 'list' || !sub) {
    const accounts = Object.entries(store.accounts).map(([alias, e]) => ({ account: alias, default: store.default === alias, label: e.label ?? null, api_key: fingerprint(e.api_key), token: fingerprint(e.token) }))
    console.log(JSON.stringify({ accounts, default: store.default }, null, 2)); return
  }
  if (sub === 'set') {
    const alias = argv[1]
    if (!alias) { console.error('Usage: trello.mjs creds set <alias> [--label L] [--api-key KEY] [--token T] [--default] [--stdin]'); process.exit(1) }
    const entry = store.accounts[alias] ?? {}
    let useStdin = false, makeDefault = false
    for (let i = 2; i < argv.length; i++) {
      if (argv[i] === '--label') entry.label = argv[++i]
      else if (argv[i] === '--api-key') entry.api_key = argv[++i]
      else if (argv[i] === '--token') entry.token = argv[++i]
      else if (argv[i] === '--stdin') useStdin = true
      else if (argv[i] === '--default') makeDefault = true
    }
    if (useStdin) { const blob = JSON.parse(readFileSync(0, 'utf8')); for (const k of ['label', 'api_key', 'token']) if (blob[k] != null) entry[k] = blob[k] }
    store.accounts[alias] = entry
    if (makeDefault || store.default == null) store.default = alias
    saveCredStore(store)
    console.log(JSON.stringify({ ok: true, account: alias, default: store.default, label: entry.label ?? null, api_key: fingerprint(entry.api_key), token: fingerprint(entry.token) }, null, 2)); return
  }
  if (sub === 'set-default') {
    const alias = argv[1]
    if (!alias || !store.accounts[alias]) { console.error(`Unknown account '${alias}'. Available: ${Object.keys(store.accounts).join(', ') || '(none)'}`); process.exit(1) }
    store.default = alias; saveCredStore(store); console.log(JSON.stringify({ ok: true, default: alias })); return
  }
  if (sub === 'remove' || sub === 'rm') {
    const alias = argv[1]
    if (!alias || !store.accounts[alias]) { console.error(`Unknown account '${alias}'. Available: ${Object.keys(store.accounts).join(', ') || '(none)'}`); process.exit(1) }
    delete store.accounts[alias]; if (store.default === alias) store.default = Object.keys(store.accounts)[0] ?? null
    saveCredStore(store); console.log(JSON.stringify({ ok: true, removed: alias, default: store.default })); return
  }
  console.error(`Unknown creds subcommand '${sub}'. Use: list | set | set-default | remove`); process.exit(1)
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

const [cmd, ...rawArgs] = process.argv.slice(2)

// Pull --account / -a out so per-command parsing doesn't see it.
const args = []
for (let i = 0; i < rawArgs.length; i++) {
  const a = rawArgs[i]
  if (a === '--account' || a === '-a') ACCOUNT = rawArgs[++i]
  else if (a.startsWith('--account=')) ACCOUNT = a.slice('--account='.length)
  else args.push(a)
}

if (cmd === 'creds') { manageCreds(args); process.exit(0) }

if (!cmd || cmd === '--help' || cmd === '-h') {
  console.log(`Usage: trello.mjs <command> [--account <alias>] [options]

Credentials are stored per-account in .trello-credentials.json and selected with --account <alias>.
You never pass secrets for normal use. Manage with the 'creds' command.
(Escape hatch: TRELLO_API_KEY + TRELLO_TOKEN env vars override the store if both set.)

Credential management:
  creds list                          List accounts (masked key/token fingerprints)
  creds set <alias> [--label L] [--api-key KEY] [--token T] [--default]   (or --stdin for JSON)
  creds set-default <alias>
  creds remove <alias>

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
