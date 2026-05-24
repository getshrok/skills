#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync, createReadStream } from 'node:fs'
import { join, basename } from 'node:path'
import { stat } from 'node:fs/promises'

const SKILL_DIR = import.meta.dirname
const CRED_STORE = process.env.X_CRED_STORE || join(SKILL_DIR, '.x-credentials.json')

// Selected account alias (from --account / -a). The model passes only the alias.
let ACCOUNT = null

// ── Credentials store ─────────────────────────────────────────────────────────
// { "accounts": { "<alias>": { label, api_key, api_secret, access_token, access_secret } }, "default": ... }
// See the committed .x-credentials.json for the example shape.
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

function getCreds() {
  // Env-var override: one-off escape hatch. Normal path is the store via --account.
  const e = process.env
  if (e.X_API_KEY && e.X_API_SECRET && e.X_ACCESS_TOKEN && e.X_ACCESS_SECRET) {
    return { api_key: e.X_API_KEY, api_secret: e.X_API_SECRET, access_token: e.X_ACCESS_TOKEN, access_secret: e.X_ACCESS_SECRET }
  }
  const store = loadCredStore()
  const aliases = Object.keys(store.accounts)
  const acct = ACCOUNT || store.default || (aliases.length === 1 ? aliases[0] : null)
  if (!acct) throw new Error(`No account selected. Pass --account <alias>. Available: ${aliases.join(', ') || '(none — add one with: x.mjs creds set <alias> ...)'}`)
  const entry = store.accounts[acct]
  if (!entry) throw new Error(`Unknown account '${acct}'. Available: ${aliases.join(', ') || '(none)'}`)
  const missing = ['api_key', 'api_secret', 'access_token', 'access_secret'].filter(k => !entry[k])
  if (missing.length) throw new Error(`Account '${acct}' is missing: ${missing.join(', ')}. Set with: x.mjs creds set ${acct} --api-key ... --api-secret ... --access-token ... --access-secret ...`)
  return entry
}

function getClient() {
  const c = getCreds()
  // Dynamic import since this is an npm-deps skill
  return import('twitter-api-v2').then(({ TwitterApi }) => {
    return new TwitterApi({
      appKey: c.api_key,
      appSecret: c.api_secret,
      accessToken: c.access_token,
      accessSecret: c.access_secret,
    })
  })
}

