---
name: weather
description: Current weather and forecasts. Use when the user asks about weather, temperature, rain, or conditions for any location.
---

Two free APIs, no keys needed. Use **wttr.in** for quick answers and **Open-Meteo** for detailed/structured data.

## Quick answer — wttr.in

```bash
# One-line current conditions
curl -s "wttr.in/New+York?format=%l:+%c+%t+%w+%h"

# Current + 3-day forecast (concise)
curl -s "wttr.in/Tokyo?format=3"

# JSON for programmatic use
curl -s "wttr.in/London?format=j1"
```

Location formats: city name (`New+York`), airport code (`JFK`), GPS coords (`40.7,-74.0`), zip code (`10001`).

Units: append `?m` for metric, `?u` for Fahrenheit/mph. Default is based on location.

Format codes: `%c` condition emoji, `%t` temperature, `%f` feels-like, `%w` wind, `%h` humidity, `%p` precipitation, `%S` sunrise, `%s` sunset, `%m` moon phase.

## Detailed data — Open-Meteo

For hourly/daily forecasts, multi-day planning, or specific weather variables:

```bash
# Current conditions + 7-day daily forecast (NYC)
curl -s "https://api.open-meteo.com/v1/forecast?latitude=40.71&longitude=-74.01&current=temperature_2m,apparent_temperature,precipitation,wind_speed_10m,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,sunrise,sunset,uv_index_max&forecast_days=7&timezone=auto&temperature_unit=fahrenheit&wind_speed_unit=mph"

# Hourly forecast for next 48 hours
curl -s "https://api.open-meteo.com/v1/forecast?latitude=40.71&longitude=-74.01&hourly=temperature_2m,precipitation_probability,wind_speed_10m&forecast_hours=48&timezone=auto"
```

Open-Meteo requires coordinates. Get them from the user's location or use the geocoding API:
```bash
curl -s "https://geocoding-api.open-meteo.com/v1/search?name=Paris&count=1"
```

Available current fields: `temperature_2m`, `apparent_temperature`, `precipitation`, `rain`, `snowfall`, `wind_speed_10m`, `wind_direction_10m`, `relative_humidity_2m`, `cloud_cover`, `pressure_msl`, `weather_code`.

Available daily fields: `temperature_2m_max`, `temperature_2m_min`, `precipitation_sum`, `precipitation_probability_max`, `sunrise`, `sunset`, `uv_index_max`, `wind_speed_10m_max`.

Unit options: `temperature_unit=fahrenheit`, `wind_speed_unit=mph`, `precipitation_unit=inch`.

## How to respond

- Lead with the answer, not the data source. "It's 72F and sunny in Austin right now" not "According to the API response..."
- For forecasts, use a compact format — a short table or a few bullet points, not a wall of hourly numbers.
- If the user asks about weather for travel or an event, focus on what matters: will it rain, what should they wear, is it good weather for their plans.
- Use the user's preferred unit system if known. Default to what's standard for their location.

## Limitations

- No severe weather alerts — for US alerts, use `curl -s "https://api.weather.gov/alerts/active?area=NY"` (NWS, free, no key).
- No historical weather data beyond 92 days back (Open-Meteo `past_days` param).
- wttr.in forecasts max 3 days. Use Open-Meteo for longer forecasts (up to 16 days).
