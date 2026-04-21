---
name: weather
description: Current weather and forecasts. Use when the user asks about weather, temperature, rain, or conditions for any location.
---

Two free APIs, no keys needed. Use **wttr.in** for quick answers and **Open-Meteo** for detailed/structured forecasts.

## How to respond

- Lead with the answer, not the data source. "It's 72F and sunny in Austin right now" not "According to the API response..."
- For forecasts, use a compact format -- a short table or a few bullet points, not a wall of hourly numbers.
- If the user asks about weather for travel or an event, focus on what matters: will it rain, what should they wear, is it good weather for their plans.
- Use the user's preferred unit system if known. Default to what's standard for their location.

## Limitations

- No severe weather alerts -- for US alerts, use the NWS alerts API (`api.weather.gov`), free, no key.
- No historical weather data beyond 92 days back (Open-Meteo `past_days`).
- wttr.in forecasts max 3 days. Use Open-Meteo for longer forecasts (up to 16 days).
