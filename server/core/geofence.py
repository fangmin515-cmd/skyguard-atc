# -*- coding: utf-8 -*-
"""
WGS-84 空间几何解算与双层电子围栏（外圈预警区 + 内圈禁飞区 + 表演编队保护盒）判定引擎
"""

import math
from typing import List, Tuple, Dict, Any
from .models import AerialTarget

EARTH_RADIUS_M = 6371000.0


def haversine_distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """计算两点 WGS-84 坐标间的球面距离（米）"""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lam = math.radians(lng2 - lng1)

    a = (
        math.sin(d_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lam / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))
    return EARTH_RADIUS_M * c


def bearing_deg(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """计算从点1指向点2的真北方位角（0-360°）"""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_lam = math.radians(lng2 - lng1)

    y = math.sin(d_lam) * math.cos(phi2)
    x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(d_lam)
    brng = math.degrees(math.atan2(y, x))
    return (brng + 360.0) % 360.0


def point_in_polygon(lat: float, lng: float, polygon: List[List[float]]) -> bool:
    """射线法判断 (lat, lng) 是否位于多边形 [[lat, lng], ...] 内部"""
    if not polygon or len(polygon) < 3:
        return False
    inside = False
    n = len(polygon)
    j = n - 1
    for i in range(n):
        yi, xi = polygon[i][0], polygon[i][1]
        yj, xj = polygon[j][0], polygon[j][1]
        intersect = ((yi > lat) != (yj > lat)) and (
            lng < (xj - xi) * (lat - yi) / ((yj - yi) or 1e-12) + xi
        )
        if intersect:
            inside = not inside
        j = i
    return inside


def evaluate_target_threat(target: AerialTarget, config: Dict[str, Any]) -> AerialTarget:
    """
    根据站点中心坐标、双层防区半径、表演空域保护盒以及黑白名单，综合研判目标威胁等级
    """
    site = config.get("site", {})
    gf = config.get("geofence", {})
    center_lat = float(site.get("center_lat", 13.7267))
    center_lng = float(site.get("center_lng", 100.5105))
    inner_r = float(gf.get("inner_nfz_radius_m", 450.0))
    outer_r = float(gf.get("outer_warn_radius_m", 1200.0))

    whitelist = set(config.get("whitelist_sns", []))
    blacklist = set(config.get("blacklist_sns", []))

    dist_m = haversine_distance_m(center_lat, center_lng, target.lat, target.lng)
    brng = bearing_deg(center_lat, center_lng, target.lat, target.lng)
    target.distance_to_center_m = round(dist_m, 1)
    target.bearing_from_center_deg = round(brng, 1)

    if target.pilot_lat is not None and target.pilot_lng is not None:
        p_dist = haversine_distance_m(target.lat, target.lng, target.pilot_lat, target.pilot_lng)
        target.pilot_distance_m = round(p_dist, 1)

    # 名单核验
    if target.serial_no in whitelist or target.whitelist_status == "WHITELIST":
        target.whitelist_status = "WHITELIST"
    elif target.serial_no in blacklist:
        target.whitelist_status = "BLACKLIST"
    else:
        target.whitelist_status = "UNKNOWN"

    # 空间防区判定（含手绘自定义多边形禁飞区、表演编队保护盒、内外圈圆环）
    custom_poly = gf.get("custom_nfz_polygon", [])
    in_custom_nfz = len(custom_poly) >= 3 and point_in_polygon(target.lat, target.lng, custom_poly)

    show_box = gf.get("show_formation_box", {})
    in_show_box = False
    if show_box.get("enabled") and site.get("operating_mode") == "show_escort":
        in_show_box = point_in_polygon(target.lat, target.lng, show_box.get("polygon", []))

    if in_custom_nfz:
        target.zone_status = "CUSTOM_NFZ"
    elif in_show_box:
        target.zone_status = "SHOW_BOX"
    elif dist_m <= inner_r:
        target.zone_status = "NFZ_CORE"
    elif dist_m <= outer_r:
        target.zone_status = "WARN_ZONE"
    else:
        target.zone_status = "OUTSIDE"

    # 综合威胁定级
    if target.whitelist_status == "WHITELIST":
        target.threat_level = "NORMAL"
    elif target.category == "MANNED":
        # 有人驾驶航空器（直升机/通航）：低空进入外圈或自定义禁飞区触发防撞预警
        if (dist_m <= outer_r or in_custom_nfz) and target.alt_m <= 500:
            target.threat_level = "CRITICAL" if (dist_m <= inner_r or in_custom_nfz) else "CAUTION"
        else:
            target.threat_level = "NORMAL"
    else:
        # 未知或黑名单无人机
        if target.zone_status in ("CUSTOM_NFZ", "NFZ_CORE", "SHOW_BOX"):
            target.threat_level = "CRITICAL"
        elif target.zone_status == "WARN_ZONE" or target.whitelist_status == "BLACKLIST":
            target.threat_level = "CAUTION"
        else:
            target.threat_level = "NORMAL"

    return target
