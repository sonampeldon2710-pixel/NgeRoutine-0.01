"""
simulate_habits.py
==================
Generates 90 days of realistic habit log data for your Quick Tracker site (spttool.js).

Matches your EXACT log schema:
  { id, habitId, habitName, habitIcon, date, duration, unit, startTime, endTime, note }

Four user profiles:
  - overworked   : high work/screen, low sleep, low energy
  - balanced     : healthy across all habits
  - night_screen : late phone use, fragmented sleep
  - sleep_deprived: very low sleep, high stress

HOW TO USE
----------
Option A — localStorage injection (no backend needed):
  1. Run:  python simulate_habits.py
  2. Open output/  →  open localStorage_USERNAME.json
  3. In Chrome DevTools console, paste:
       localStorage.setItem("qt_data_USERNAME", JSON.stringify(<paste file contents>))
  4. Refresh your site → trends and history render instantly ✓

Option B — POST to your Railway API (live demo):
  1. Set TOKEN and USERNAME below
  2. Run:  python simulate_habits.py --post
  3. Logs are sent to  POST /api/logs  with your Bearer token
"""

import json
import random
import time
import argparse
from datetime import date, timedelta

# ── CONFIG ──────────────────────────────────────────────────────────────
API_BASE  = "https://ngeroutinetool-production.up.railway.app/api"
TOKEN     = "YOUR_JWT_TOKEN_HERE"   # paste your token from localStorage["qt_token"]
USERNAME  = "demo_user"             # username to simulate data for
START_DATE = date(2024, 1, 1)
DAYS      = 90
# ────────────────────────────────────────────────────────────────────────

HABITS = [
    {"id": "sleep",      "name": "Sleep",      "icon": "🌙", "unit": "hrs"},
    {"id": "work",       "name": "Work",       "icon": "💻", "unit": "hrs"},
    {"id": "exercise",   "name": "Exercise",   "icon": "🏃", "unit": "mins"},
    {"id": "screen",     "name": "Screen time","icon": "📱", "unit": "hrs"},
    {"id": "reading",    "name": "Reading",    "icon": "📚", "unit": "mins"},
    {"id": "meditation", "name": "Meditation", "icon": "🧘", "unit": "mins"},
]

# ── USER PROFILE DEFINITIONS ─────────────────────────────────────────────
PROFILES = {
    "overworked": {
        "sleep":      {"base": 4.8, "noise": 0.7, "weekend_bonus": 0.8},
        "work":       {"base": 11.5,"noise": 1.2, "weekend_bonus": -3.0},
        "exercise":   {"base": 10, "noise": 8,   "weekend_bonus": 15},
        "screen":     {"base": 9.2, "noise": 1.0, "weekend_bonus": 0.5},
        "reading":    {"base": 10, "noise": 8,   "weekend_bonus": 10},
        "meditation": {"base": 5,  "noise": 4,   "weekend_bonus": 5},
        "bedtime":    "00:30",
        "notes": {
            "sleep":   ["Fell asleep late again", "Too tired to wind down", "Slept through alarm"],
            "work":    ["Sprint deadline", "Late meetings", "Had to finish report"],
            "screen":  ["Doom scrolling before bed", "Netflix too late", "Can't stop checking Slack"],
        }
    },
    "balanced": {
        "sleep":      {"base": 7.6, "noise": 0.4, "weekend_bonus": 0.5},
        "work":       {"base": 8.0, "noise": 0.5, "weekend_bonus": -4.0},
        "exercise":   {"base": 40, "noise": 10,  "weekend_bonus": 20},
        "screen":     {"base": 2.8, "noise": 0.6, "weekend_bonus": 0.4},
        "reading":    {"base": 35, "noise": 10,  "weekend_bonus": 20},
        "meditation": {"base": 15, "noise": 5,   "weekend_bonus": 10},
        "bedtime":    "22:30",
        "notes": {
            "sleep":   ["Slept great!", "Morning sunlight helped", "Consistent bedtime"],
            "exercise":["Morning run", "Gym session", "Yoga + stretch"],
            "reading": ["Finished a chapter", "30 pages before bed"],
        }
    },
    "night_screen": {
        "sleep":      {"base": 6.1, "noise": 0.8, "weekend_bonus": 0.6},
        "work":       {"base": 7.5, "noise": 0.7, "weekend_bonus": -2.0},
        "exercise":   {"base": 20, "noise": 12,  "weekend_bonus": 10},
        "screen":     {"base": 7.4, "noise": 1.1, "weekend_bonus": 1.5},
        "reading":    {"base": 15, "noise": 8,   "weekend_bonus": 10},
        "meditation": {"base": 8,  "noise": 5,   "weekend_bonus": 5},
        "bedtime":    "01:15",
        "notes": {
            "sleep":   ["Phone kept me up", "Hard to fall asleep", "Woke up groggy"],
            "screen":  ["YouTube rabbit hole", "TikTok until 1am", "Series binge"],
        }
    },
    "sleep_deprived": {
        "sleep":      {"base": 4.2, "noise": 0.9, "weekend_bonus": 1.0},
        "work":       {"base": 9.2, "noise": 1.1, "weekend_bonus": -1.5},
        "exercise":   {"base": 8,  "noise": 7,   "weekend_bonus": 8},
        "screen":     {"base": 5.5, "noise": 1.0, "weekend_bonus": 0.5},
        "reading":    {"base": 8,  "noise": 6,   "weekend_bonus": 5},
        "meditation": {"base": 3,  "noise": 3,   "weekend_bonus": 3},
        "bedtime":    "02:00",
        "notes": {
            "sleep":   ["Couldn't sleep at all", "Woke up multiple times", "Only got a few hours"],
            "work":    ["Running on caffeine", "Third coffee today", "Exhausted but pushing through"],
        }
    },
}

