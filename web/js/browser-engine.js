// SkyGuard ATC — 浏览器端独立全功能态势与仿真引擎 (GitHub Pages 云端免后端独立运行核心)
const STORAGE_CFG_KEY = "skyguard_atc_config_v2";
const STORAGE_EVT_KEY = "skyguard_atc_events_v2";

// 泰国典型无人机表演场地、商圈与景点预设库 (WGS-84)
export const VENUE_PRESETS = {
  iconsiam: {
    preset_id: "iconsiam",
    name: "ICONSIAM Riverfront Airspace",
    city: "Bangkok, Thailand",
    center_lat: 13.7267,
    center_lng: 100.5105,
    inner_nfz_radius_m: 450,
    outer_warn_radius_m: 1200,
    show_box: [
      [13.7286, 100.5112],
      [13.7282, 100.5142],
      [13.7248, 100.5135],
      [13.7252, 100.5106]
    ]
  },
  centralworld: {
    preset_id: "centralworld",
    name: "CentralWorld Ratchaprasong",
    city: "Bangkok, Thailand",
    center_lat: 13.7466,
    center_lng: 100.5393,
    inner_nfz_radius_m: 400,
    outer_warn_radius_m: 1100,
    show_box: [
      [13.7481, 100.5398],
      [13.7478, 100.5422],
      [13.7452, 100.5419],
      [13.7455, 100.5395]
    ]
  },
  asiatique: {
    preset_id: "asiatique",
    name: "Asiatique The Riverfront",
    city: "Bangkok, Thailand",
    center_lat: 13.7044,
    center_lng: 100.5032,
    inner_nfz_radius_m: 420,
    outer_warn_radius_m: 1200,
    show_box: [
      [13.7062, 100.5008],
      [13.7058, 100.5035],
      [13.7029, 100.5028],
      [13.7033, 100.5001]
    ]
  },
  pattaya_bay: {
    preset_id: "pattaya_bay",
    name: "Pattaya Central Beach Bay",
    city: "Pattaya, Chonburi",
    center_lat: 12.9347,
    center_lng: 100.8825,
    inner_nfz_radius_m: 500,
    outer_warn_radius_m: 1500,
    show_box: [
      [12.9368, 100.8788],
      [12.9364, 100.8821],
      [12.9328, 100.8816],
      [12.9332, 100.8783]
    ]
  },
  phuket_patong: {
    preset_id: "phuket_patong",
    name: "Patong Beach Airspace",
    city: "Phuket, Thailand",
    center_lat: 7.8965,
    center_lng: 98.2965,
    inner_nfz_radius_m: 500,
    outer_warn_radius_m: 1400,
    show_box: [
      [7.8986, 98.2928],
      [7.8982, 98.2959],
      [7.8946, 98.2954],
      [7.8950, 98.2923]
    ]
  },
  chiangmai_gate: {
    preset_id: "chiangmai_gate",
    name: "Tha Phae Gate Old City",
    city: "Chiang Mai, Thailand",
    center_lat: 18.7877,
    center_lng: 98.9933,
    inner_nfz_radius_m: 380,
    outer_warn_radius_m: 1000,
    show_box: [
      [18.7892, 98.9936],
      [18.7889, 98.9958],
      [18.7864, 98.9954],
      [18.7867, 98.9932]
    ]
  }
};

export const DEFAULT_CONFIG = {
  site: {
    preset_id: "iconsiam",
    name: "ICONSIAM Riverfront Airspace",
    city: "Bangkok, Thailand",
    center_lat: 13.7267,
    center_lng: 100.5105,
    default_zoom: 15,
    operating_mode: "show_escort",
    default_lang: "zh"
  },
  geofence: {
    inner_nfz_radius_m: 450,
    outer_warn_radius_m: 1200,
    altitude_ceiling_m: 300,
    custom_nfz_polygon: [],
    show_formation_box: {
      enabled: true,
      name: "Chao Phraya Show Box A",
      polygon: [
        [13.7286, 100.5112],
        [13.7282, 100.5142],
        [13.7248, 100.5135],
        [13.7252, 100.5106]
      ],
      max_alt_m: 220
    }
  },
  drivers: {
    simulator: {
      enabled: true,
      scenario: "mixed_live"
    },
    rid_receiver: { enabled: true, udp_port: 9871 },
    adsb_receiver: { enabled: true, max_range_km: 15.0, max_alt_m: 1500 },
    sdr_spectrum: { enabled: true, alert_threshold_dbm: -62.0 },
    weather_station: { enabled: true, wind_warn_ms: 8.0, wind_crit_ms: 10.5 }
  },
  whitelist_sns: ["ICONSIAM-SHOW-MASTER", "SHOW-FLEET-001", "SEC-PATROL-TH01"],
  blacklist_sns: ["1581F6N8C236E003"],
  notifications: {
    audio_alert: true,
    line_enabled: true,
    line_token: ""
  },
  map: {
    default_layer: "dark_atc",
    google_maps_api_key: ""
  }
};

