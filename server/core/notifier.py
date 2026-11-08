# -*- coding: utf-8 -*-
"""
泰国本地化安保联动通知器（LINE Notify / Telegram Bot 格式化报文生成与可选实发）
支持一键生成带 Google Maps 飞手定位导航链接的执勤派单消息。
"""

import json
import urllib.request
import urllib.parse
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional

ICT_TZ = timezone(timedelta(hours=7))


def format_dispatch_message(
    lang: str,
    site_name: str,
    severity: str,
    model: str,
    serial_no: str,
    distance_m: float,
    alt_m: float,
    drone_lat: float,
    drone_lng: float,
    pilot_lat: Optional[float] = None,
    pilot_lng: Optional[float] = None,
) -> str:
    now_str = datetime.now(ICT_TZ).strftime("%H:%M:%S (ICT)")
    drone_map = f"https://www.google.com/maps?q={drone_lat:.6f},{drone_lng:.6f}"
    pilot_map = (
        f"https://www.google.com/maps?q={pilot_lat:.6f},{pilot_lng:.6f}"
        if pilot_lat and pilot_lng
        else None
    )

    if lang == "th":
        header = "🚨 [แจ้งเตือนด่วน: โดรนรุกล้ำพื้นที่ห้ามบิน]" if severity == "CRITICAL" else "⚠️ [เฝ้าระวัง: ตรวจพบโดรนใกล้พื้นที่]"
        lines = [
            header,
            f"📍 พื้นที่: {site_name}",
            f"🕒 เวลา: {now_str}",
            f"🛸 รุ่น/รหัส: {model} ({serial_no})",
            f"📏 ระยะห่าง: {distance_m:.0f} ม. | ความสูง: {alt_m:.0f} ม.",
            f"🗺️ พิกัดโดรน: {drone_map}",
        ]
        if pilot_map:
            lines.append(f"🏃 พิกัดผู้บังคับ (นำทางให้ รปภ.): {pilot_map}")
        return "\n".join(lines)

    if lang == "en":
        header = "🚨 [CRITICAL: NFZ DRONE INTRUSION]" if severity == "CRITICAL" else "⚠️ [CAUTION: PERIMETER UAV DETECTED]"
        lines = [
            header,
            f"📍 Site: {site_name}",
            f"🕒 Time: {now_str}",
            f"🛸 Target: {model} ({serial_no})",
            f"📏 Dist: {distance_m:.0f}m | Alt: {alt_m:.0f}m",
            f"🗺️ Drone Pin: {drone_map}",
        ]
        if pilot_map:
            lines.append(f"🏃 Pilot Location (Guard Nav): {pilot_map}")
        return "\n".join(lines)

    # 默认中文
    header = "🚨【一级告警：无人机闯入核心禁飞区】" if severity == "CRITICAL" else "⚠️【二级预警：周边发现未知飞行器】"
    lines = [
        header,
        f"📍 防护站点：{site_name}",
        f"🕒 曼谷时间：{now_str}",
        f"🛸 机型/SN：{model} ({serial_no})",
        f"📏 距中心：{distance_m:.0f} 米 | 高度：{alt_m:.0f} 米",
        f"🗺️ 无人机定位：{drone_map}",
    ]
    if pilot_map:
        lines.append(f"🏃 飞手位置（点击用谷歌地图导航找人）：{pilot_map}")
    return "\n".join(lines)


def send_external_notification(message: str, notify_cfg: Dict[str, Any]) -> Dict[str, Any]:
    """
    若配置了真实 LINE Token 或 Telegram Bot Token，则推送至外部群组；
    未配置 Token 时返回格式化预览报文供前端展示与复制派单。
    """
    results = {"preview": message, "dispatched": []}

    line_token = (notify_cfg.get("line_token") or "").strip()
    if notify_cfg.get("line_enabled") and line_token:
        try:
            data = urllib.parse.urlencode({"message": "\n" + message}).encode("utf-8")
            req = urllib.request.Request(
                "https://notify-api.line.me/api/notify",
                data=data,
                headers={"Authorization": f"Bearer {line_token}"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=4) as resp:
                results["dispatched"].append({"channel": "LINE", "status": resp.status})
        except Exception as exc:
            results["dispatched"].append({"channel": "LINE", "error": str(exc)})

    tg_token = (notify_cfg.get("telegram_bot_token") or "").strip()
    tg_chat = (notify_cfg.get("telegram_chat_id") or "").strip()
    if notify_cfg.get("telegram_enabled") and tg_token and tg_chat:
        try:
            payload = json.dumps(
                {"chat_id": tg_chat, "text": message, "disable_web_page_preview": True}
            ).encode("utf-8")
            req = urllib.request.Request(
                f"https://api.telegram.org/bot{tg_token}/sendMessage",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=4) as resp:
                results["dispatched"].append({"channel": "Telegram", "status": resp.status})
        except Exception as exc:
            results["dispatched"].append({"channel": "Telegram", "error": str(exc)})

    return results
