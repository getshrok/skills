#!/usr/bin/env node
// calendars.mjs — List Zoho calendars.
import { EXIT, getAccessToken, zohoGet } from './_shared.mjs'

const token = await getAccessToken()
const data = await zohoGet('/calendars', token)

const calendars = (data.calendars ?? []).map((c, i) => ({
  index: i,
  uid: c.uid,
  name: c.name ?? '',
  category: c.category ?? '',
  isDefault: !!c.isdefault,
}))

console.log(JSON.stringify(calendars, null, 2))