const EARTH_RADIUS_M = 6371000.0;

export function haversineDistanceM(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180.0;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dPhi = toRad(lat2 - lat1);
  const dLam = toRad(lng2 - lng1);
  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLam / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

export function bearingDeg(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180.0;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLam = toRad(lng2 - lng1);
  const y = Math.sin(dLam) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLam);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function pointInPolygon(lat, lng, polygon) {
  if (!polygon || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = polygon[i][0], xi = polygon[i][1];
    const yj = polygon[j][0], xj = polygon[j][1];
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi || 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export class BrowserAutonomousEngine {
  constructor() {
    this.startTs = Date.now() / 1000;
    this.trails = {};
    this.dedupMap = {};
    this.config = this._loadConfig();
    this.events = this._loadEvents();
  }

  _loadConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_CFG_KEY);
      if (raw) {
        return this._deepMerge(structuredClone(DEFAULT_CONFIG), JSON.parse(raw));
      }
    } catch (_) {}
    return structuredClone(DEFAULT_CONFIG);
  }

  _saveConfig() {
    try {
      localStorage.setItem(STORAGE_CFG_KEY, JSON.stringify(this.config));
    } catch (_) {}
  }

  _loadEvents() {
    try {
      const raw = localStorage.getItem(STORAGE_EVT_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return [];
  }

  _saveEvents() {
    try {
      localStorage.setItem(STORAGE_EVT_KEY, JSON.stringify(this.events.slice(0, 120)));
    } catch (_) {}
  }

  _deepMerge(target, source) {
    for (const k of Object.keys(source)) {
      if (
        source[k] &&
        typeof source[k] === "object" &&
        !Array.isArray(source[k]) &&
        target[k] &&
        typeof target[k] === "object" &&
        !Array.isArray(target[k])
      ) {
        this._deepMerge(target[k], source[k]);
      } else {
        target[k] = source[k];
      }
    }
    return target;
  }

  getConfig() {
    return this.config;
  }

  updateConfig(patch) {
    const oldLat = this.config.site?.center_lat;
    const oldLng = this.config.site?.center_lng;
    this._deepMerge(this.config, patch);
    if (
      (patch.site?.center_lat && patch.site.center_lat !== oldLat) ||
      (patch.site?.center_lng && patch.site.center_lng !== oldLng)
    ) {
      this.trails = {};
    }
    this._saveConfig();
    return this.config;
  }

  toggleList(serialNo, listType) {
    const wl = (this.config.whitelist_sns || []).filter((x) => x !== serialNo);
    const bl = (this.config.blacklist_sns || []).filter((x) => x !== serialNo);
    if (listType === "whitelist") wl.push(serialNo);
    else if (listType === "blacklist") bl.push(serialNo);
    this.config.whitelist_sns = wl;
    this.config.blacklist_sns = bl;
    this._saveConfig();
    return this.config;
  }

  getEvents(limit = 30) {
    return this.events.slice(0, limit);
  }

  clearEvents() {
    this.events = [];
    this.dedupMap = {};
    this._saveEvents();
  }

  exportCsvString() {
    const header = [
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
      "Summary"
    ];
    const escapeCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [header.map(escapeCell).join(",")];
    for (const ev of this.events) {
      const gmap =
        ev.pilot_lat && ev.pilot_lng
          ? `https://www.google.com/maps?q=${Number(ev.pilot_lat).toFixed(6)},${Number(ev.pilot_lng).toFixed(6)}`
          : "";
      rows.push(
        [
          ev.id,
          ev.time_ict,
          ev.severity,
          ev.event_type,
          ev.source,
          ev.model,
          ev.serial_no,
          ev.lat || "",
          ev.lng || "",
          ev.alt_m || "",
          ev.distance_m || "",
          ev.pilot_lat || "",
          ev.pilot_lng || "",
          gmap,
          ev.summary
        ]
          .map(escapeCell)
          .join(",")
      );
    }
    return "\ufeff" + rows.join("\r\n");
  }

  formatDispatchMessage({
    lang = "zh",
    severity = "CRITICAL",
    model = "Unknown UAV",
    serial_no = "N/A",
    distance_m = 0,
    alt_m = 0,
    lat = 13.7267,
    lng = 100.5105,
    pilot_lat = null,
    pilot_lng = null
  }) {
    const siteName = this.config.site?.name || "ICONSIAM Riverfront Airspace";
    const nowStr =
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Bangkok",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      }).format(new Date()) + " (ICT)";

    const droneMap = `https://www.google.com/maps?q=${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`;
    const pilotMap =
      pilot_lat && pilot_lng
        ? `https://www.google.com/maps?q=${Number(pilot_lat).toFixed(6)},${Number(pilot_lng).toFixed(6)}`
        : null;

    if (lang === "th") {
      const header =
        severity === "CRITICAL"
          ? "🚨 [แจ้งเตือนด่วน: โดรนรุกล้ำพื้นที่ห้ามบิน]"
          : "⚠️ [เฝ้าระวัง: ตรวจพบโดรนใกล้พื้นที่]";
      const lines = [
        header,
        `📍 พื้นที่: ${siteName}`,
        `🕒 เวลา: ${nowStr}`,
        `🛸 รุ่น/รหัส: ${model} (${serial_no})`,
        `📏 ระยะห่าง: ${Math.round(distance_m)} ม. | ความสูง: ${Math.round(alt_m)} ม.`,
        `🗺️ พิกัดโดรน: ${droneMap}`
      ];
      if (pilotMap) lines.push(`🏃 พิกัดผู้บังคับ (นำทางให้ รปภ.): ${pilotMap}`);
      return lines.join("\n");
    }

    if (lang === "en") {
      const header =
        severity === "CRITICAL"
          ? "🚨 [CRITICAL: NFZ DRONE INTRUSION]"
          : "⚠️ [CAUTION: PERIMETER UAV DETECTED]";
      const lines = [
        header,
        `📍 Site: ${siteName}`,
        `🕒 Time: ${nowStr}`,
        `🛸 Target: ${model} (${serial_no})`,
        `📏 Dist: ${Math.round(distance_m)}m | Alt: ${Math.round(alt_m)}m`,
        `🗺️ Drone Pin: ${droneMap}`
      ];
      if (pilotMap) lines.push(`🏃 Pilot Location (Guard Nav): ${pilotMap}`);
      return lines.join("\n");
    }

    const header =
      severity === "CRITICAL"
        ? "🚨【一级告警：无人机闯入核心禁飞区】"
        : "⚠️【二级预警：周边发现未知飞行器】";
    const lines = [
      header,
      `📍 防护站点：${siteName}`,
      `🕒 曼谷时间：${nowStr}`,
      `🛸 机型/SN：${model} (${serial_no})`,
      `📏 距中心：${Math.round(distance_m)} 米 | 高度：${Math.round(alt_m)} 米`,
      `🗺️ 无人机定位：${droneMap}`
    ];
    if (pilotMap) lines.push(`🏃 飞手位置（点击用谷歌地图导航找人）：${pilotMap}`);
    return lines.join("\n");
  }

  _appendTrail(tid, lat, lng, maxPts = 36) {
    if (!this.trails[tid]) this.trails[tid] = [];
    const pts = this.trails[tid];
    const rLat = Number(lat.toFixed(6));
    const rLng = Number(lng.toFixed(6));
    if (!pts.length || Math.abs(pts[pts.length - 1][0] - rLat) > 1e-5 || Math.abs(pts[pts.length - 1][1] - rLng) > 1e-5) {
      pts.push([rLat, rLng]);
      if (pts.length > maxPts) pts.shift();
    }
    return [...pts];
  }

  _recordEvent(dedupKey, cooldownSec, evData) {
    const now = Date.now() / 1000;
    const last = this.dedupMap[dedupKey] || 0;
    if (now - last < cooldownSec) return;
    this.dedupMap[dedupKey] = now;

    const timeIct = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).format(new Date());

    const nextId = (this.events[0]?.id || 0) + 1;
    this.events.unshift({
      id: nextId,
      ts: now,
      time_ict: timeIct,
      ...evData
    });
    if (this.events.length > 100) this.events.pop();
    this._saveEvents();
  }

  _evaluateTarget(target) {
    const site = this.config.site || {};
    const gf = this.config.geofence || {};
    const clat = Number(site.center_lat || 13.7267);
    const clng = Number(site.center_lng || 100.5105);
    const innerR = Number(gf.inner_nfz_radius_m || 450);
    const outerR = Number(gf.outer_warn_radius_m || 1200);
    const wl = new Set(this.config.whitelist_sns || []);
    const bl = new Set(this.config.blacklist_sns || []);

    const distM = haversineDistanceM(clat, clng, target.lat, target.lng);
    const brng = bearingDeg(clat, clng, target.lat, target.lng);
    target.distance_to_center_m = Number(distM.toFixed(1));
    target.bearing_from_center_deg = Number(brng.toFixed(1));

    if (target.pilot_lat && target.pilot_lng) {
      target.pilot_distance_m = Number(
        haversineDistanceM(target.lat, target.lng, target.pilot_lat, target.pilot_lng).toFixed(1)
      );
    }

    if (wl.has(target.serial_no) || target.whitelist_status === "WHITELIST") {
      target.whitelist_status = "WHITELIST";
    } else if (bl.has(target.serial_no)) {
      target.whitelist_status = "BLACKLIST";
    } else {
      target.whitelist_status = "UNKNOWN";
    }

    const customPoly = gf.custom_nfz_polygon || [];
    const inCustomNfz = customPoly.length >= 3 && pointInPolygon(target.lat, target.lng, customPoly);

    const showBox = gf.show_formation_box || {};
    const inShowBox =
      showBox.enabled &&
      site.operating_mode === "show_escort" &&
      pointInPolygon(target.lat, target.lng, showBox.polygon || []);

    if (inCustomNfz) target.zone_status = "CUSTOM_NFZ";
    else if (inShowBox) target.zone_status = "SHOW_BOX";
    else if (distM <= innerR) target.zone_status = "NFZ_CORE";
    else if (distM <= outerR) target.zone_status = "WARN_ZONE";
    else target.zone_status = "OUTSIDE";

    if (target.whitelist_status === "WHITELIST") {
      target.threat_level = "NORMAL";
    } else if (target.category === "MANNED") {
      if ((distM <= outerR || inCustomNfz) && target.alt_m <= 500) {
        target.threat_level = distM <= innerR || inCustomNfz ? "CRITICAL" : "CAUTION";
      } else {
        target.threat_level = "NORMAL";
      }
    } else {
      if (
        target.zone_status === "CUSTOM_NFZ" ||
        target.zone_status === "NFZ_CORE" ||
        target.zone_status === "SHOW_BOX"
      ) {
        target.threat_level = "CRITICAL";
      } else if (target.zone_status === "WARN_ZONE" || target.whitelist_status === "BLACKLIST") {
        target.threat_level = "CAUTION";
      } else {
        target.threat_level = "NORMAL";
      }
    }
    return target;
  }

  tick() {
    const now = Date.now() / 1000;
    const t = now - this.startTs;
    const drv = this.config.drivers || {};
    const simEnabled = drv.simulator?.enabled !== false;
    const scenario = drv.simulator?.scenario || "mixed_live";
    const hasRid = drv.rid_receiver?.enabled !== false;
    const hasAdsb = drv.adsb_receiver?.enabled !== false;
    const hasSdr = drv.sdr_spectrum?.enabled !== false;
    const hasWx = drv.weather_station?.enabled !== false;

    const site = this.config.site || {};
    const clat = Number(site.center_lat || 13.7267);
    const clng = Number(site.center_lng || 100.5105);

    const targets = [];
    const rfAlerts = [];
    let spectrum = null;
    let weather = null;

    if (simEnabled) {
      // 1. 自有集群编队领航信标 (白名单)
      if (hasRid && site.operating_mode === "show_escort") {
        const sLat = clat + 0.0002 + 0.00035 * Math.sin(t * 0.08);
        const sLng = clng + 0.0021 + 0.00025 * Math.cos(t * 0.08);
        const hdg =
          ((Math.atan2(-0.00025 * Math.sin(t * 0.08), 0.00035 * Math.cos(t * 0.08)) * 180) /
            Math.PI +
            360) %
          360;
        targets.push(
          this._evaluateTarget({
            target_id: "UAV-SHOW-01",
            source: "RID",
            category: "UAV",
            model: "Formation Lead (500x Fleet)",
            serial_no: "ICONSIAM-SHOW-MASTER",
            lat: Number(sLat.toFixed(6)),
            lng: Number(sLng.toFixed(6)),
            alt_m: Number((115 + 12 * Math.sin(t * 0.1)).toFixed(1)),
            speed_ms: 3.2,
            heading_deg: Number(hdg.toFixed(1)),
            pilot_lat: Number((clat - 0.0003).toFixed(6)),
            pilot_lng: Number((clng + 0.0008).toFixed(6)),
            rssi_dbm: -48.0,
            freq_mhz: 2442.0,
            whitelist_status: "WHITELIST",
            trail: this._appendTrail("UAV-SHOW-01", sLat, sLng)
          })
        );
      }

      // 2. 入侵无人机 #1: DJI Air 3
      if (hasRid && (scenario === "mixed_live" || scenario === "nfz_intrusion")) {
        const phase = (t * 0.035) % (2 * Math.PI);
        const radiusDeg = 0.0052 - 0.0031 * (0.5 + 0.5 * Math.sin(phase));
        const angle = -1.15 + 0.65 * Math.cos(phase * 0.7);
        const dLat = clat + radiusDeg * Math.sin(angle);
        const dLng = clng + radiusDeg * Math.cos(angle);

        const prevPhase = Math.max(0, phase - 0.05);
        const pRad = 0.0052 - 0.0031 * (0.5 + 0.5 * Math.sin(prevPhase));
        const pAng = -1.15 + 0.65 * Math.cos(prevPhase * 0.7);
        const pLat = clat + pRad * Math.sin(pAng);
        const pLng = clng + pRad * Math.cos(pAng);
        const hdg1 = ((Math.atan2(dLng - pLng, dLat - pLat) * 180) / Math.PI + 360) % 360;

        targets.push(
          this._evaluateTarget({
            target_id: "RID-AIR3-88",
            source: "RID",
            category: "UAV",
            model: "DJI Air 3",
            serial_no: "1581F6N8C236E003",
            lat: Number(dLat.toFixed(6)),
            lng: Number(dLng.toFixed(6)),
            alt_m: Number((88 + 14 * Math.sin(t * 0.15)).toFixed(1)),
            speed_ms: Number((9.4 + 1.8 * Math.cos(t * 0.2)).toFixed(1)),
            heading_deg: Number(hdg1.toFixed(1)),
            pilot_lat: Number((clat - 0.0068).toFixed(6)),
            pilot_lng: Number((clng + 0.0031).toFixed(6)),
            rssi_dbm: -59.0,
            freq_mhz: 5785.0,
            trail: this._appendTrail("RID-AIR3-88", dLat, dLng)
          })
        );
      }

      // 3. 外圈游客无人机 #2: DJI Mini 4 Pro
      if (hasRid && scenario === "mixed_live") {
        const mAng = t * 0.045;
        const mLat = clat + 0.0078 * Math.cos(mAng) + 0.0015;
        const mLng = clng - 0.0082 + 0.003 * Math.sin(mAng);
        const hdg2 =
          ((Math.atan2(0.003 * Math.cos(mAng), -0.0078 * Math.sin(mAng)) * 180) / Math.PI + 360) %
          360;
        targets.push(
          this._evaluateTarget({
            target_id: "RID-MINI4-19",
            source: "RID",
            category: "UAV",
            model: "DJI Mini 4 Pro",
            serial_no: "1581F5YH9910A721",
            lat: Number(mLat.toFixed(6)),
            lng: Number(mLng.toFixed(6)),
            alt_m: 64.0,
            speed_ms: 6.1,
            heading_deg: Number(hdg2.toFixed(1)),
            pilot_lat: Number((clat + 0.0042).toFixed(6)),
            pilot_lng: Number((clng - 0.0096).toFixed(6)),
            rssi_dbm: -71.5,
            freq_mhz: 2462.0,
            trail: this._appendTrail("RID-MINI4-19", mLat, mLng)
          })
        );
      }

      // 4. 湄南河低空观光直升机 ADS-B
      if (hasAdsb && (scenario === "mixed_live" || scenario === "nfz_intrusion")) {
        const sweep = ((t * 0.018) % 2.0) - 1.0;
        const hLat = clat + sweep * 0.018;
        const hLng = clng + 0.0032 + sweep * 0.0045;
        targets.push(
          this._evaluateTarget({
            target_id: "ADSB-HSBKK",
            source: "ADS-B",
            category: "MANNED",
            model: "EC135 Helicopter (HS-BKK)",
            serial_no: "ICAO-8851A2",
            lat: Number(hLat.toFixed(6)),
            lng: Number(hLng.toFixed(6)),
            alt_m: 310.0,
            speed_ms: 46.5,
            heading_deg: 14.0,
            rssi_dbm: -63.0,
            freq_mhz: 1090.0,
            trail: this._appendTrail("ADSB-HSBKK", hLat, hLng)
          })
        );
      }

      // 5. SDR 频谱瀑布与无 RID 穿越机能量告警
      if (hasSdr) {
        const rand = (a, b) => a + Math.random() * (b - a);
        const bins24 = Array.from({ length: 64 }, () => -94 + rand(-2.2, 2.2));
        const bins58 = Array.from({ length: 64 }, () => -95 + rand(-2.0, 2.0));

        [
          [10, 14],
          [31, 18],
          [52, 15]
        ].forEach(([cIdx, amp]) => {
          for (let w = -5; w <= 5; w++) {
            const idx = cIdx + w;
            if (idx >= 0 && idx < 64) bins24[idx] += amp * Math.exp(-(w * w) / 7);
          }
        });

        if (scenario === "mixed_live" || scenario === "nfz_intrusion") {
          for (let w = -6; w <= 6; w++) {
            const idx = 30 + w;
            if (idx >= 0 && idx < 64) {
              bins58[idx] += 31 * Math.exp(-(w * w) / 9) + rand(-1.5, 1.5);
            }
          }
        }

        const fpvActive =
          scenario === "dark_fpv_rf" || (scenario === "mixed_live" && Math.floor(t) % 40 >= 22);
        if (fpvActive) {
          const peakVal = -51.5 + 3.0 * Math.sin(t * 0.9) + rand(-1.2, 1.2);
          for (let w = -4; w <= 4; w++) {
            const idx = 12 + w;
            if (idx >= 0 && idx < 64) {
              bins58[idx] = Math.max(bins58[idx], peakVal - Math.abs(w) * 5.2);
            }
          }
          rfAlerts.push({
            alert_id: "RF-FPV-5745",
            band: "5.8GHz",
            center_freq_mhz: 5745.0,
            bandwidth_mhz: 20.0,
            peak_dbm: Number(peakVal.toFixed(1)),
            protocol_hint: "Unidentified 5.8G Video Carrier (No RID)",
            est_distance_band: "300m - 700m",
            threat_level: peakVal > -52 ? "CRITICAL" : "CAUTION",
            timestamp: now
          });
        }

        spectrum = {
          band_24g: bins24.map((v) => Number(v.toFixed(1))),
          band_58g: bins58.map((v) => Number(v.toFixed(1))),
          noise_floor_24g_dbm: -91.5,
          noise_floor_58g_dbm: -93.8,
          channel_congestion_pct: scenario === "dark_fpv_rf" ? 68 : 34
        };
      }

      // 6. 五要素微气象
      if (hasWx) {
        const warnW = Number(drv.weather_station?.wind_warn_ms || 8.0);
        const critW = Number(drv.weather_station?.wind_crit_ms || 10.5);
        const wind =
          scenario === "high_wind_hold"
            ? Number((9.6 + 1.4 * Math.sin(t * 0.3)).toFixed(1))
            : Number((3.4 + 0.9 * Math.sin(t * 0.12)).toFixed(1));
        const gust = Number((wind + (scenario === "high_wind_hold" ? 2.3 : 1.5)).toFixed(1));
        const safety =
          gust >= critW || wind >= warnW ? (wind >= critW ? "HOLD" : "CAUTION") : "SAFE";

        weather = {
          temp_c: Number((31.2 + 0.2 * Math.sin(t * 0.02)).toFixed(1)),
          humidity_pct: Number((68.5 + 1.2 * Math.cos(t * 0.03)).toFixed(1)),
          wind_speed_ms: Math.max(0, wind),
          wind_gust_ms: Math.max(0, gust),
          wind_dir_deg: Math.round((195 + 8 * Math.sin(t * 0.05)) % 360),
          pressure_hpa: 1007.8,
          flight_safety: safety
        };
      }
    }

    const rank = { CRITICAL: 0, CAUTION: 1, NORMAL: 2 };
    targets.sort(
      (a, b) => (rank[a.threat_level] ?? 9) - (rank[b.threat_level] ?? 9) || a.distance_to_center_m - b.distance_to_center_m
    );

    // 自动记录告警事件
    for (const tgt of targets) {
      if (tgt.threat_level === "CRITICAL" || tgt.threat_level === "CAUTION") {
        let evType = tgt.threat_level === "CRITICAL" ? "NFZ_INTRUSION" : "PERIMETER_WARN";
        if (tgt.category === "MANNED") evType = "LOW_ALT_AIRCRAFT";
        this._recordEvent(`${tgt.target_id}:${tgt.threat_level}:${tgt.zone_status}`, 35, {
          event_type: evType,
          severity: tgt.threat_level,
          source: tgt.source,
          target_id: tgt.target_id,
          model: tgt.model,
          serial_no: tgt.serial_no,
          lat: tgt.lat,
          lng: tgt.lng,
          alt_m: tgt.alt_m,
          distance_m: tgt.distance_to_center_m,
          pilot_lat: tgt.pilot_lat || 0,
          pilot_lng: tgt.pilot_lng || 0,
          summary: `${tgt.model} (${tgt.serial_no}) entered ${tgt.zone_status} at ${Math.round(tgt.distance_to_center_m)}m / Alt ${Math.round(tgt.alt_m)}m`
        });
      }
    }

    for (const rf of rfAlerts) {
      this._recordEvent(`${rf.alert_id}:${rf.threat_level}`, 35, {
        event_type: "DARK_UAV_RF_ENERGY",
        severity: rf.threat_level,
        source: "SDR",
        model: rf.protocol_hint,
        serial_no: `${rf.center_freq_mhz}MHz`,
        summary: `${rf.band} ${rf.center_freq_mhz}MHz (${rf.peak_dbm}dBm) - ${rf.protocol_hint}`
      });
    }

    // 评估集群起飞放行门限
    const uavClear = !targets.some(
      (x) => x.category === "UAV" && x.whitelist_status !== "WHITELIST" && x.threat_level !== "NORMAL"
    );
    const mannedClear = !targets.some((x) => x.category === "MANNED" && x.threat_level !== "NORMAL");
    const rfClear = rfAlerts.length === 0 && (!spectrum || spectrum.channel_congestion_pct < 60);
    const windClear = !weather || weather.flight_safety === "SAFE";

    let verdict = "GO";
    if (!uavClear || !mannedClear || (weather && weather.flight_safety === "HOLD")) {
      verdict = "HOLD";
    } else if (!rfClear || !windClear) {
      verdict = "CAUTION";
    }

    let overallAlert = "NORMAL";
    if (
      targets.some((x) => x.threat_level === "CRITICAL") ||
      rfAlerts.some((r) => r.threat_level === "CRITICAL")
    ) {
      overallAlert = "CRITICAL";
    } else if (
      targets.some((x) => x.threat_level === "CAUTION") ||
      rfAlerts.length > 0 ||
      (weather && weather.flight_safety !== "SAFE")
    ) {
      overallAlert = "CAUTION";
    }

    return {
      timestamp: now,
      overall_alert: overallAlert,
      capabilities: {
        simulator_enabled: simEnabled,
        scenario,
        has_rid: hasRid,
        has_adsb: hasAdsb,
        has_spectrum: hasSdr,
        has_weather: hasWx
      },
      targets,
      rf_alerts: rfAlerts,
      spectrum,
      weather,
      show_readiness: {
        verdict,
        uav_airspace_clear: uavClear,
        manned_aircraft_clear: mannedClear,
        rf_spectrum_clean: rfClear,
        weather_wind_safe: windClear
      }
    };
  }
}
