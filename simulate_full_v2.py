import json
import random
from datetime import date, timedelta

random.seed(99)

START = date(2024, 1, 1)
END   = date(2026, 5, 19)

HABITS = {
    "sleep":      {"habitId":"sleep",      "habitName":"Sleep",      "habitIcon":"🌙", "unit":"hours"},
    "work":       {"habitId":"work",        "habitName":"Work",        "habitIcon":"💻", "unit":"hours"},
    "screen":     {"habitId":"screen",      "habitName":"Screen Time", "habitIcon":"📱", "unit":"hours"},
    "exercise":   {"habitId":"exercise",    "habitName":"Exercise",    "habitIcon":"🏃", "unit":"mins"},
    "reading":    {"habitId":"reading",     "habitName":"Reading",     "habitIcon":"📚", "unit":"mins"},
    "meditation": {"habitId":"meditation",  "habitName":"Meditation",  "habitIcon":"🧘", "unit":"mins"},
}

REAL_MAY_2026 = {
    "2026-05-01": {"sleep":7,   "screen":3,   "work":10},
    "2026-05-03": {"sleep":9,   "screen":3,   "work":3},
    "2026-05-04": {"sleep":8,   "screen":3,   "work":8},
    "2026-05-05": {"sleep":8,   "screen":3,   "work":5},
    "2026-05-06": {"sleep":5,   "screen":3,   "work":15},
    "2026-05-07": {"sleep":7,   "screen":3,   "work":11},
    "2026-05-08": {"sleep":8,   "screen":2,   "work":6},
    "2026-05-09": {"sleep":8,   "screen":1,   "work":5},
    "2026-05-10": {"sleep":8,   "screen":1,   "work":8},
    "2026-05-11": {"sleep":8,   "screen":0.3, "work":7},
    "2026-05-12": {"sleep":6,   "screen":0.3, "work":9},
    "2026-05-13": {"sleep":8,   "screen":0.3, "work":7},
    "2026-05-14": {"sleep":8,   "screen":0.3, "work":8},
    "2026-05-15": {"sleep":8,   "screen":0.3, "work":5},
}

def get_values(d):
    is_weekend = d.weekday() >= 5
    month = d.month
    progress = (d - START).days / (END - START).days  # 0 → 1

    # Screen: 4.5h in 2024 → 0.5h by May 2026
    screen_base = 4.5 - progress * 4.0
    if is_weekend: screen_base += 0.4
    if month in [12,1,2]: screen_base += 0.3
    screen = round(max(0.2, screen_base + random.gauss(0, 0.35)), 1)

    # Sleep: 5.8h in 2024 → 7.8h by 2026
    sleep_base = 5.8 + progress * 2.0
    if is_weekend: sleep_base += 0.6
    sleep = round(min(10, max(3.5, sleep_base - screen*0.2 + random.gauss(0, 0.45))), 1)

    # Work: 9.5h in 2024 → 7h by 2026
    work_base = 9.5 - progress * 2.5
    if is_weekend: work_base = max(1, work_base - 5.5)
    work = round(max(1, work_base + random.gauss(0, 1.2)), 1)

    return sleep, screen, work

log_id = 1
all_logs = []

d = START
while d <= END:
    ds = d.isoformat()

    if ds in REAL_MAY_2026:
        r = REAL_MAY_2026[ds]
        sleep, screen, work = r["sleep"], r["screen"], r["work"]
    else:
        sleep, screen, work = get_values(d)

    is_weekend = d.weekday() >= 5

    # Exercise
    exercise_mins = 0
    if random.random() > (0.38 if is_weekend else 0.42):
        exercise_mins = max(10, min(90, round(random.gauss(38, 12))))

    # Reading
    reading_mins = 0
    if random.random() > 0.42:
        reading_mins = max(10, min(90, round(random.gauss(32, 10))))

    # Meditation
    meditation_mins = 0
    if random.random() > 0.52:
        meditation_mins = max(5, min(40, round(random.gauss(14, 5))))

    def make_log(habit_key, duration_val):
        global log_id
        h = HABITS[habit_key]
        entry = {
            "id":        log_id,
            "habitId":   h["habitId"],
            "habitName": h["habitName"],
            "habitIcon": h["habitIcon"],
            "date":      ds,
            "duration":  duration_val,
            "unit":      h["unit"],
            "notes":     "",
            "timestamp": f"{ds}T{'22:30' if habit_key=='sleep' else '18:00' if habit_key=='work' else '21:00' if habit_key=='screen' else '07:30' if habit_key=='exercise' else '20:00' if habit_key=='reading' else '06:30'}:00.000Z"
        }
        log_id += 1
        return entry

    all_logs.append(make_log("sleep",  sleep))
    all_logs.append(make_log("work",   work))
    all_logs.append(make_log("screen", screen))
    if exercise_mins:  all_logs.append(make_log("exercise",   exercise_mins))
    if reading_mins:   all_logs.append(make_log("reading",    reading_mins))
    if meditation_mins:all_logs.append(make_log("meditation", meditation_mins))

    d += timedelta(days=1)

output = {
    "logs": all_logs,
    "alarms": {},
    "habitEnabled": {
        "sleep":True,"work":True,"exercise":True,
        "screen":True,"reading":True,"meditation":True
    },
    "selectedSounds":{},"customSounds":{},
    "checkInHistory":[],"quickAlarms":[]
}

path = "output/localStorage_sompel2026_v2.json"
with open(path,"w") as f:
    json.dump(output, f, separators=(',',':'))

print(f"Total logs : {len(all_logs)}")
print(f"Date range : {START} to {END}")
print(f"File size  : {len(json.dumps(output))//1024} KB")
print("\nSample entry:")
print(json.dumps(all_logs[0], indent=2))
print("\nYearly averages:")
for year in [2024,2025,2026]:
    logs = [l for l in all_logs if l["date"].startswith(str(year))]
    sleep  = [l["duration"] for l in logs if l["habitId"]=="sleep"]
    screen = [l["duration"] for l in logs if l["habitId"]=="screen"]
    work   = [l["duration"] for l in logs if l["habitId"]=="work"]
    print(f"  {year}: sleep {sum(sleep)/len(sleep):.1f}h  screen {sum(screen)/len(screen):.1f}h  work {sum(work)/len(work):.1f}h")