# ── HELPERS ──────────────────────────────────────────────────────────────
def seeded_rng(seed):
    rng = random.Random(seed)
    return rng

def clamp(value, lo, hi):
    return max(lo, min(hi, value))

def fmt_time(hour, minute):
    """Return HH:MM string."""
    return f"{int(hour):02d}:{int(minute):02d}"

def gen_start_end(habit_id, duration, bedtime_str, rng):
    """Generate plausible start/end times for each habit."""
    bh, bm = [int(x) for x in bedtime_str.split(":")]

    defaults = {
        "sleep":      (bh, bm),
        "work":       (8, 30),
        "exercise":   (7, 0),
        "screen":     (20, 0),
        "reading":    (21, 0),
        "meditation": (7, 30),
    }
    sh, sm = defaults.get(habit_id, (9, 0))
    # add small jitter
    sh = int(clamp(sh + rng.randint(-1, 1), 0, 23))
    sm = int(clamp(sm + rng.randint(-10, 10), 0, 59))

    habit = next((h for h in HABITS if h["id"] == habit_id), None)
    if habit and habit["unit"] == "hrs":
        total_mins = int(duration * 60)
    else:
        total_mins = int(duration)

    end_total = sh * 60 + sm + total_mins
    eh = (end_total // 60) % 24
    em = end_total % 60

    return fmt_time(sh, sm), fmt_time(eh, em)

def pick_note(profile, habit_id, rng):
    notes = profile.get("notes", {}).get(habit_id, [])
    return rng.choice(notes) if notes and rng.random() < 0.4 else ""

def generate_logs(profile_name, seed=42):
    profile = PROFILES[profile_name]
    rng = seeded_rng(seed)
    logs = []
    entry_id = int(time.time() * 1000)

    for day_offset in range(DAYS):
        current_date = START_DATE + timedelta(days=day_offset)
        date_str = current_date.isoformat()
        is_weekend = current_date.weekday() >= 5  # Sat=5, Sun=6

        for habit in HABITS:
            hid = habit["id"]
            cfg = profile[hid]
            base = cfg["base"]
            noise = cfg["noise"]
            wb = cfg.get("weekend_bonus", 0)

            # Skip some days realistically
            skip_prob = 0.05 if hid in ("sleep",) else 0.15
            if hid in ("exercise", "meditation", "reading") and not is_weekend:
                skip_prob = 0.3
            if rng.random() < skip_prob:
                continue

            raw = base + (wb if is_weekend else 0) + (rng.random() - 0.5) * 2 * noise

            if habit["unit"] == "hrs":
                duration = round(clamp(raw, 0.5, 14), 1)
            else:
                duration = round(clamp(raw, 1, 300))

            start_t, end_t = gen_start_end(hid, duration, profile["bedtime"], rng)
            note = pick_note(profile, hid, rng)

            logs.append({
                "id":        entry_id,
                "habitId":   hid,
                "habitName": habit["name"],
                "habitIcon": habit["icon"],
                "date":      date_str,
                "duration":  duration,
                "unit":      habit["unit"],
                "startTime": start_t,
                "endTime":   end_t,
                "note":      note,
            })
            entry_id += 1

    return logs

def build_localStorage_object(logs):
    """Wrap logs in the exact shape getUserData() expects."""
    return {
        "logs": logs,
        "alarms": {},
        "habitEnabled": {
            "sleep": True, "work": True, "exercise": True,
            "screen": True, "reading": True, "meditation": True
        },
        "selectedSounds": {},
        "customSounds": {},
        "checkInHistory": [],
        "quickAlarms": []
    }

def post_to_api(logs, token, api_base):
    """POST each log to your Railway backend (Option B)."""
    import urllib.request
    import urllib.error

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
        "ngrok-skip-browser-warning": "true",
    }

    success, failed = 0, 0
    for i, entry in enumerate(logs):
        payload = json.dumps({
            "habit_id":   entry["habitId"],
            "habit_name": entry["habitName"],
            "habit_icon": entry["habitIcon"],
            "date":       entry["date"],
            "duration":   entry["duration"],
            "unit":       entry["unit"],
            "note":       entry["note"],
        }).encode("utf-8")

        req = urllib.request.Request(f"{api_base}/logs", data=payload, headers=headers, method="POST")
        try:
            urllib.request.urlopen(req, timeout=10)
            success += 1
        except urllib.error.HTTPError as e:
            print(f"  ✗ Entry {i+1} failed: HTTP {e.code}")
            failed += 1
        except Exception as e:
            print(f"  ✗ Entry {i+1} error: {e}")
            failed += 1

        # Small delay to avoid rate limiting
        if (i + 1) % 10 == 0:
            print(f"  → {i+1}/{len(logs)} sent ({success} ok, {failed} failed)")
            time.sleep(0.2)

    return success, failed


