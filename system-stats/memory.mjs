#!/usr/bin/env node
// memory.mjs — Cross-platform memory usage
// Usage: node memory.mjs

import { readFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'

if (existsSync('/proc/meminfo')) {
  const info = readFileSync('/proc/meminfo', 'utf8')
  const total = parseInt(info.match(/MemTotal:\s+(\d+)/)?.[1] || '0')
  const avail = parseInt(info.match(/MemAvailable:\s+(\d+)/)?.[1] || '0')
  const free = parseInt(info.match(/MemFree:\s+(\d+)/)?.[1] || '0')
  const effective = avail || free
  const usedPct = Math.round((total - effective) / total * 100)
  console.log(JSON.stringify({
    totalMB: Math.round(total / 1024),
    freeMB: Math.round(effective / 1024),
    usedPct,
  }))
} else {
  const pageSize = parseInt(execSync('sysctl -n hw.pagesize').toString().trim())
  const total = parseInt(execSync('sysctl -n hw.memsize').toString().trim())
  const freePages = parseInt(
    execSync("vm_stat | awk '/Pages free/ {gsub(/\\./,\"\",\\$3); print \\$3}'").toString().trim()
  )
  const free = freePages * pageSize
  const usedPct = Math.round((total - free) / total * 100)
  console.log(JSON.stringify({
    totalMB: Math.round(total / 1024 / 1024),
    freeMB: Math.round(free / 1024 / 1024),
    usedPct,
  }))
}