#!/usr/bin/env python3
"""
ZFTS Multi-Instance Collector
Monitors all ground ZFTS services, writes per-service JSON files
consumed by the web dashboard.

Requirements:
  dnf install python3-requests   (or: pip3 install requests)

Output files (served directly by nginx):
  /usr/share/nginx/html/transfers-105.json
  /usr/share/nginx/html/transfers-107.json
  /usr/share/nginx/html/transfers-dops-p2.json

To add a new instance: append one entry to INSTANCES below.
"""

import os
import re
import sys
import time
import json
import threading
import logging
from datetime import datetime, timezone

# Try to import requests; give a clear error if missing
try:
    import requests
except ImportError:
    sys.exit("ERROR: 'requests' not installed.  Run: dnf install python3-requests")

# ------------------------------------------------------------------ #
#  Configuration â€” edit here to add/remove instances                  #
# ------------------------------------------------------------------ #
OUTPUT_DIR = "/usr/share/nginx/html"

INSTANCES = [
    {
        "id":        "zfts105",
        "label":     "ZFTS-105",
        "log_file":  "/var/log/zfts-105.log",
        "stats_url": "http://127.0.0.1:19012/files",
        "output":    os.path.join(OUTPUT_DIR, "transfers-105.json"),
    },
    {
        "id":        "zfts107",
        "label":     "ZFTS-107",
        "log_file":  "/var/log/zfts-107.log",
        "stats_url": "http://127.0.0.1:19112/files",
        "output":    os.path.join(OUTPUT_DIR, "transfers-107.json"),
    },
    {
        "id":        "dopsp2",
        "label":     "DOPS-P2",
        "log_file":  "/var/log/zfts-dops-p2.log",
        "stats_url": "http://127.0.0.1:19212/files",
        "output":    os.path.join(OUTPUT_DIR, "transfers-dops-p2.json"),
    },
]

# How many completed entries to retain per service
MAX_COMPLETED   = 1000

# Seconds without byte progress before a transfer is marked stalled
STALL_THRESHOLD = 15

# Seconds between each poll cycle per instance
POLL_INTERVAL   = 1

# Log timestamp pattern:  Sun, 24 May 2026 15:13:26.505596 UTC
LOG_TIME_FMT    = "%a, %d %b %Y %H:%M:%S.%f UTC"

# Matches a completed-transfer log line
COMPLETE_RE = re.compile(
    r"^(.*?) ==.*?File (\S+) complete, (\d+) bytes transfered in ([\d.]+) seconds, at (\d+) kbps"
)

# ------------------------------------------------------------------ #
#  Logging setup                                                       #
# ------------------------------------------------------------------ #
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)


