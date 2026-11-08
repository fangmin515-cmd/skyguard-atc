// SkyGuard ATC — 原生 WGS-84 多图源态势地图引擎 + 离线极坐标空管雷达自动降级双模引擎
export class AirspaceMapController {
  constructor(mapContainerId, polarCanvasId, onSelectTarget) {
    this.mapContainerId = mapContainerId;
    this.polarCanvas = document.getElementById(polarCanvasId);
    this.onSelectTarget = onSelectTarget;
    this.leafletMap = null;
    this.tileLayer = null;
    this.layerMode = "dark_atc";
    this.googleApiKey = "";
    this.selectedTargetId = null;

    // 地理覆盖物缓存
    this.centerMarker = null;
    this.innerCircle = null;
    this.outerCircle = null;
    this.showBoxPoly = null;
    this.targetMarkers = new Map();
    this.trailLines = new Map();
    this.pilotMarkers = new Map();
    this.tetherLines = new Map();

    // 缓存最新帧用于极坐标雷达重绘
    this.lastConfig = null;
    this.lastTargets = [];
    this.radarSweepDeg = 0;
  }

  init(config, cursorCb) {
    this.lastConfig = config;
    const site = config.site || {};
    const clat = site.center_lat || 13.7267;
    const clng = site.center_lng || 100.5105;
    const zoom = site.default_zoom || 15;
    this.googleApiKey = (config.map && config.map.google_maps_api_key) || "";

    if (window.L) {
      this.leafletMap = window.L.map(this.mapContainerId, {
        center: [clat, clng],
        zoom: zoom,
        zoomControl: false,
        attributionControl: true
      });
      window.L.control.zoom({ position: "bottomright" }).addTo(this.leafletMap);

      this.leafletMap.on("mousemove", (e) => {
        if (cursorCb) {
          cursorCb(e.latlng.lat.toFixed(6), e.latlng.lng.toFixed(6));
        }
      });

      this.setLayer(config.map?.default_layer || "dark_atc");
      this.syncGeofenceOverlays(config);
    } else {
      // 无外网 CDN 时自动启用离线极坐标空管雷达模式
      this.setLayer("polar_radar");
    }

    // 雷达扫描动画（用于离线极坐标模式）
    const animateRadar = () => {
      this.radarSweepDeg = (this.radarSweepDeg + 1.4) % 360;
      if (this.layerMode === "polar_radar") {
        this._renderPolarRadar();
      }
      requestAnimationFrame(animateRadar);
    };
    requestAnimationFrame(animateRadar);
  }

  setLayer(mode, googleKey = "") {
    if (googleKey !== undefined) this.googleApiKey = googleKey;
    this.layerMode = mode;

    const mapEl = document.getElementById(this.mapContainerId);
    if (mode === "polar_radar" || !window.L || !this.leafletMap) {
      this.layerMode = "polar_radar";
      if (mapEl) mapEl.style.visibility = "hidden";
      if (this.polarCanvas) {
        this.polarCanvas.style.display = "block";
        this._renderPolarRadar();
      }
      return;
    }

    if (mapEl) mapEl.style.visibility = "visible";
    if (this.polarCanvas) this.polarCanvas.style.display = "none";

    if (this.tileLayer) {
      this.leafletMap.removeLayer(this.tileLayer);
    }

    let url = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
    let attr = "&copy; OpenStreetMap &copy; CARTO | WGS-84";

    if (mode === "satellite") {
      url = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
      attr = "Tiles &copy; Esri World Imagery | WGS-84";
    } else if (mode === "osm") {
      url = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
      attr = "&copy; OpenStreetMap contributors | WGS-84";
    } else if (mode === "google_hybrid") {
      const keyParam = this.googleApiKey ? `&key=${encodeURIComponent(this.googleApiKey)}` : "";
      url = `https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}${keyParam}`;
      attr = "Map data &copy; Google Satellite Hybrid | WGS-84";
    }

    this.tileLayer = window.L.tileLayer(url, {
      maxZoom: 19,
      attribution: attr
    });

    // 若瓦片网络不可达，提示或允许切离线雷达
    this.tileLayer.addTo(this.leafletMap);
    setTimeout(() => this.leafletMap.invalidateSize(), 80);
  }

  recenter() {
    if (!this.lastConfig) return;
    const { center_lat = 13.7267, center_lng = 100.5105, default_zoom = 15 } = this.lastConfig.site || {};
    if (this.leafletMap && this.layerMode !== "polar_radar") {
      this.leafletMap.flyTo([center_lat, center_lng], default_zoom, { duration: 0.6 });
    }
  }

