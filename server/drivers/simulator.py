# -*- coding: utf-8 -*-
"""
可插拔沙盘仿真驱动（围绕曼谷 ICONSIAM 湄南河畔真实地理坐标构建）
交付正式环境时可在配置中一键关闭 (drivers.simulator.enabled = false)，实现零假数据残留。
"""

import math
import random
import time
from typing import Dict, Any, List, Optional, Tuple
from ..core.models import AerialTarget, RfBandAlert, WeatherTelemetry


class IconSiamSimulator:
    def __init__(self):
        self.start_ts = time.time()
        self._trails: Dict[str, List[Tuple[float, float]]] = {}

    def _append_trail(self, tid: str, lat: float, lng: float, max_pts: int = 36) -> List[Tuple[float, float]]:
        pts = self._trails.setdefault(tid, [])
        if not pts or abs(pts[-1][0] - lat) > 1e-5 or abs(pts[-1][1] - lng) > 1e-5:
            pts.append((round(lat, 6), round(lng, 6)))
            if len(pts) > max_pts:
                pts.pop(0)
        return list(pts)

    def reset_trails(self) -> None:
        self._trails.clear()
        self.start_ts = time.time()

    def step(self, config: Dict[str, Any]) -> Dict[str, Any]:
        drv = config.get("drivers", {})
        sim_cfg = drv.get("simulator", {})
        if not sim_cfg.get("enabled", False):
            return {
                "targets": [],
                "rf_alerts": [],
                "spectrum": None,
                "weather": None,
            }

        scenario = sim_cfg.get("scenario", "mixed_live")
        site = config.get("site", {})
        clat = float(site.get("center_lat", 13.7267))
        clng = float(site.get("center_lng", 100.5105))
        now = time.time()
        t = now - self.start_ts

        has_rid = drv.get("rid_receiver", {}).get("enabled", True)
        has_adsb = drv.get("adsb_receiver", {}).get("enabled", True)
        has_sdr = drv.get("sdr_spectrum", {}).get("enabled", True)
        has_weather = drv.get("weather_station", {}).get("enabled", True)

        targets: List[AerialTarget] = []
        rf_alerts: List[RfBandAlert] = []

        # 1. 自有集群编队主控信标（白名单，位于湄南河表演区）
        if has_rid and site.get("operating_mode") == "show_escort":
            show_lat = clat + 0.0002 + 0.00035 * math.sin(t * 0.08)
            show_lng = clng + 0.0021 + 0.00025 * math.cos(t * 0.08)
            hdg = (math.degrees(math.atan2(-0.00025 * math.sin(t * 0.08), 0.00035 * math.cos(t * 0.08))) + 360) % 360
            targets.append(
                AerialTarget(
                    target_id="UAV-SHOW-01",
                    source="RID",
                    category="UAV",
                    model="Formation Lead (500x Fleet)",
                    serial_no="ICONSIAM-SHOW-MASTER",
                    lat=round(show_lat, 6),
                    lng=round(show_lng, 6),
                    alt_m=round(115 + 12 * math.sin(t * 0.1), 1),
                    speed_ms=3.2,
                    heading_deg=round(hdg, 1),
                    pilot_lat=round(clat - 0.0003, 6),
                    pilot_lng=round(clng + 0.0008, 6),
                    rssi_dbm=-48.0,
                    freq_mhz=2442.0,
                    whitelist_status="WHITELIST",
                    last_seen_ts=now,
                    is_simulated=True,
                    trail=self._append_trail("UAV-SHOW-01", show_lat, show_lng),
                )
            )

        # 2. 黑飞入侵目标 #1：DJI Air 3（开启了标准 RID，从郑皇桥/Sathorn 码头方向沿湄南河北上逼近禁飞区）
        if has_rid and scenario in ("mixed_live", "nfz_intrusion"):
            # 周期性从外圈 950m 飞入内圈 260m 再盘旋
            phase = (t * 0.035) % (2 * math.pi)
            radius_deg = 0.0052 - 0.0031 * (0.5 + 0.5 * math.sin(phase))
            angle = -1.15 + 0.65 * math.cos(phase * 0.7)
            d_lat = clat + radius_deg * math.sin(angle)
            d_lng = clng + radius_deg * math.cos(angle)
            # 计算切向航向
            prev_phase = max(0.0, phase - 0.05)
            p_rad = 0.0052 - 0.0031 * (0.5 + 0.5 * math.sin(prev_phase))
            p_ang = -1.15 + 0.65 * math.cos(prev_phase * 0.7)
            p_lat = clat + p_rad * math.sin(p_ang)
            p_lng = clng + p_rad * math.cos(p_ang)
            hdg1 = (math.degrees(math.atan2(d_lng - p_lng, d_lat - p_lat)) + 360) % 360

            # 飞手站在 Sathorn 码头对岸步道附近
            pilot_lat = round(clat - 0.0068, 6)
            pilot_lng = round(clng + 0.0031, 6)

            targets.append(
                AerialTarget(
                    target_id="RID-AIR3-88",
                    source="RID",
                    category="UAV",
                    model="DJI Air 3",
                    serial_no="1581F6N8C236E003",
                    lat=round(d_lat, 6),
                    lng=round(d_lng, 6),
                    alt_m=round(88.0 + 14.0 * math.sin(t * 0.15), 1),
                    speed_ms=round(9.4 + 1.8 * math.cos(t * 0.2), 1),
                    heading_deg=round(hdg1, 1),
                    pilot_lat=pilot_lat,
                    pilot_lng=pilot_lng,
                    rssi_dbm=round(-56.0 - radius_deg * 2200, 1),
                    freq_mhz=5785.0,
                    last_seen_ts=now,
                    is_simulated=True,
                    trail=self._append_trail("RID-AIR3-88", d_lat, d_lng),
                )
            )

        # 3. 周边外圈游客无人机 #2：DJI Mini 4 Pro（在吞武里西侧外圈预警区边缘巡航）
        if has_rid and scenario == "mixed_live":
            m_ang = t * 0.045
            m_lat = clat + 0.0078 * math.cos(m_ang) + 0.0015
            m_lng = clng - 0.0082 + 0.0030 * math.sin(m_ang)
            hdg2 = (math.degrees(math.atan2(0.0030 * math.cos(m_ang), -0.0078 * math.sin(m_ang))) + 360) % 360
            targets.append(
                AerialTarget(
                    target_id="RID-MINI4-19",
                    source="RID",
                    category="UAV",
                    model="DJI Mini 4 Pro",
                    serial_no="1581F5YH9910A721",
                    lat=round(m_lat, 6),
                    lng=round(m_lng, 6),
                    alt_m=64.0,
                    speed_ms=6.1,
                    heading_deg=round(hdg2, 1),
                    pilot_lat=round(clat + 0.0042, 6),
                    pilot_lng=round(clng - 0.0096, 6),
                    rssi_dbm=-71.5,
                    freq_mhz=2462.0,
                    last_seen_ts=now,
                    is_simulated=True,
                    trail=self._append_trail("RID-MINI4-19", m_lat, m_lng),
                )
            )

        # 4. ADS-B 有人驾驶低空直升机（湄南河巡逻/观光直升机 HS-BKK，演示集群表演防撞预警）
        if has_adsb and scenario in ("mixed_live", "nfz_intrusion"):
            # 沿湄南河航道南北向低空通场
            sweep = ((t * 0.018) % 2.0) - 1.0  # -1.0 ~ +1.0
            h_lat = clat + sweep * 0.018
            h_lng = clng + 0.0032 + sweep * 0.0045
            targets.append(
                AerialTarget(
                    target_id="ADSB-HSBKK",
                    source="ADS-B",
                    category="MANNED",
                    model="EC135 Helicopter (HS-BKK)",
                    serial_no="ICAO-8851A2",
                    lat=round(h_lat, 6),
                    lng=round(h_lng, 6),
                    alt_m=310.0,
                    speed_ms=46.5,
                    heading_deg=14.0,
                    rssi_dbm=-63.0,
                    freq_mhz=1090.0,
                    last_seen_ts=now,
                    is_simulated=True,
                    trail=self._append_trail("ADSB-HSBKK", h_lat, h_lng),
                )
            )

        # 5. 千元级 SDR 射频频谱数据 + “未开 RID 的自组穿越机 FPV”能量告警模拟
        spectrum_data: Optional[Dict[str, Any]] = None
        if has_sdr:
            bins_24g = [-94.0 + random.uniform(-2.2, 2.2) for _ in range(64)]
            bins_58g = [-95.0 + random.uniform(-2.0, 2.0) for _ in range(64)]

            # 常规商场 Wi-Fi 底噪包络 (信道 1, 6, 11)
            for center_idx, amp in [(10, 14.0), (31, 18.0), (52, 15.0)]:
                for w in range(-5, 6):
                    idx = center_idx + w
                    if 0 <= idx < 64:
                        bins_24g[idx] += amp * math.exp(-(w * w) / 7.0)

            # Air 3 图传 5.8GHz 信号峰
            if scenario in ("mixed_live", "nfz_intrusion"):
                for w in range(-6, 7):
                    idx = 30 + w
                    if 0 <= idx < 64:
                        bins_58g[idx] += 31.0 * math.exp(-(w * w) / 9.0) + random.uniform(-1.5, 1.5)

            # 模拟“无 RID 广播的 5.8GHz FPV 穿越机”突发强能量信号！
            fpv_active = scenario == "dark_fpv_rf" or (scenario == "mixed_live" and int(t) % 40 >= 22)
            if fpv_active:
                peak_val = -51.5 + 3.0 * math.sin(t * 0.9) + random.uniform(-1.2, 1.2)
                for w in range(-4, 5):
                    idx = 12 + w  # ~5745 MHz Raceband
                    if 0 <= idx < 64:
                        bins_58g[idx] = max(bins_58g[idx], peak_val - abs(w) * 5.2)

                rf_alerts.append(
                    RfBandAlert(
                        alert_id="RF-FPV-5745",
                        band="5.8GHz",
                        center_freq_mhz=5745.0,
                        bandwidth_mhz=20.0,
                        peak_dbm=round(peak_val, 1),
                        protocol_hint="Unidentified 5.8G Video Carrier (No RID)",
                        est_distance_band="300m - 700m",
                        threat_level="CRITICAL" if peak_val > -52.0 else "CAUTION",
                        timestamp=now,
                        is_simulated=True,
                    )
                )

            spectrum_data = {
                "band_24g": [round(v, 1) for v in bins_24g],
                "band_58g": [round(v, 1) for v in bins_58g],
                "noise_floor_24g_dbm": -91.5,
                "noise_floor_58g_dbm": -93.8,
                "channel_congestion_pct": 34 if scenario != "dark_fpv_rf" else 68,
            }

        # 6. 五要素微型气象站数据（曼谷湄南河畔典型热带气候）
        weather_data: Optional[WeatherTelemetry] = None
        if has_weather:
            warn_w = float(drv.get("weather_station", {}).get("wind_warn_ms", 8.0))
            crit_w = float(drv.get("weather_station", {}).get("wind_crit_ms", 10.5))
            if scenario == "high_wind_hold":
                wind = round(9.6 + 1.4 * math.sin(t * 0.3), 1)
                gust = round(wind + 2.3, 1)
            else:
                wind = round(3.4 + 0.9 * math.sin(t * 0.12) + random.uniform(-0.2, 0.2), 1)
                gust = round(wind + 1.5, 1)

            if gust >= crit_w or wind >= warn_w:
                safety = "HOLD" if wind >= crit_w else "CAUTION"
            else:
                safety = "SAFE"

            weather_data = WeatherTelemetry(
                temp_c=round(31.2 + 0.2 * math.sin(t * 0.02), 1),
                humidity_pct=round(68.5 + 1.2 * math.cos(t * 0.03), 1),
                wind_speed_ms=max(0.0, wind),
                wind_gust_ms=max(0.0, gust),
                wind_dir_deg=round((195 + 8 * math.sin(t * 0.05)) % 360, 0),
                pressure_hpa=1007.8,
                flight_safety=safety,
                timestamp=now,
                is_simulated=True,
            )

        return {
            "targets": targets,
            "rf_alerts": rf_alerts,
            "spectrum": spectrum_data,
            "weather": weather_data,
        }
