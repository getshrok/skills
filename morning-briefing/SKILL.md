---
name: morning-briefing
description: Personalized daily briefing — what's ahead, what needs attention, what's relevant right now. Runs on demand or as a scheduled skill.
---

Deliver a concise, personalized briefing based on what you know about the user's life, work, and current situation. This isn't a template to fill — it's a synthesis. Every briefing should feel like it was written by someone who knows the user well.

## What to draw from

Pull from everything available to you:

- **Identity files** — USER.md for preferences, habits, people in their life; SOUL.md for your personality
- **Memory** — recent conversations, ongoing projects, things the user cares about, commitments they've made
- **Notes** — anything the user has asked you to remember
- **Schedules and reminders** — what's set up, what's due
- **Any installed skills or integrations** — if you can check weather, email, calendar, repos, etc., do it. But don't fail or apologize if those aren't available.

## How to build the briefing

**Start with what matters most today.** Not a fixed section order — lead with whatever is most important or time-sensitive for this specific user on this specific day. An overdue deadline beats a weather update. A flight tomorrow beats a routine meeting.

**Include only sections that have substance.** Never pad with empty sections or filler. If there's nothing notable about weather, skip it. If there are no overdue items, don't mention it. A 4-line briefing on a quiet day is better than a 20-line one stuffed with fluff.

**Sections to consider** (use what's relevant, skip what isn't):

- What's time-sensitive — deadlines, events, appointments, expiring items
- What needs attention — overdue items, things waiting on the user, unresolved threads
- What's coming up — preview of the day or week ahead
- What's new — anything that changed since last briefing or last conversation
- Context the user might need — reminders about commitments, people they're meeting, prep they should do
- Proactive suggestions — things you could handle for them, things worth checking on

**End with focus.** One sentence: the single most important thing for today. Not a motivational quote — an actual priority.

## Tone

Match the user's personality and your own (from SOUL.md). Be direct and useful, not corporate. "You've got that dentist appointment at 2" not "Reminder: You have a scheduled dental appointment at 14:00." Be warm but don't waste their time.

## Scheduling

When set up as a scheduled skill, run in the morning on weekdays. Weekend briefings should be lighter — only surface things that actually matter over the weekend. If nothing does, say so in one line and move on.

## Responding to partial requests

If the user asks for just part of the briefing ("what's overdue?", "what do I have today?", "anything I should know?"), answer just that — don't deliver the full briefing.
