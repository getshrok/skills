#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { basename, extname, join } from 'node:path'

const OPENAI_API = 'https://api.openai.com/v1'

const SKILL_DIR = import.meta.dirname
const CRED_STORE = process.env.OPENAI_CRED_STORE || join(SKILL_DIR, '.openai-credentials.json')

// Selected account alias (from --account / -a). The model passes only the alias.
let ACCOUNT = null

// ── Credentials store ─────────────────────────────────────────────────────────
// API keys live here, keyed by short account alias, so the agent references an
// account by name instead of pasting the key. See the committed
// .openai-credentials.json for the example shape:
//   { "accounts": { "<alias>": { label, api_key } }, "default": "<alias>|null" }
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
function storeKey() {
  const store = loadCredStore()
  const aliases = Object.keys(store.accounts)
  const acct = ACCOUNT || store.default || (aliases.length === 1 ? aliases[0] : null)
  return acct ? (store.accounts[acct]?.api_key ?? null) : null
}
function manageCreds(argv) {
  const sub = argv[0]
  const store = loadCredStore()
  if (sub === 'list' || !sub) {
    const accounts = Object.entries(store.accounts).map(([alias, e]) => ({ account: alias, default: store.default === alias, label: e.label ?? null, api_key: fingerprint(e.api_key) }))
    console.log(JSON.stringify({ accounts, default: store.default }, null, 2)); return
  }
  if (sub === 'set') {
    const alias = argv[1]
    if (!alias) { console.error('Usage: openai.mjs creds set <alias> [--label L] [--api-key KEY] [--default] [--stdin]'); process.exit(1) }
    const entry = store.accounts[alias] ?? {}
    let useStdin = false, makeDefault = false
    for (let i = 2; i < argv.length; i++) {
      if (argv[i] === '--label') entry.label = argv[++i]
      else if (argv[i] === '--api-key') entry.api_key = argv[++i]
      else if (argv[i] === '--stdin') useStdin = true
      else if (argv[i] === '--default') makeDefault = true
    }
    if (useStdin) { const blob = JSON.parse(readFileSync(0, 'utf8')); for (const k of ['label', 'api_key']) if (blob[k] != null) entry[k] = blob[k] }
    store.accounts[alias] = entry
    if (makeDefault || store.default == null) store.default = alias
    saveCredStore(store)
    console.log(JSON.stringify({ ok: true, account: alias, default: store.default, label: entry.label ?? null, api_key: fingerprint(entry.api_key) }, null, 2)); return
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

function getKey(opts) {
  // Normal path: stored key via --account. --key flag and OPENAI_API_KEY env are escape hatches.
  return opts.key || process.env['OPENAI_API_KEY'] || storeKey()
}

async function generate(key, prompt, opts) {
  const model = opts.model || 'gpt-image-1.5'
  const size = opts.size || '1024x1024'
  const quality = opts.quality || 'auto'

  const resp = await fetch(`${OPENAI_API}/images/generations`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, n: 1, size, quality }),
  })

  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`OpenAI API ${resp.status}: ${err}`)
  }

  const data = await resp.json()
  // Response may have url or b64_json depending on response_format
  const item = data.data[0]
  if (item.b64_json) return Buffer.from(item.b64_json, 'base64')
  if (item.url) {
    const imgResp = await fetch(item.url)
    if (!imgResp.ok) throw new Error(`Failed to download image: ${imgResp.status}`)
    return Buffer.from(await imgResp.arrayBuffer())
  }
  throw new Error('No image data in response')
}

async function edit(key, imagePath, prompt, opts) {
  const model = opts.model || 'gpt-image-1.5'
  const size = opts.size || 'auto'
  const quality = opts.quality || 'auto'

  if (!existsSync(imagePath)) throw new Error(`Image not found: ${imagePath}`)

  const imageData = readFileSync(imagePath)
  const ext = extname(imagePath).toLowerCase()
  const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/png'

  // Build multipart form manually using Blob/FormData (Node 18+)
  const form = new FormData()
  form.append('image', new Blob([imageData], { type: mimeType }), basename(imagePath))
  form.append('prompt', prompt)
  form.append('model', model)
  form.append('n', '1')
  form.append('size', size)
  form.append('quality', quality)

  const resp = await fetch(`${OPENAI_API}/images/edits`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}` },
    body: form,
  })

  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`OpenAI API ${resp.status}: ${err}`)
  }

  const data = await resp.json()
  const item = data.data[0]
  if (item.b64_json) return Buffer.from(item.b64_json, 'base64')
  if (item.url) {
    const imgResp = await fetch(item.url)
    if (!imgResp.ok) throw new Error(`Failed to download image: ${imgResp.status}`)
    return Buffer.from(await imgResp.arrayBuffer())
  }
  throw new Error('No image data in response')
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
  console.log(`Usage: openai.mjs <command> [--account <alias>] [options]

API key is stored per-account in .openai-credentials.json and selected with --account <alias>.
You never pass the key for normal use. Manage with the 'creds' command.
(Escape hatches: --key <KEY> flag, or OPENAI_API_KEY env var, both override the store.)

Credential management:
  creds list                              List accounts (masked key fingerprints)
  creds set <alias> [--label L] [--api-key KEY] [--default]   (or --stdin for JSON)
  creds set-default <alias>
  creds remove <alias>

Commands:
  create --prompt TEXT [--out PATH] [--model M] [--size S] [--quality Q]
  edit --image PATH --prompt TEXT [--out PATH] [--model M] [--size S] [--quality Q]

Models: gpt-image-1.5 (default), gpt-image-1-mini (fast), gpt-image-1 (legacy)
Sizes: 1024x1024 (default), 1536x1024, 1024x1536, auto
Quality: low, medium, high, auto (default)`)
  process.exit(0)
}

try {
  const { opts } = parseArgs(args)
  const key = getKey(opts)
  if (!key) { console.error('No API key. Pass --key or set OPENAI_API_KEY.'); process.exit(1) }

  let imageBuffer

  switch (cmd) {
    case 'create':
    case 'generate': {
      if (!opts.prompt) { console.error('--prompt required'); process.exit(1) }
      imageBuffer = await generate(key, opts.prompt, opts)
      break
    }
    case 'edit': {
      if (!opts.image || !opts.prompt) { console.error('--image and --prompt required'); process.exit(1) }
      imageBuffer = await edit(key, opts.image, opts.prompt, opts)
      break
    }
    default:
      console.error(`Unknown command: ${cmd}. Run openai.mjs --help`)
      process.exit(1)
  }

  const outPath = opts.out || `generated-${Date.now()}.png`
  writeFileSync(outPath, imageBuffer)

  // Verify the file was written
  if (!existsSync(outPath) || statSync(outPath).size === 0) {
    throw new Error(`Output file was not created or is empty: ${outPath}`)
  }

  console.log(JSON.stringify({
    ok: true,
    path: outPath,
    size: `${(statSync(outPath).size / 1024).toFixed(0)}KB`,
  }))
} catch (err) {
  console.error(JSON.stringify({ error: err.message }))
  process.exit(1)
}
