#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SkyGuard ATC 低空安全态势感知与预警系统 — 本地网关与 Web 大屏服务
零第三方依赖，原生支持 macOS / Windows / Linux Python 3.8+ 即开即用，同时兼容 Electron 桌面壳调用。
"""

import os
import sys
import json
import time
import threading
from http import HTTPStatus
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from server.core.storage import EventBlackboxStorage
from server.core.notifier import format_dispatch_message, send_external_notification
from server.drivers.manager import TelemetryManager

CONFIG_PATH = os.path.join(BASE_DIR, "config", "system_config.json")
DB_PATH = os.path.join(BASE_DIR, "data", "skyguard_events.db")
WEB_DIR = os.path.join(BASE_DIR, "web")


class AppContext:
    def __init__(self):
        self.lock = threading.Lock()
        self.config = self._load_config()
        self.storage = EventBlackboxStorage(DB_PATH)
        self.manager = TelemetryManager(self.storage)
        self.latest_frame = self.manager.tick(self.config)

        # 启动真实 RID UDP 监听端口
        rid_port = int(self.config.get("drivers", {}).get("rid_receiver", {}).get("udp_port", 9871))
        self.manager.hardware.start_udp_listener(rid_port)

        # 后台 1Hz 态势解算线程
        t = threading.Thread(target=self._loop, daemon=True)
        t.start()

    def _load_config(self) -> dict:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            return json.load(f)

    def save_config(self, new_cfg: dict) -> dict:
        with self.lock:
            old_site = self.config.get("site", {})
            new_site = new_cfg.get("site", {})
            if (
                old_site.get("center_lat") != new_site.get("center_lat")
                or old_site.get("center_lng") != new_site.get("center_lng")
            ):
                self.manager.simulator.reset_trails()
            self.config = new_cfg
            with open(CONFIG_PATH, "w", encoding="utf-8") as f:
                json.dump(self.config, f, ensure_ascii=False, indent=2)
            self.latest_frame = self.manager.tick(self.config)
            return self.config

    def _loop(self) -> None:
        while True:
            try:
                with self.lock:
                    cfg_copy = json.loads(json.dumps(self.config))
                frame = self.manager.tick(cfg_copy)
                with self.lock:
                    self.latest_frame = frame
            except Exception as exc:
                print(f"[TelemetryLoop Error] {exc}", file=sys.stderr)
            time.sleep(1.0)


CTX = AppContext()


class SkyGuardHTTPHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def log_message(self, format, *args):
        # 保持安静，避免高频轮询刷屏日志
        pass

    def _send_json(self, data: dict, status: int = 200) -> None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8"))

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/state":
            with CTX.lock:
                frame = CTX.latest_frame
            return self._send_json(frame)

        if path == "/api/stream":
            # Server-Sent Events (SSE) 毫秒级实时态势流推送
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            try:
                while True:
                    with CTX.lock:
                        payload = json.dumps(CTX.latest_frame, ensure_ascii=False)
                    self.wfile.write(f"data: {payload}\n\n".encode("utf-8"))
                    self.wfile.flush()
                    time.sleep(1.0)
            except (BrokenPipeError, ConnectionResetError):
                return

        if path == "/api/config":
            with CTX.lock:
                cfg = CTX.config
            return self._send_json(cfg)

        if path == "/api/events":
            qs = parse_qs(parsed.query)
            limit = int(qs.get("limit", ["50"])[0])
            events = CTX.storage.list_recent_events(limit=limit)
            return self._send_json({"events": events})

        if path == "/api/events/export.csv":
            csv_text = CTX.storage.export_csv()
            body = csv_text.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/csv; charset=utf-8")
            self.send_header(
                "Content-Disposition", 'attachment; filename="skyguard_security_report.csv"'
            )
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        try:
            body = self._read_json_body()
        except Exception as exc:
            return self._send_json({"error": f"Invalid JSON: {exc}"}, status=400)

        if path == "/api/config":
            with CTX.lock:
                merged = json.loads(json.dumps(CTX.config))
            # 支持部分或完整更新
            for key, val in body.items():
                if isinstance(val, dict) and isinstance(merged.get(key), dict):
                    for k2, v2 in val.items():
                        if isinstance(v2, dict) and isinstance(merged[key].get(k2), dict):
                            merged[key][k2].update(v2)
                        else:
                            merged[key][k2] = v2
                else:
                    merged[key] = val
            saved = CTX.save_config(merged)
            return self._send_json({"ok": True, "config": saved})

        if path == "/api/list/toggle":
            # 快速切换目标白名单 / 黑名单状态
            sn = str(body.get("serial_no", "")).strip()
            list_type = body.get("list_type", "whitelist")  # "whitelist" | "blacklist" | "clear"
            if not sn:
                return self._send_json({"error": "Missing serial_no"}, status=400)
            with CTX.lock:
                cfg = json.loads(json.dumps(CTX.config))
            wl = [x for x in cfg.get("whitelist_sns", []) if x != sn]
            bl = [x for x in cfg.get("blacklist_sns", []) if x != sn]
            if list_type == "whitelist":
                wl.append(sn)
            elif list_type == "blacklist":
                bl.append(sn)
            cfg["whitelist_sns"] = wl
            cfg["blacklist_sns"] = bl
            saved = CTX.save_config(cfg)
            return self._send_json({"ok": True, "config": saved})

        if path == "/api/notify/dispatch":
            # 生成并推送安保执勤告警单（带飞手 Google Maps 导航链接）
            lang = body.get("lang", "zh")
            with CTX.lock:
                cfg = json.loads(json.dumps(CTX.config))
            msg = format_dispatch_message(
                lang=lang,
                site_name=cfg.get("site", {}).get("name", "ICONSIAM"),
                severity=body.get("severity", "CRITICAL"),
                model=body.get("model", "Unknown UAV"),
                serial_no=body.get("serial_no", "N/A"),
                distance_m=float(body.get("distance_m", 0)),
                alt_m=float(body.get("alt_m", 0)),
                drone_lat=float(body.get("lat", 13.7267)),
                drone_lng=float(body.get("lng", 100.5105)),
                pilot_lat=body.get("pilot_lat"),
                pilot_lng=body.get("pilot_lng"),
            )
            res = send_external_notification(msg, cfg.get("notifications", {}))
            return self._send_json({"ok": True, **res})

        if path == "/api/events/clear":
            CTX.storage.clear_events()
            return self._send_json({"ok": True})

        # 真实硬件数据注入接口（Step 2 硬件即插即用）
        if path == "/api/ingest/rid":
            CTX.manager.hardware.ingest_rid_packet(body)
            return self._send_json({"ok": True})

        if path == "/api/ingest/weather":
            w_cfg = CTX.config.get("drivers", {}).get("weather_station", {})
            CTX.manager.hardware.ingest_weather(
                body,
                warn_ms=float(w_cfg.get("wind_warn_ms", 8.0)),
                crit_ms=float(w_cfg.get("wind_crit_ms", 10.5)),
            )
            return self._send_json({"ok": True})

        if path == "/api/ingest/spectrum":
            CTX.manager.hardware.ingest_spectrum(body)
            return self._send_json({"ok": True})

        return self._send_json({"error": "Not found"}, status=404)


def main():
    port = int(os.environ.get("SKYGUARD_PORT", "8765"))
    host = os.environ.get("SKYGUARD_HOST", "127.0.0.1")
    server = ThreadingHTTPServer((host, port), SkyGuardHTTPHandler)
    print(f"============================================================")
    print(f"  SkyGuard ATC - Low-Altitude Situational Awareness System")
    print(f"  Site Center : ICONSIAM, Bangkok (13.7267°N, 100.5105°E)")
    print(f"  Web Console : http://{host}:{port}")
    print(f"  RID UDP Port: 9871 (WGS-84 OpenDroneID JSON)")
    print(f"============================================================")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down SkyGuard ATC server...")
        server.server_close()


if __name__ == "__main__":
    main()
