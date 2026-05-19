import json, random, os
from datetime import date, timedelta

random.seed(42)
os.makedirs("output", exist_ok=True)

START = date(2024, 1, 1)
END   = date(2026, 5, 19)

HABITS = {
    "sleep":      {"habitId":"sleep",      "habitName":"Sleep",      "habitIcon":"🌙","unit":"hours"},
    "work":       {"habitId":"work",        "habitName":"Work",        "habitIcon":"💻","unit":"hours"},
    "screen":     {"habitId":"screen",      "habitName":"Screen Time","habitIcon":"📱","unit":"hours"},
    "exercise":   {"habitId":"exercise",    "habitName":"Exercise",   "habitIcon":"🏃","unit":"mins"},
    "reading":    {"habitId":"reading",     "habitName":"Reading",    "habitIcon":"📚","unit":"mins"},
    "meditation": {"habitId":"meditation",  "habitName":"Meditation", "habitIcon":"🧘","unit":"mins"},
}

REAL_MAY_2026 = {
    "2026-05-01":{"sleep":7,  "screen":3,  "work":10},
    "2026-05-03":{"sleep":9,  "screen":3,  "work":3},
    "2026-05-04":{"sleep":8,  "screen":3,  "work":8},
    "2026-05-05":{"sleep":8,  "screen":3,  "work":5},
    "2026-05-06":{"sleep":5,  "screen":3,  "work":15},
    "2026-05-07":{"sleep":7,  "screen":3,  "work":11},
    "2026-05-08":{"sleep":8,  "screen":2,  "work":6},
    "2026-05-09":{"sleep":8,  "screen":1,  "work":5},
    "2026-05-10":{"sleep":8,  "screen":1,  "work":8},
    "2026-05-11":{"sleep":8,  "screen":0.3,"work":7},
    "2026-05-12":{"sleep":6,  "screen":0.3,"work":9},
    "2026-05-13":{"sleep":8,  "screen":0.3,"work":7},
    "2026-05-14":{"sleep":8,  "screen":0.3,"work":8},
    "2026-05-15":{"sleep":8,  "screen":0.3,"work":5},
}

# Each phase: (days, sleep_base, sleep_trend_per_day, screen_base, screen_trend, work_base, label)
# trend = how much the base shifts each day within the phase
# positive sleep trend = improving, negative screen trend = improving
PHASES = [
    # 2024 — bad habits, high screen, low sleep
    (45,  5.2, 0.000,  4.5, 0.000,  9.2, "bad baseline"),
    (21,  5.8, 0.020,  3.8,-0.030,  8.5, "first attempt"),
    (14,  4.9,-0.040,  4.8, 0.060,  9.8, "relapse"),
    (35,  5.1, 0.008,  4.3, 0.000,  9.0, "back to normal"),
    (30,  5.6, 0.015,  3.9,-0.015,  8.8, "slow climb"),
    (14,  6.1, 0.000,  3.4, 0.000,  8.2, "short plateau"),
    (21,  5.3,-0.030,  4.2, 0.050,  9.5, "stress drop"),
    (35,  5.5, 0.020,  3.7,-0.020,  8.6, "recovery"),
    (50,  6.2, 0.010,  3.2,-0.010,  8.0, "steady climb"),
    # 2025 — turning point
    (21,  6.8, 0.000,  2.8, 0.000,  7.8, "plateau"),
    (14,  6.0,-0.020,  3.4, 0.040,  8.4, "relapse 2"),
    (45,  6.3, 0.018,  2.9,-0.015,  7.6, "comeback"),
    (30,  7.2, 0.000,  2.2, 0.000,  7.2, "consistent good"),
    (21,  6.5,-0.015,  2.8, 0.020,  7.8, "minor dip"),
    (60,  6.8, 0.012,  2.4,-0.010,  7.3, "long climb"),
    (21,  7.6, 0.000,  1.7, 0.000,  7.0, "breakthrough"),
    (14,  6.8,-0.010,  2.3, 0.030,  7.6, "small dip"),
    # 2026 — mostly good with natural variation
    (30,  7.4, 0.008,  1.8,-0.008,  6.8, "consistent"),
    (21,  7.8, 0.000,  1.4, 0.000,  6.5, "peak streak"),
    (14,  7.0,-0.020,  2.0, 0.025,  7.2, "mini drop"),
    (60,  7.3, 0.005,  1.5,-0.003,  6.6, "stable good"),
    (60,  7.6, 0.003,  1.2,-0.002,  6.2, "best streak"),  # covers to May 19
]

