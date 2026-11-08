# -*- coding: utf-8 -*-
"""
SQLite 事件黑匣子存储与商业安防巡检 CSV 报表导出
"""

import os
import csv
import io
import sqlite3
import threading
import time
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any

ICT_TZ = timezone(timedelta(hours=7))  # 泰国标准时间 UTC+7


class EventBlackboxStorage:
    def __init__(self, db_path: str):
        self.db_path = db_path
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        self._lock = threading.Lock()
        self._recent_alert_keys: Dict[str, float] = {}
        self._init_db()

    def _init_db(self) -> None:
        with self._lock, sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS security_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ts REAL NOT NULL,
                    time_ict TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    severity TEXT NOT NULL,
                    source TEXT NOT NULL,
                    target_id TEXT,
                    model TEXT,
                    serial_no TEXT,
                    lat REAL,
                    lng REAL,
                    alt_m REAL,
                    distance_m REAL,
                    pilot_lat REAL,
                    pilot_lng REAL,
                    summary TEXT NOT NULL
                )
                """
            )
            conn.commit()

    def record_event(
        self,
        dedup_key: str,
        cooldown_sec: float,
        event_type: str,
        severity: str,
        source: str,
        summary: str,
        target_id: str = "",
        model: str = "",
        serial_no: str = "",
        lat: float = 0.0,
        lng: float = 0.0,
        alt_m: float = 0.0,
        distance_m: float = 0.0,
        pilot_lat: float = 0.0,
        pilot_lng: float = 0.0,
    ) -> bool:
        """带冷却防刷屏的告警事件入库"""
        now = time.time()
        with self._lock:
            last_ts = self._recent_alert_keys.get(dedup_key, 0.0)
            if now - last_ts < cooldown_sec:
                return False
            self._recent_alert_keys[dedup_key] = now

            time_str = datetime.fromtimestamp(now, tz=ICT_TZ).strftime("%Y-%m-%d %H:%M:%S")
            with sqlite3.connect(self.db_path) as conn:
                conn.execute(
                    """
                    INSERT INTO security_events (
                        ts, time_ict, event_type, severity, source,
                        target_id, model, serial_no, lat, lng, alt_m,
                        distance_m, pilot_lat, pilot_lng, summary
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        now,
                        time_str,
                        event_type,
                        severity,
                        source,
                        target_id,
                        model,
                        serial_no,
                        lat,
                        lng,
                        alt_m,
                        distance_m,
                        pilot_lat,
                        pilot_lng,
                        summary,
                    ),
                )
                conn.commit()
        return True

    def list_recent_events(self, limit: int = 50) -> List[Dict[str, Any]]:
        with self._lock, sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT * FROM security_events ORDER BY id DESC LIMIT ?", (limit,)
            ).fetchall()
            return [dict(r) for r in rows]

    def clear_events(self) -> None:
        with self._lock, sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM security_events")
            conn.commit()
            self._recent_alert_keys.clear()

    def export_csv(self) -> str:
        events = self.list_recent_events(limit=1000)
        buf = io.StringIO()
        buf.write("\ufeff")  # UTF-8 BOM 兼容 Excel 打开泰文/中文
        writer = csv.writer(buf)
        writer.writerow(
            [
                "ID",
                "Bangkok Time (UTC+7)",
                "Severity",
                "Event Type",
                "Source",
                "Model",
                "Serial Number",
                "Drone Lat",
                "Drone Lng",
                "Altitude (m)",
                "Distance (m)",
                "Pilot Lat",
                "Pilot Lng",
                "Pilot Google Maps Link",
                "Summary",
            ]
        )
        for ev in events:
            p_lat = ev.get("pilot_lat") or 0.0
            p_lng = ev.get("pilot_lng") or 0.0
            gmap = (
                f"https://www.google.com/maps?q={p_lat:.6f},{p_lng:.6f}"
                if p_lat and p_lng
                else ""
            )
            writer.writerow(
                [
                    ev["id"],
                    ev["time_ict"],
                    ev["severity"],
                    ev["event_type"],
                    ev["source"],
                    ev["model"],
                    ev["serial_no"],
                    ev["lat"],
                    ev["lng"],
                    ev["alt_m"],
                    ev["distance_m"],
                    p_lat or "",
                    p_lng or "",
                    gmap,
                    ev["summary"],
                ]
            )
        return buf.getvalue()
