#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { basename, extname } from 'node:path'

const OPENAI_API = 'https://api.openai.com/v1'

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
  return opts.key || process.env['OPENAI_API_KEY']
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

const [cmd, ...args] = process.argv.slice(2)

if (!cmd || cmd === '--help' || cmd === '-h') {
  console.log(`Usage: openai.mjs <command> [options]

Pass API key via --key or OPENAI_API_KEY env var.

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
