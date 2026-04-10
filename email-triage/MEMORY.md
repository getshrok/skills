# Needs setup

This skill hasn't been configured yet. Before doing any triage, interview the user and then overwrite this entire file with their answers in the format shown at the bottom.

## Ask the user, in order

1. **Which email skill should I read from to retrieve new messages?**
2. **What counts as urgent for you?** Free-form natural language. Probe lightly if the answer is thin — account security alerts, deadlines in the next day, specific people, specific senders — but don't force a taxonomy. The router interprets this as natural language at classification time, so the user's own words are fine.
3. **Any routing rules to start with?** Destinations they already have in mind. If they don't have any yet, the default is `email-triage/digest` for everything.

## Then overwrite this file with

    EMAIL_SKILL=<their choice>
    lastChecked=<now>

    ## Handlers
    <their rules in natural language, one per line; or a single line: everything → email-triage/digest>

    ## Urgent
    <their criteria in natural language>