def build_phase_map():
    """Map each date to its phase values."""
    phase_map = {}
    d = START
    for (days, sl_base, sl_trend, sc_base, sc_trend, work_base, label) in PHASES:
        for i in range(days):
            if d > END:
                break
            phase_map[d.isoformat()] = {
                "sleep":  sl_base  + sl_trend * i,
                "screen": sc_base  + sc_trend * i,
                "work":   work_base,
            }
            d += timedelta(days=1)
        if d > END:
            break
    # fill any remaining days with last phase values
    while d <= END:
        phase_map[d.isoformat()] = {"sleep":7.6,"screen":1.2,"work":6.2}
        d += timedelta(days=1)
    return phase_map

phase_map = build_phase_map()

log_id = 1
all_logs = []

d = START
while d <= END:
    ds = d.isoformat()
    is_weekend = d.weekday() >= 5

    if ds in REAL_MAY_2026:
        r = REAL_MAY_2026[ds]
        sleep, screen, work = r["sleep"], r["screen"], r["work"]
    else:
        p = phase_map[ds]
        noise_s = random.gauss(0, 0.45)
        noise_sc = random.gauss(0, 0.35)
        noise_w  = random.gauss(0, 1.1)
        sleep  = round(min(10, max(3.5, p["sleep"]  + noise_s  + (0.5 if is_weekend else 0))), 1)
        screen = round(min(8,  max(0.2, p["screen"] + noise_sc + (0.4 if is_weekend else 0))), 1)
        work   = round(min(14, max(1.0, p["work"]   + noise_w  - (4.5 if is_weekend else 0))), 1)

    # Optional habits — skip some days naturally
    exercise_mins = 0
    if random.random() > 0.40:
        exercise_mins = max(10, min(90, round(random.gauss(38, 12))))

    reading_mins = 0
    if random.random() > 0.42:
        reading_mins = max(10, min(90, round(random.gauss(32, 10))))

    meditation_mins = 0
    if random.random() > 0.52:
        meditation_mins = max(5, min(40, round(random.gauss(14, 5))))

    def make_log(habit_key, duration_val, time_str):
        global log_id
        h = HABITS[habit_key]
        entry = {
            "id": log_id, "habitId": h["habitId"], "habitName": h["habitName"],
            "habitIcon": h["habitIcon"], "date": ds,
            "duration": duration_val, "unit": h["unit"],
            "notes": "", "timestamp": f"{ds}T{time_str}:00.000Z"
        }
        log_id += 1
        return entry

    all_logs.append(make_log("sleep",  sleep,  "22:30"))
    all_logs.append(make_log("work",   work,   "18:00"))
    all_logs.append(make_log("screen", screen, "21:00"))
    if exercise_mins:   all_logs.append(make_log("exercise",   exercise_mins, "07:30"))
    if reading_mins:    all_logs.append(make_log("reading",    reading_mins,  "20:00"))
    if meditation_mins: all_logs.append(make_log("meditation", meditation_mins,"06:30"))

    d += timedelta(days=1)

output = {
    "logs": all_logs, "alarms": {},
    "habitEnabled": {"sleep":True,"work":True,"exercise":True,"screen":True,"reading":True,"meditation":True},
    "selectedSounds":{},"customSounds":{},"checkInHistory":[],"quickAlarms":[]
}

with open("output/localStorage_sompel2026_v3.json","w",encoding="utf-8") as f:
    json.dump(output, f, separators=(',',':'), ensure_ascii=False)

print(f"Total logs : {len(all_logs)}")
print(f"Date range : {START} to {END}")
print(f"File size  : {len(json.dumps(output))//1024} KB")
print("\nYearly averages:")
for year in [2024,2025,2026]:
    logs = [l for l in all_logs if l["date"].startswith(str(year))]
    sleep  = [l["duration"] for l in logs if l["habitId"]=="sleep"]
    screen = [l["duration"] for l in logs if l["habitId"]=="screen"]
    work   = [l["duration"] for l in logs if l["habitId"]=="work"]
    print(f"  {year}: sleep {sum(sleep)/len(sleep):.1f}h  screen {sum(screen)/len(screen):.1f}h  work {sum(work)/len(work):.1f}h  ({len(sleep)} days)")
print("\nSample entry:")
print(json.dumps(all_logs[0], indent=2, ensure_ascii=False))
