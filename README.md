<h1><img src="logo.svg" width="32" height="32" /> Skills for Shrok</h1>

Ask your Shrok to install a skill by name (mention this repo explicitly for best results), or place one of the skill folders above into ~/.shrok/workspace/skills

## Available skills

| Skill | Description |
|-------|-------------|
| calendar | CalDAV (read, create, update, delete events) |
| create-image | OpenAI GPT Image / Google Gemini (generate, edit) |
| email | IMAP/SMTP (read, search, send) |
| email-triage | IMAP inbox monitor (scheduled — routes new email to handlers) |
| gmail | Gmail API via OAuth2 (read, search, send, organize) |
| google-workspace | Google Drive, Docs, Sheets (list, read, create, edit, share) |
| morning-briefing | Daily briefing (scheduled — calendar, priorities, context) |
| news-monitor | Google News (scheduled — monitors topics, alerts on matches) |
| notion | Notion API (read, create, update, query pages and databases) |
| obsidian | Obsidian vault (read, search, create, organize notes) |
| pdf | PDF files (create, read, edit, merge, split, fill forms) |
| screen-peek | Host display (capture screenshot for visual context) |
| spreadsheet | .xlsx / .csv (create, read, edit, analyze) |
| trello | Trello API (boards, lists, cards, labels, checklists) |
| weather | OpenWeather (current conditions, forecasts, any location) |
| word-docx | .docx files (create, read, edit) |
| x | X / Twitter API (post tweets, threads, replies; read timelines on Basic+) |
| zoho-calendar | Zoho Calendar REST API (read, create, update, delete events) |
| zoho-mail | Zoho Mail REST API (read, search, send) |

## Contributing

Each skill is a directory with a `SKILL.md` and optional scripts. See the [skills skill](https://github.com/getshrok/shrok/blob/main/skills/skills/SKILL.md) for best practices. If you have a skill to contribute, feel free to open a PR.
