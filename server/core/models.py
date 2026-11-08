# -*- coding: utf-8 -*-
"""
统一低空态势数据模型（全系统原生采用 WGS-84 坐标系）
"""

from dataclasses import dataclass, field, asdict
from typing import List, Optional, Tuple, Dict, Any
import time


@dataclass
class TrackPoint:
    lat: float
    lng: float
    alt_m: float
    ts: float


@dataclass
class AerialTarget:
    target_id: str
    source: str  # "RID" | "ADS-B" | "EXTERNAL_API"
    category: str  # "UAV" | "MANNED"
    model: str
    serial_no: str
    lat: float
    lng: float
    alt_m: float  # 相对高度或气压高度 (m)
    speed_ms: float
    heading_deg: float
    vertical_speed_ms: float = 0.0
    pilot_lat: Optional[float] = None
    pilot_lng: Optional[float] = None
    rssi_dbm: Optional[float] = None
    freq_mhz: Optional[float] = None
    whitelist_status: str = "UNKNOWN"  # "WHITELIST" | "BLACKLIST" | "UNKNOWN"
    threat_level: str = "NORMAL"  # "NORMAL" | "CAUTION" | "CRITICAL"
    zone_status: str = "OUTSIDE"  # "OUTSIDE" | "WARN_ZONE" | "NFZ_CORE" | "SHOW_BOX"
    distance_to_center_m: float = 0.0
    bearing_from_center_deg: float = 0.0
    pilot_distance_m: Optional[float] = None
    first_seen_ts: float = field(default_factory=time.time)
    last_seen_ts: float = field(default_factory=time.time)
    is_simulated: bool = False
    trail: List[Tuple[float, float]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class RfBandAlert:
    alert_id: str
    band: str  # "2.4GHz" | "5.8GHz" | "900MHz"
    center_freq_mhz: float
    bandwidth_mhz: float
    peak_dbm: float
    protocol_hint: str  # e.g. "Suspected Analog/Digital FPV Video", "Unknown FHSS Control"
    est_distance_band: str  # "< 300m" | "300m - 800m" | "800m - 1.5km"
    threat_level: str  # "CAUTION" | "CRITICAL"
    timestamp: float
    is_simulated: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class WeatherTelemetry:
    temp_c: float
    humidity_pct: float
    wind_speed_ms: float
    wind_gust_ms: float
    wind_dir_deg: float
    pressure_hpa: float
    flight_safety: str  # "SAFE" | "CAUTION" | "HOLD"
    timestamp: float
    is_simulated: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)
