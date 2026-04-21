#!/usr/bin/env node

import { readFileSync, existsSync, createReadStream } from 'node:fs'
import { join, basename } from 'node:path'
import { stat } from 'node:fs/promises'

const SKILL_DIR = import.meta.dirname
const MEMORY_FILE = join(SKILL_DIR, 'MEMORY.md')

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

function getClient() {
  const mem = loadMemory()
  if (!mem.X_API_KEY || !mem.X_API_SECRET || !mem.X_ACCESS_TOKEN || !mem.X_ACCESS_SECRET) {
    throw new Error('Missing X credentials in MEMORY.md. Need: X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET')
  }
  // Dynamic import since this is an npm-deps skill
  return import('twitter-api-v2').then(({ TwitterApi }) => {
    return new TwitterApi({
      appKey: mem.X_API_KEY,
      appSecret: mem.X_API_SECRET,
      accessToken: mem.X_ACCESS_TOKEN,
      accessSecret: mem.X_ACCESS_SECRET,
    })
  })
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
  console.log(`Usage: x.mjs <command> [options]

Reads credentials from MEMORY.md (X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET).

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
