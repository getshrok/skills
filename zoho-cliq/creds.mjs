#!/usr/bin/env node
// Credential management for the zoho-cliq skill.
// Usage: node creds.mjs list | set <alias> ... | set-default <alias> | remove <alias>
import { manageCreds } from './_shared.mjs'
manageCreds(process.argv.slice(2))