# ── MAIN ─────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--post", action="store_true", help="POST logs to Railway API (Option B)")
    parser.add_argument("--profile", default="all", help="Profile: overworked | balanced | night_screen | sleep_deprived | all")
    args = parser.parse_args()

    import os
    os.makedirs("output", exist_ok=True)

    profiles_to_run = list(PROFILES.keys()) if args.profile == "all" else [args.profile]

    for profile_name in profiles_to_run:
        print(f"\n{'='*50}")
        print(f"  Profile: {profile_name}")
        print(f"  Days: {DAYS}  |  Start: {START_DATE}")
        print(f"{'='*50}")

        logs = generate_logs(profile_name, seed=hash(profile_name) % 10000)
        print(f"  Generated {len(logs)} log entries")

        # ── Option A: localStorage JSON ──
        ls_obj = build_localStorage_object(logs)
        out_path = f"output/localStorage_{profile_name}.json"
        with open(out_path, "w") as f:
            json.dump(ls_obj, f, indent=2)
        print(f"  ✓ Saved: {out_path}")

        # Console command to inject it
        storage_key = f"qt_data_{USERNAME}"
        print(f"\n  To inject into your site, open DevTools console and run:")
        print(f"  localStorage.setItem('{storage_key}', JSON.stringify(/* paste {out_path} contents */));")
        print(f"  // then refresh the page")

        # ── Option B: POST to API ──
        if args.post:
            if TOKEN == "YOUR_JWT_TOKEN_HERE":
                print("\n  ⚠ Set TOKEN at the top of this file before using --post")
            else:
                print(f"\n  Posting {len(logs)} entries to {API_BASE}/logs ...")
                ok, fail = post_to_api(logs, TOKEN, API_BASE)
                print(f"  Done: {ok} succeeded, {fail} failed")

    print(f"\n✅ All done. Check the output/ folder.")

    # ── Summary stats ──
    print("\n── Sample averages (balanced profile) ──")
    balanced_logs = generate_logs("balanced", seed=1234)
    for habit in HABITS:
        habit_logs = [l["duration"] for l in balanced_logs if l["habitId"] == habit["id"]]
        if habit_logs:
            avg = sum(habit_logs) / len(habit_logs)
            print(f"  {habit['icon']} {habit['name']:12s}: avg {avg:.1f} {habit['unit']} over {len(habit_logs)} days")
