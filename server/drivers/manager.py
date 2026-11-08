# -*- coding: utf-8 -*-
"""
多源传感器驱动协调器与能力清单输出（Capability-Driven UI 核心）
"""

import time
from typing import Dict, Any, List
from ..core.geofence import evaluate_target_threat
from ..core.storage import EventBlackboxStorage
from .simulator import IconSiamSimulator
from .hardware_adapters import RealHardwareRegistry


class TelemetryManager:
    def __init__(self, storage: EventBlackboxStorage):
        self.storage = storage
        self.simulator = IconSiamSimulator()
        self.hardware = RealHardwareRegistry()
        self._last_dump1090_poll = 0.0

    def compute_capabilities(self, config: Dict[str, Any]) -> Dict[str, Any]:
        drv = config.get("drivers", {})
        return {
            "simulator_enabled": bool(drv.get("simulator", {}).get("enabled", False)),
            "scenario": drv.get("simulator", {}).get("scenario", "mixed_live"),
            "has_rid": bool(drv.get("rid_receiver", {}).get("enabled", True)),
            "has_adsb": bool(drv.get("adsb_receiver", {}).get("enabled", True)),
            "has_spectrum": bool(drv.get("sdr_spectrum", {}).get("enabled", True)),
            "has_weather": bool(drv.get("weather_station", {}).get("enabled", True)),
        }

    def tick(self, config: Dict[str, Any]) -> Dict[str, Any]:
        now = time.time()
        drv = config.get("drivers", {})

        # 若启用了真实 ADS-B 且未开启仿真（或混合接入），按 2 秒周期轮询本地 dump1090
        if drv.get("adsb_receiver", {}).get("enabled") and now - self._last_dump1090_poll > 2.0:
            self._last_dump1090_poll = now
            # 仅当用户配置了非默认或本地开启了 dump1090 时轮询（超时极短不阻塞）
            if not drv.get("simulator", {}).get("enabled", False):
                self.hardware.poll_dump1090(drv.get("adsb_receiver", {}).get("dump1090_url", ""))

        sim_frame = self.simulator.step(config)
        hw_frame = self.hardware.snapshot(config)

        # 合并真实硬件与（可选开启的）仿真数据，真实硬件优先
        raw_targets = list(hw_frame["targets"]) + list(sim_frame["targets"])
        evaluated_targets = [evaluate_target_threat(t, config) for t in raw_targets]

        # 威胁排序：CRITICAL > CAUTION > NORMAL，再按距离由近到远
        rank = {"CRITICAL": 0, "CAUTION": 1, "NORMAL": 2}
        evaluated_targets.sort(key=lambda x: (rank.get(x.threat_level, 9), x.distance_to_center_m))

        rf_alerts = list(hw_frame["rf_alerts"]) + list(sim_frame["rf_alerts"])
        spectrum = hw_frame["spectrum"] or sim_frame["spectrum"]
        weather = hw_frame["weather"] or sim_frame["weather"]

        # 自动写入事件黑匣子（带防刷屏冷却）
        for t in evaluated_targets:
            if t.threat_level in ("CRITICAL", "CAUTION"):
                ev_type = "NFZ_INTRUSION" if t.threat_level == "CRITICAL" else "PERIMETER_WARN"
                if t.category == "MANNED":
                    ev_type = "LOW_ALT_AIRCRAFT"
                self.storage.record_event(
                    dedup_key=f"{t.target_id}:{t.threat_level}:{t.zone_status}",
                    cooldown_sec=35.0,
                    event_type=ev_type,
                    severity=t.threat_level,
                    source=t.source,
                    summary=f"{t.model} ({t.serial_no}) entered {t.zone_status} at {t.distance_to_center_m:.0f}m / Alt {t.alt_m:.0f}m",
                    target_id=t.target_id,
                    model=t.model,
                    serial_no=t.serial_no,
                    lat=t.lat,
                    lng=t.lng,
                    alt_m=t.alt_m,
                    distance_m=t.distance_to_center_m,
                    pilot_lat=t.pilot_lat or 0.0,
                    pilot_lng=t.pilot_lng or 0.0,
                )

        for rf in rf_alerts:
            self.storage.record_event(
                dedup_key=f"{rf.alert_id}:{rf.threat_level}",
                cooldown_sec=35.0,
                event_type="DARK_UAV_RF_ENERGY",
                severity=rf.threat_level,
                source="SDR",
                summary=f"{rf.band} {rf.center_freq_mhz:.0f}MHz ({rf.peak_dbm:.1f}dBm) - {rf.protocol_hint}",
                model=rf.protocol_hint,
                serial_no=f"{rf.center_freq_mhz:.0f}MHz",
            )

        # 生成集群表演安全起飞检查单（Pre-Flight Safety Gate）
        checklist = self._evaluate_show_readiness(evaluated_targets, rf_alerts, spectrum, weather)
        caps = self.compute_capabilities(config)

        # 汇总系统最高告警态
        overall_alert = "NORMAL"
        if any(t.threat_level == "CRITICAL" for t in evaluated_targets) or any(
            r.threat_level == "CRITICAL" for r in rf_alerts
        ):
            overall_alert = "CRITICAL"
        elif (
            any(t.threat_level == "CAUTION" for t in evaluated_targets)
            or len(rf_alerts) > 0
            or (weather and weather.flight_safety != "SAFE")
        ):
            overall_alert = "CAUTION"

        return {
            "timestamp": now,
            "overall_alert": overall_alert,
            "capabilities": caps,
            "targets": [t.to_dict() for t in evaluated_targets],
            "rf_alerts": [r.to_dict() for r in rf_alerts],
            "spectrum": spectrum,
            "weather": weather.to_dict() if weather else None,
            "show_readiness": checklist,
        }

    def _evaluate_show_readiness(
        self,
        targets: List[Any],
        rf_alerts: List[Any],
        spectrum: Any,
        weather: Any,
    ) -> Dict[str, Any]:
        uav_clear = not any(
            t.category == "UAV" and t.whitelist_status != "WHITELIST" and t.threat_level != "NORMAL"
            for t in targets
        )
        manned_clear = not any(t.category == "MANNED" and t.threat_level != "NORMAL" for t in targets)
        rf_clear = len(rf_alerts) == 0 and (
            not spectrum or spectrum.get("channel_congestion_pct", 0) < 60
        )
        wind_clear = True if not weather else (weather.flight_safety == "SAFE")

        if not uav_clear or not manned_clear or (weather and weather.flight_safety == "HOLD"):
            verdict = "HOLD"
        elif not rf_clear or not wind_clear:
            verdict = "CAUTION"
        else:
            verdict = "GO"

        return {
            "verdict": verdict,  # "GO" | "CAUTION" | "HOLD"
            "uav_airspace_clear": uav_clear,
            "manned_aircraft_clear": manned_clear,
            "rf_spectrum_clean": rf_clear,
            "weather_wind_safe": wind_clear,
        }