  focusCoordinates(lat, lng, zoom = 16) {
    if (this.leafletMap && this.layerMode !== "polar_radar" && lat && lng) {
      this.leafletMap.flyTo([lat, lng], zoom, { duration: 0.6 });
    }
  }

  syncGeofenceOverlays(config) {
    this.lastConfig = config;
    if (!window.L || !this.leafletMap) return;

    const site = config.site || {};
    const gf = config.geofence || {};
    const clat = site.center_lat || 13.7267;
    const clng = site.center_lng || 100.5105;
    const innerR = gf.inner_nfz_radius_m || 450;
    const outerR = gf.outer_warn_radius_m || 1200;

    if (this.centerMarker) this.leafletMap.removeLayer(this.centerMarker);
    if (this.innerCircle) this.leafletMap.removeLayer(this.innerCircle);
    if (this.outerCircle) this.leafletMap.removeLayer(this.outerCircle);
    if (this.showBoxPoly) this.leafletMap.removeLayer(this.showBoxPoly);

    // 外圈预警区 (Amber)
    this.outerCircle = window.L.circle([clat, clng], {
      radius: outerR,
      color: "#f59e0b",
      weight: 1.5,
      dashArray: "6, 6",
      fillColor: "#f59e0b",
      fillOpacity: 0.04,
      interactive: false
    }).addTo(this.leafletMap);

    // 内圈核心禁飞区 (Crimson)
    this.innerCircle = window.L.circle([clat, clng], {
      radius: innerR,
      color: "#ef4444",
      weight: 1.8,
      dashArray: "4, 4",
      fillColor: "#ef4444",
      fillOpacity: 0.09,
      interactive: false
    }).addTo(this.leafletMap);

    // 湄南河集群表演空域盒 (仅在集群护航模式下渲染)
    const box = gf.show_formation_box;
    if (box && box.enabled && site.operating_mode === "show_escort" && box.polygon) {
      this.showBoxPoly = window.L.polygon(box.polygon, {
        color: "#10b981",
        weight: 1.8,
        fillColor: "#10b981",
        fillOpacity: 0.14,
        interactive: false
      }).addTo(this.leafletMap);
    }

    // ICONSIAM 塔台指挥中心锚点
    const stationHtml = `
      <div class="atc-station-pin" title="ICONSIAM Command Center">
        <span class="station-dot"></span>
      </div>`;
    this.centerMarker = window.L.marker([clat, clng], {
      icon: window.L.divIcon({
        className: "atc-div-icon",
        html: stationHtml,
        iconSize: [22, 22],
        iconAnchor: [11, 11]
      })
    }).addTo(this.leafletMap);
  }

  _colorForTarget(t) {
    if (t.whitelist_status === "WHITELIST") return "#10b981";
    if (t.category === "MANNED" && t.threat_level === "NORMAL") return "#38bdf8";
    if (t.threat_level === "CRITICAL") return "#ef4444";
    if (t.threat_level === "CAUTION") return "#f59e0b";
    return "#94a3b8";
  }

  _buildTargetIconHtml(t, isSelected) {
    const color = this._colorForTarget(t);
    const pulseCls = t.threat_level === "CRITICAL" ? "critical-pulse" : "";
    const selCls = isSelected ? "selected-ring" : "";
    const rot = t.heading_deg || 0;

    // 区分有人直升机与四旋翼无人机矢量符号
    const svgShape =
      t.category === "MANNED"
        ? `<svg viewBox="0 0 24 24" width="22" height="22" style="transform:rotate(${rot}deg)">
             <path fill="${color}" d="M12 2L14.5 9H21L15.5 13.5L17.5 21L12 16.8L6.5 21L8.5 13.5L3 9H9.5L12 2Z"/>
           </svg>`
        : `<svg viewBox="0 0 24 24" width="22" height="22" style="transform:rotate(${rot}deg)">
             <path fill="${color}" stroke="#0b0e13" stroke-width="1" d="M12 3l4.5 15-4.5-3.2L7.5 18 12 3z"/>
           </svg>`;

    return `
      <div class="atc-target-marker ${pulseCls} ${selCls}">
        ${svgShape}
        <div class="atc-target-tag" style="border-color:${color}">
          <span>${t.model.split(" ")[0]}</span>
          <em>${Math.round(t.alt_m)}m</em>
        </div>
      </div>`;
  }