# ------------------------------------------------------------------ #
#  Per-instance collector class                                        #
# ------------------------------------------------------------------ #
class InstanceCollector:
    def __init__(self, config: dict):
        self.cfg       = config
        self.log       = logging.getLogger(config["label"])
        self.completed: list  = []          # newest-first, max MAX_COMPLETED
        self.file_pos: int    = 0           # byte offset in log file
        self.xfer_state: dict = {}          # stall detection per file_name

    # -------------------------------------------------------------- #
    #  Log parsing                                                     #
    # -------------------------------------------------------------- #
    def parse_log(self):
        log_path = self.cfg["log_file"]

        if not os.path.exists(log_path):
            return

        # Detect log rotation (copytruncate shrinks the file)
        try:
            file_size = os.path.getsize(log_path)
        except OSError:
            return
        if self.file_pos > file_size:
            self.log.info("Log rotation detected â€” resetting read position")
            self.file_pos = 0

        try:
            with open(log_path, "r", errors="replace") as fh:
                fh.seek(self.file_pos)
                for line in fh:
                    self._process_log_line(line.rstrip())
                self.file_pos = fh.tell()
        except OSError as exc:
            self.log.warning("Cannot read log: %s", exc)

    def _process_log_line(self, line: str):
        m = COMPLETE_RE.search(line)
        if not m:
            return

        ts_raw, path, size_s, dur_s, speed_s = m.groups()
        fname = path.split("/")[-1]

        # Parse timestamp
        try:
            dt = datetime.strptime(ts_raw.strip(), LOG_TIME_FMT)
            completed_at    = dt.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
            completed_epoch = int(dt.replace(tzinfo=timezone.utc).timestamp())
        except ValueError:
            completed_at    = None
            completed_epoch = int(time.time())

        entry = {
            "file":          fname,
            "size":          int(size_s),
            "duration":      float(dur_s),
            "speed_kbps":    int(speed_s),
            "status":        "complete",
            "completed_at":  completed_at,
            "completed_epoch": completed_epoch,
        }

        # Replace duplicate (same filename) then append, keep last MAX_COMPLETED
        self.completed = [c for c in self.completed if c["file"] != fname]
        self.completed.append(entry)
        self.completed = self.completed[-MAX_COMPLETED:]

    # -------------------------------------------------------------- #
    #  Active transfers + stall detection                              #
    # -------------------------------------------------------------- #
    def get_active(self) -> list:
        now = time.time()
        try:
            resp = requests.get(self.cfg["stats_url"], timeout=2)
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:
            self.log.debug("Stats fetch failed: %s", exc)
            return []

        active = []
        seen   = set()

        for item in data.get("status", []):
            if item.get("state") != "IN_PROGRESS":
                continue

            fname     = item["file_name"]
            bytes_now = item["bytes_received"]
            seen.add(fname)

            # Initialise stall-detection entry
            if fname not in self.xfer_state:
                self.xfer_state[fname] = {
                    "last_bytes":  bytes_now,
                    "last_update": now,
                }

            st = self.xfer_state[fname]

            if bytes_now > st["last_bytes"]:
                st["last_bytes"]  = bytes_now
                st["last_update"] = now
                status = "in_progress"
            else:
                status = "stalled" if (now - st["last_update"]) > STALL_THRESHOLD else "in_progress"

            active.append({
                "file":                      fname,
                "id":                        item["fileID"],
                "progress":                  round(item["percent_complete"], 2),
                "bytes_received":            bytes_now,
                "file_size":                 item["file_size"],
                "rate":                      item["rate"],
                "status":                    status,
                "last_progress_seconds_ago": round(now - st["last_update"], 1),
            })

        # Remove stall state for files no longer in the active list
        self.xfer_state = {k: v for k, v in self.xfer_state.items() if k in seen}

        return active

    # -------------------------------------------------------------- #
    #  JSON output                                                     #
    # -------------------------------------------------------------- #
    def write_output(self, active: list):
        payload = {
            "instance":     self.cfg["label"],
            "active":       active,
            "completed":    list(reversed(self.completed)),   # newest first
            "last_updated": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        tmp = self.cfg["output"] + ".tmp"
        try:
            with open(tmp, "w") as fh:
                json.dump(payload, fh, indent=2)
            os.replace(tmp, self.cfg["output"])    # atomic on Linux
        except OSError as exc:
            self.log.error("Cannot write output: %s", exc)

    # -------------------------------------------------------------- #
    #  Main loop                                                       #
    # -------------------------------------------------------------- #
    def run(self):
        self.log.info("Starting (log: %s | api: %s | out: %s)",
                      self.cfg["log_file"], self.cfg["stats_url"], self.cfg["output"])
        while True:
            try:
                self.parse_log()
                active = self.get_active()
                self.write_output(active)
            except Exception as exc:
                self.log.exception("Unexpected error in main loop: %s", exc)
            time.sleep(POLL_INTERVAL)


# ------------------------------------------------------------------ #
#  Entry point                                                         #
# ------------------------------------------------------------------ #
def main():
    threads = []
    for cfg in INSTANCES:
        collector = InstanceCollector(cfg)
        t = threading.Thread(
            target=collector.run,
            name=cfg["label"],
            daemon=True,
        )
        t.start()
        threads.append(t)

    # Keep main thread alive â€” if all daemon threads crash we exit cleanly
    try:
        while True:
            alive = [t for t in threads if t.is_alive()]
            if not alive:
                logging.error("All collector threads have stopped ” exiting")
                sys.exit(1)
            time.sleep(5)
    except KeyboardInterrupt:
        logging.info("Shutting down")


if __name__ == "__main__":
    main()