function manageCreds(argv) {
  const sub = argv[0]
  const store = loadCredStore()
  if (sub === 'list' || !sub) {
    const accounts = Object.entries(store.accounts).map(([alias, e]) => ({
      account: alias, default: store.default === alias, label: e.label ?? null,
      api_key: fingerprint(e.api_key), api_secret: fingerprint(e.api_secret), access_token: fingerprint(e.access_token), access_secret: fingerprint(e.access_secret),
    }))
    console.log(JSON.stringify({ accounts, default: store.default }, null, 2)); return
  }
  if (sub === 'set') {
    const alias = argv[1]
    if (!alias) { console.error('Usage: x.mjs creds set <alias> [--label L] [--api-key K] [--api-secret S] [--access-token T] [--access-secret S] [--default] [--stdin]'); process.exit(1) }
    const entry = store.accounts[alias] ?? {}
    let useStdin = false, makeDefault = false
    const flag = { '--label': 'label', '--api-key': 'api_key', '--api-secret': 'api_secret', '--access-token': 'access_token', '--access-secret': 'access_secret' }
    for (let i = 2; i < argv.length; i++) {
      if (flag[argv[i]]) entry[flag[argv[i]]] = argv[++i]
      else if (argv[i] === '--stdin') useStdin = true
      else if (argv[i] === '--default') makeDefault = true
    }
    if (useStdin) { const blob = JSON.parse(readFileSync(0, 'utf8')); for (const k of ['label', 'api_key', 'api_secret', 'access_token', 'access_secret']) if (blob[k] != null) entry[k] = blob[k] }
    store.accounts[alias] = entry
    if (makeDefault || store.default == null) store.default = alias
    saveCredStore(store)
    console.log(JSON.stringify({ ok: true, account: alias, default: store.default, label: entry.label ?? null,
      api_key: fingerprint(entry.api_key), api_secret: fingerprint(entry.api_secret), access_token: fingerprint(entry.access_token), access_secret: fingerprint(entry.access_secret) }, null, 2)); return
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
  console.log(`Usage: x.mjs <command> [--account <alias>] [options]

Credentials are stored per-account in .x-credentials.json and selected with --account <alias>.
You never pass secrets for normal use. Manage with the 'creds' command.
(Escape hatch: X_API_KEY + X_API_SECRET + X_ACCESS_TOKEN + X_ACCESS_SECRET env vars override the store.)

Credential management:
  creds list                               List accounts (masked fingerprints)
  creds set <alias> [--api-key K] [--api-secret S] [--access-token T] [--access-secret S] [--default]
  creds set-default <alias>
  creds remove <alias>

Commands:
  post --text TEXT [--media PATH] [--reply-to ID] [--quote ID]
  thread --texts "TEXT1" "TEXT2" "TEXT3"    Post a thread (each arg is one tweet)
  delete <tweetId>                         Delete a tweet
  get <tweetId>                            Get a tweet by ID (Basic+ tier)
  search --query Q [--max N]               Search recent tweets (Basic+ tier)
  timeline <userId> [--max N]              Get user's tweets (Basic+ tier)
  mentions [--max N]                       Get your mentions (Basic+ tier)
  like <tweetId>                           Like a tweet
  unlike <tweetId>                         Unlike a tweet
  retweet <tweetId>                        Retweet
  unretweet <tweetId>                      Undo retweet
  user <username>                          Get user info by username (Basic+ tier)
  me                                       Get authenticated user info`)
  process.exit(0)
}

try {
  const { opts, positional } = parseArgs(args)
  const client = await getClient()
  const v2 = client.v2

  switch (cmd) {
    case 'post': {
      if (!opts.text) { console.error('Usage: x.mjs post --text TEXT [--media PATH] [--reply-to ID] [--quote ID]'); process.exit(1) }
      const params = { text: opts.text }
      if (opts['reply-to']) params.reply = { in_reply_to_tweet_id: opts['reply-to'] }
      if (opts.quote) params.quote_tweet_id = opts.quote

      if (opts.media) {
        // Upload media first
        const mediaId = await client.v1.uploadMedia(opts.media)
        params.media = { media_ids: [mediaId] }
      }

      const result = await v2.tweet(params)
      console.log(JSON.stringify({
        id: result.data.id,
        text: result.data.text,
        url: `https://x.com/i/status/${result.data.id}`,
      }, null, 2))
      break
    }

    case 'thread': {
      // Collect all --texts or positional args as tweet texts
      let texts = positional
      if (opts.texts) texts = [opts.texts, ...positional]
      if (texts.length < 2) { console.error('Usage: x.mjs thread --texts "TEXT1" "TEXT2" "TEXT3" (or pass as positional args)'); process.exit(1) }

      const tweets = texts.map(text => ({ text }))
      const result = await v2.tweetThread(tweets)
      console.log(JSON.stringify(result.map(r => ({
        id: r.data.id,
        text: r.data.text,
        url: `https://x.com/i/status/${r.data.id}`,
      })), null, 2))
      break
    }

    case 'delete': {
      const id = positional[0]
      if (!id) { console.error('Usage: x.mjs delete <tweetId>'); process.exit(1) }
      await v2.deleteTweet(id)
      console.log(JSON.stringify({ ok: true, deleted: id }))
      break
    }

    case 'get': {
      const id = positional[0]
      if (!id) { console.error('Usage: x.mjs get <tweetId>'); process.exit(1) }
      const result = await v2.singleTweet(id, {
        'tweet.fields': 'created_at,public_metrics,author_id,conversation_id',
        expansions: 'author_id',
        'user.fields': 'username,name',
      })
      const author = result.includes?.users?.[0]
      console.log(JSON.stringify({
        id: result.data.id,
        text: result.data.text,
        createdAt: result.data.created_at,
        author: author ? `${author.name} (@${author.username})` : result.data.author_id,
        metrics: result.data.public_metrics,
        url: `https://x.com/i/status/${result.data.id}`,
      }, null, 2))
      break
    }

    case 'search': {
      if (!opts.query) { console.error('Usage: x.mjs search --query Q [--max N]'); process.exit(1) }
      const max = parseInt(opts.max) || 10
      const result = await v2.search(opts.query, {
        max_results: Math.min(max, 100),
        'tweet.fields': 'created_at,public_metrics,author_id',
        expansions: 'author_id',
        'user.fields': 'username,name',
      })
      const users = new Map((result.includes?.users ?? []).map(u => [u.id, u]))
      const tweets = (result.data?.data ?? []).map(t => {
        const author = users.get(t.author_id)
        return {
          id: t.id,
          text: t.text,
          createdAt: t.created_at,
          author: author ? `${author.name} (@${author.username})` : t.author_id,
          metrics: t.public_metrics,
        }
      })
      console.log(JSON.stringify({ tweets, resultCount: result.meta?.result_count }, null, 2))
      break
    }

    case 'timeline': {
      const userId = positional[0]
      if (!userId) { console.error('Usage: x.mjs timeline <userId> [--max N]'); process.exit(1) }
      const max = parseInt(opts.max) || 10
      const result = await v2.userTimeline(userId, {
        max_results: Math.min(max, 100),
        'tweet.fields': 'created_at,public_metrics',
      })
      const tweets = (result.data?.data ?? []).map(t => ({
        id: t.id, text: t.text, createdAt: t.created_at, metrics: t.public_metrics,
      }))
      console.log(JSON.stringify({ tweets }, null, 2))
      break
    }

    case 'mentions': {
      const me = await v2.me()
      const max = parseInt(opts.max) || 10
      const result = await v2.userMentionTimeline(me.data.id, {
        max_results: Math.min(max, 100),
        'tweet.fields': 'created_at,public_metrics,author_id',
        expansions: 'author_id',
        'user.fields': 'username,name',
      })
      const users = new Map((result.includes?.users ?? []).map(u => [u.id, u]))
      const tweets = (result.data?.data ?? []).map(t => {
        const author = users.get(t.author_id)
        return {
          id: t.id, text: t.text, createdAt: t.created_at,
          author: author ? `${author.name} (@${author.username})` : t.author_id,
        }
      })
      console.log(JSON.stringify({ tweets }, null, 2))
      break
    }

    case 'like': {
      const tweetId = positional[0]
      if (!tweetId) { console.error('Usage: x.mjs like <tweetId>'); process.exit(1) }
      const me = await v2.me()
      await v2.like(me.data.id, tweetId)
      console.log(JSON.stringify({ ok: true, liked: tweetId }))
      break
    }

    case 'unlike': {
      const tweetId = positional[0]
      if (!tweetId) { console.error('Usage: x.mjs unlike <tweetId>'); process.exit(1) }
      const me = await v2.me()
      await v2.unlike(me.data.id, tweetId)
      console.log(JSON.stringify({ ok: true, unliked: tweetId }))
      break
    }

    case 'retweet': {
      const tweetId = positional[0]
      if (!tweetId) { console.error('Usage: x.mjs retweet <tweetId>'); process.exit(1) }
      const me = await v2.me()
      await v2.retweet(me.data.id, tweetId)
      console.log(JSON.stringify({ ok: true, retweeted: tweetId }))
      break
    }

    case 'unretweet': {
      const tweetId = positional[0]
      if (!tweetId) { console.error('Usage: x.mjs unretweet <tweetId>'); process.exit(1) }
      const me = await v2.me()
      await v2.unretweet(me.data.id, tweetId)
      console.log(JSON.stringify({ ok: true, unretweeted: tweetId }))
      break
    }

    case 'user': {
      const username = positional[0]
      if (!username) { console.error('Usage: x.mjs user <username>'); process.exit(1) }
      const result = await v2.userByUsername(username, {
        'user.fields': 'created_at,description,public_metrics,profile_image_url,verified',
      })
      console.log(JSON.stringify({
        id: result.data.id,
        name: result.data.name,
        username: result.data.username,
        description: result.data.description,
        verified: result.data.verified,
        metrics: result.data.public_metrics,
        profileImage: result.data.profile_image_url,
        url: `https://x.com/${result.data.username}`,
      }, null, 2))
      break
    }

    case 'me': {
      const result = await v2.me({ 'user.fields': 'created_at,description,public_metrics,profile_image_url' })
      console.log(JSON.stringify({
        id: result.data.id,
        name: result.data.name,
        username: result.data.username,
        description: result.data.description,
        metrics: result.data.public_metrics,
        url: `https://x.com/${result.data.username}`,
      }, null, 2))
      break
    }

    default:
      console.error(`Unknown command: ${cmd}. Run x.mjs --help`)
      process.exit(1)
  }
} catch (err) {
  console.error(JSON.stringify({ error: err.message }))
  process.exit(1)
}