  updateTargets(targets, selectedId) {
    this.lastTargets = targets || [];
    this.selectedTargetId = selectedId;

    if (!window.L || !this.leafletMap) return;

    const activeIds = new Set();

    for (const t of this.lastTargets) {
      activeIds.add(t.target_id);
      const color = this._colorForTarget(t);
      const isSel = t.target_id === selectedId;

      // 1. 无人机 / 航空器本体标牌
      const icon = window.L.divIcon({
        className: "atc-div-icon",
        html: this._buildTargetIconHtml(t, isSel),
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      if (this.targetMarkers.has(t.target_id)) {
        const mk = this.targetMarkers.get(t.target_id);
        mk.setLatLng([t.lat, t.lng]);
        mk.setIcon(icon);
      } else {
        const mk = window.L.marker([t.lat, t.lng], { icon }).addTo(this.leafletMap);
        mk.on("click", () => {
          if (this.onSelectTarget) this.onSelectTarget(t.target_id);
        });
        this.targetMarkers.set(t.target_id, mk);
      }

      // 2. 历史尾迹线
      if (t.trail && t.trail.length > 1) {
        if (this.trailLines.has(t.target_id)) {
          const line = this.trailLines.get(t.target_id);
          line.setLatLngs(t.trail);
          line.setStyle({ color });
        } else {
          const line = window.L.polyline(t.trail, {
            color,
            weight: 2,
            opacity: 0.65
          }).addTo(this.leafletMap);
          this.trailLines.set(t.target_id, line);
        }
      }

      // 3. 飞手（遥控器）定位标牌与关联虚线
      if (t.pilot_lat && t.pilot_lng && t.whitelist_status !== "WHITELIST") {
        const pHtml = `<div class="atc-pilot-pin" title="Pilot Location (${t.pilot_lat}, ${t.pilot_lng})">RC</div>`;
        const pIcon = window.L.divIcon({
          className: "atc-div-icon",
          html: pHtml,
          iconSize: [22, 22],
          iconAnchor: [11, 11]
        });

        if (this.pilotMarkers.has(t.target_id)) {
          this.pilotMarkers.get(t.target_id).setLatLng([t.pilot_lat, t.pilot_lng]);
        } else {
          const pmk = window.L.marker([t.pilot_lat, t.pilot_lng], { icon: pIcon }).addTo(this.leafletMap);
          this.pilotMarkers.set(t.target_id, pmk);
        }

        const tetherCoords = [
          [t.lat, t.lng],
          [t.pilot_lat, t.pilot_lng]
        ];
        if (this.tetherLines.has(t.target_id)) {
          this.tetherLines.get(t.target_id).setLatLngs(tetherCoords);
        } else {
          const tl = window.L.polyline(tetherCoords, {
            color: "#a855f7",
            weight: 1.5,
            dashArray: "4, 5",
            opacity: 0.85
          }).addTo(this.leafletMap);
          this.tetherLines.set(t.target_id, tl);
        }
      } else {
        if (this.pilotMarkers.has(t.target_id)) {
          this.leafletMap.removeLayer(this.pilotMarkers.get(t.target_id));
          this.pilotMarkers.delete(t.target_id);
        }
        if (this.tetherLines.has(t.target_id)) {
          this.leafletMap.removeLayer(this.tetherLines.get(t.target_id));
          this.tetherLines.delete(t.target_id);
        }
      }
    }

    // 清理消失的目标图层
    for (const [id, mk] of this.targetMarkers.entries()) {
      if (!activeIds.has(id)) {
        this.leafletMap.removeLayer(mk);
        this.targetMarkers.delete(id);
      }
    }
    for (const [id, ln] of this.trailLines.entries()) {
      if (!activeIds.has(id)) {
        this.leafletMap.removeLayer(ln);
        this.trailLines.delete(id);
      }
    }
    for (const [id, pmk] of this.pilotMarkers.entries()) {
      if (!activeIds.has(id)) {
        this.leafletMap.removeLayer(pmk);
        this.pilotMarkers.delete(id);
      }
    }
    for (const [id, tl] of this.tetherLines.entries()) {
      if (!activeIds.has(id)) {
        this.leafletMap.removeLayer(tl);
        this.tetherLines.delete(id);
      }
    }
  }

  resize() {
    if (this.leafletMap && this.layerMode !== "polar_radar") {
      setTimeout(() => this.leafletMap.invalidateSize(), 60);
    }
  }

  // 100% 离线可用的极坐标空管雷达态势图（断网演出场地自动保底）
  _renderPolarRadar() {
    const canvas = this.polarCanvas;
    if (!canvas || !this.lastConfig) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 20) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.floor(rect.width * dpr) || canvas.height !== Math.floor(rect.height * dpr)) {
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
    }

    const ctx = canvas.getContext("2d");
    ctx.save();
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;
    const cx = w / 2;
    const cy = h / 2;
    const maxRadiusPx = Math.min(w, h) * 0.44;
    const maxRangeM = 2000.0; // 雷达盘满量程 2.0 km

    ctx.fillStyle = "#0b0f16";
    ctx.fillRect(0, 0, w, h);

    const site = this.lastConfig.site || {};
    const gf = this.lastConfig.geofence || {};
    const clat = site.center_lat || 13.7267;
    const clng = site.center_lng || 100.5105;

    const latLngToXY = (lat, lng) => {
      const dyM = (lat - clat) * 111320;
      const dxM = (lng - clng) * 111320 * Math.cos((clat * Math.PI) / 180);
      return {
        x: cx + (dxM / maxRangeM) * maxRadiusPx,
        y: cy - (dyM / maxRangeM) * maxRadiusPx
      };
    };

    // 绘制方位十字与角度刻度
    ctx.strokeStyle = "rgba(148, 163, 184, 0.13)";
    ctx.lineWidth = 1;
    for (let deg = 0; deg < 360; deg += 30) {
      const rad = ((deg - 90) * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(rad) * maxRadiusPx, cy + Math.sin(rad) * maxRadiusPx);
      ctx.stroke();

      ctx.fillStyle = "#64748b";
      ctx.font = "10px 'SF Mono', Menlo, monospace";
      const lx = cx + Math.cos(rad) * (maxRadiusPx + 16) - 10;
      const ly = cy + Math.sin(rad) * (maxRadiusPx + 16) + 4;
      ctx.fillText(`${String(deg).padStart(3, "0")}°`, lx, ly);
    }

    // 常规距离环 (500m, 1000m, 1500m, 2000m)
    [500, 1000, 1500, 2000].forEach((rm) => {
      const rPx = (rm / maxRangeM) * maxRadiusPx;
      ctx.beginPath();
      ctx.arc(cx, cy, rPx, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(148, 163, 184, 0.16)";
      ctx.stroke();
      ctx.fillStyle = "#475569";
      ctx.fillText(`${rm}m`, cx + 4, cy - rPx + 11);
    });

    // 外圈预警环 & 内圈禁飞环
    const outerPx = ((gf.outer_warn_radius_m || 1200) / maxRangeM) * maxRadiusPx;
    const innerPx = ((gf.inner_nfz_radius_m || 450) / maxRangeM) * maxRadiusPx;

    ctx.save();
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, outerPx, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "#ef4444";
    ctx.fillStyle = "rgba(239, 68, 68, 0.08)";
    ctx.beginPath();
    ctx.arc(cx, cy, innerPx, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // 雷达微弱扫描余晖扇形
    const sweepRad = ((this.radarSweepDeg - 90) * Math.PI) / 180;
    const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, maxRadiusPx);
    grad.addColorStop(0, "rgba(56, 189, 248, 0.14)");
    grad.addColorStop(1, "rgba(56, 189, 248, 0.02)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, maxRadiusPx, sweepRad - 0.38, sweepRad);
    ctx.closePath();
    ctx.fill();

    // 绘制所有目标及飞手连线
    for (const t of this.lastTargets) {
      const pos = latLngToXY(t.lat, t.lng);
      const color = this._colorForTarget(t);

      if (t.pilot_lat && t.pilot_lng && t.whitelist_status !== "WHITELIST") {
        const pPos = latLngToXY(t.pilot_lat, t.pilot_lng);
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = "#a855f7";
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        ctx.lineTo(pPos.x, pPos.y);
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = "#a855f7";
        ctx.fillRect(pPos.x - 4, pPos.y - 4, 8, 8);
        ctx.fillStyle = "#cbd5e1";
        ctx.font = "10px monospace";
        ctx.fillText("RC", pPos.x + 6, pPos.y + 3);
      }

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#e2e8f0";
      ctx.font = "11px 'SF Mono', Menlo, monospace";
      ctx.fillText(`${t.model.split(" ")[0]} [${Math.round(t.alt_m)}m]`, pos.x + 9, pos.y - 4);
    }

    // 中心点十字
    ctx.fillStyle = "#38bdf8";
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}
