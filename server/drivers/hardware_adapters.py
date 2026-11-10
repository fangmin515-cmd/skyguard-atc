# -*- coding: utf-8 -*-
"""
真实千元级被动硬件接入适配器（Step 2 硬件即插即用接口层）
支持：
1. RID 远程识别嗅探站（ESP32-S3 / OpenDroneID）通过 HTTP POST 或 UDP Port 9871 推送标准 JSON
2. ADS-B 接收机（RTL-SDR dump1090）自动轮询 aircraft.json 或 HTTP 推送
3. SDR 扫频脚本（hackrf_sweep / rtl_power）推送频谱数组与能量突发告警
4. RS485 五要素气象站网关推送实时气象数据
"""

import json
import socket
import threading
import time
import urllib.request
from typing import Dict, Any, List, Optional, Tuple
from ..core.models import AerialTarget, RfBandAlert, WeatherTelemetry


class RealHardwareRegistry:
    def __init__(self):
        self._lock = threading.Lock()
        self._targets: Dict[str, AerialTarget] = {}
        self._trails: Dict[str, List[Tuple[float, float]]] = {}
        self._rf_alerts: Dict[str, RfBandAlert] = {}
        self._spectrum: Optional[Dict[str, Any]] = None
        self._spectrum_ts: float = 0.0
        self._weather: Optional[WeatherTelemetry] = None
        self._weather_ts: float = 0.0
        self._udp_started = False

    def start_udp_listener(self, port: int = 9871) -> None:
        if self._udp_started:
            return
        self._udp_started = True
        t = threading.Thread(target=self._udp_loop, args=(port,), daemon=True)
        t.start()

    def _udp_loop(self, port: int) -> None:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(2.0)
        try:
            sock.bind(("127.0.0.1", port))
        except OSError:
            sock.close()
            return
        while True:
            try:
                data, _ = sock.recvfrom(8192)
                payload = json.loads(data.decode("utf-8"))
                self.ingest_rid_packet(payload)
            except socket.timeout:
                continue
            except OSError:
                time.sleep(1.0)
            except Exception:
                time.sleep(0.2)

    def ingest_rid_packet(self, payload: Dict[str, Any]) -> None:
        """
        接收来自 ESP32 OpenDroneID 接收器的报文，示例格式：
        {
          "serial_no": "1581F6N8...", "model": "DJI Air 3",
          "lat": 13.725, "lng": 100.512, "alt_m": 85.0,
          "speed_ms": 8.2, "heading_deg": 45.0,
          "pilot_lat": 13.720, "pilot_lng": 100.511, "rssi_dbm": -61.0
        }
        """
        now = time.time()
        sn = str(payload.get("serial_no") or payload.get("id") or "RID-UNKNOWN")
        tid = f"HW-RID-{sn}"
        lat = float(payload["lat"])
        lng = float(payload["lng"])

        with self._lock:
            pts = self._trails.setdefault(tid, [])
            pts.append((round(lat, 6), round(lng, 6)))
            if len(pts) > 40:
                pts.pop(0)

            self._targets[tid] = AerialTarget(
                target_id=tid,
                source="RID",
                category="UAV",
                model=str(payload.get("model", "Generic RID UAV")),
                serial_no=sn,
                lat=lat,
                lng=lng,
                alt_m=float(payload.get("alt_m", 0.0)),
                speed_ms=float(payload.get("speed_ms", 0.0)),
                heading_deg=float(payload.get("heading_deg", 0.0)),
                pilot_lat=float(payload["pilot_lat"]) if payload.get("pilot_lat") is not None else None,
                pilot_lng=float(payload["pilot_lng"]) if payload.get("pilot_lng") is not None else None,
                rssi_dbm=float(payload["rssi_dbm"]) if payload.get("rssi_dbm") is not None else None,
                freq_mhz=float(payload.get("freq_mhz", 2437.0)),
                last_seen_ts=now,
                is_simulated=False,
                trail=list(pts),
            )

    def poll_dump1090(self, url: str) -> None:
        """轮询本地 RTL-SDR dump1090 HTTP 接口（若硬件未接入则静默跳过）"""
        if not url:
            return
        try:
            with urllib.request.urlopen(url, timeout=0.6) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except Exception:
            return

        now = time.time()
        for ac in data.get("aircraft", []):
            if "lat" not in ac or "lon" not in ac:
                continue
            hex_id = str(ac.get("hex", "UNKNOWN")).upper()
            tid = f"HW-ADSB-{hex_id}"
            lat = float(ac["lat"])
            lng = float(ac["lon"])
            alt_ft = ac.get("alt_baro") or ac.get("alt_geom") or 0
            alt_m = float(alt_ft) * 0.3048 if isinstance(alt_ft, (int, float)) else 0.0
            gs_kt = float(ac.get("gs", 0.0))
            flight = str(ac.get("flight", "")).strip() or f"ICAO {hex_id}"

            with self._lock:
                pts = self._trails.setdefault(tid, [])
                pts.append((round(lat, 6), round(lng, 6)))
                if len(pts) > 40:
                    pts.pop(0)
                self._targets[tid] = AerialTarget(
                    target_id=tid,
                    source="ADS-B",
                    category="MANNED",
                    model=flight,
                    serial_no=f"ICAO-{hex_id}",
                    lat=lat,
                    lng=lng,
                    alt_m=round(alt_m, 1),
                    speed_ms=round(gs_kt * 0.51444, 1),
                    heading_deg=float(ac.get("track", 0.0)),
                    rssi_dbm=float(ac["rssi"]) if "rssi" in ac else None,
                    freq_mhz=1090.0,
                    last_seen_ts=now,
                    is_simulated=False,
                    trail=list(pts),
                )

    def ingest_weather(self, payload: Dict[str, Any], warn_ms: float = 8.0, crit_ms: float = 10.5) -> None:
        now = time.time()
        wind = float(payload.get("wind_speed_ms", 0.0))
        gust = float(payload.get("wind_gust_ms", wind))
        safety = "HOLD" if wind >= crit_ms or gust >= crit_ms + 1.5 else ("CAUTION" if wind >= warn_ms else "SAFE")
        with self._lock:
            self._weather = WeatherTelemetry(
                temp_c=float(payload.get("temp_c", 28.0)),
                humidity_pct=float(payload.get("humidity_pct", 60.0)),
                wind_speed_ms=wind,
                wind_gust_ms=gust,
                wind_dir_deg=float(payload.get("wind_dir_deg", 0.0)),
                pressure_hpa=float(payload.get("pressure_hpa", 1010.0)),
                flight_safety=safety,
                timestamp=now,
                is_simulated=False,
            )
            self._weather_ts = now

    def ingest_spectrum(self, payload: Dict[str, Any]) -> None:
        now = time.time()
        with self._lock:
            self._spectrum = {
                "band_24g": payload.get("band_24g", []),
                "band_58g": payload.get("band_58g", []),
                "noise_floor_24g_dbm": float(payload.get("noise_floor_24g_dbm", -92.0)),
                "noise_floor_58g_dbm": float(payload.get("noise_floor_58g_dbm", -94.0)),
                "channel_congestion_pct": int(payload.get("channel_congestion_pct", 20)),
            }
            self._spectrum_ts = now
            for alert in payload.get("rf_alerts", []):
                aid = str(alert.get("alert_id", "HW-RF-1"))
                self._rf_alerts[aid] = RfBandAlert(
                    alert_id=aid,
                    band=str(alert.get("band", "5.8GHz")),
                    center_freq_mhz=float(alert.get("center_freq_mhz", 5745.0)),
                    bandwidth_mhz=float(alert.get("bandwidth_mhz", 20.0)),
                    peak_dbm=float(alert.get("peak_dbm", -55.0)),
                    protocol_hint=str(alert.get("protocol_hint", "RF Burst Detected")),
                    est_distance_band=str(alert.get("est_distance_band", "< 800m")),
                    threat_level=str(alert.get("threat_level", "CAUTION")),
                    timestamp=now,
                    is_simulated=False,
                )

    def snapshot(self, config: Dict[str, Any]) -> Dict[str, Any]:
        now = time.time()
        drv = config.get("drivers", {})
        has_rid = drv.get("rid_receiver", {}).get("enabled", True)
        has_adsb = drv.get("adsb_receiver", {}).get("enabled", True)
        has_sdr = drv.get("sdr_spectrum", {}).get("enabled", True)
        has_weather = drv.get("weather_station", {}).get("enabled", True)

        with self._lock:
            # 清理超过 15 秒未更新的过期目标
            stale = [k for k, v in self._targets.items() if now - v.last_seen_ts > 15.0]
            for k in stale:
                del self._targets[k]

            stale_rf = [k for k, v in self._rf_alerts.items() if now - v.timestamp > 8.0]
            for k in stale_rf:
                del self._rf_alerts[k]

            active_targets = [
                t
                for t in self._targets.values()
                if (t.source == "RID" and has_rid) or (t.source == "ADS-B" and has_adsb)
            ]
            rf_alerts = list(self._rf_alerts.values()) if has_sdr else []
            spec = self._spectrum if (has_sdr and now - self._spectrum_ts <= 10.0) else None
            wx = self._weather if (has_weather and now - self._weather_ts <= 30.0) else None

        return {
            "targets": active_targets,
            "rf_alerts": rf_alerts,
            "spectrum": spec,
            "weather": wx,
        }
