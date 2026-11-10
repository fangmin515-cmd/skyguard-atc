import { I18N } from "./i18n.js";
import { AirspaceMapController } from "./map-controller.js";
import { SpectrumWaterfallView } from "./spectrum-view.js";
import { BrowserAutonomousEngine, VENUE_PRESETS } from "./browser-engine.js";

class SkyGuardApp {
  constructor() {
    this.lang = "zh";
    this.config = null;
    this.state = null;
    this.events = [];
    this.trackFilter = "ALL";
    this.selectedTargetId = null;
    this.audioEnabled = true;
    this.audioCtx = null;
    this.lastChimeTs = 0;

    // 双模引擎标识：检测到本地网关则走硬件/SSE，部署在 GitHub Pages 则自动启用浏览器独立引擎
    this.useBrowserEngine = false;
    this.browserEngine = null;

    this.mapCtrl = new AirspaceMapController(
      "airspace-map",
      "polar-radar-canvas",
      (tid) => {
        this.selectedTargetId = tid;
        this.renderTracks();
      }
    );
    this.spectrumView = new SpectrumWaterfallView("fft-canvas", "waterfall-canvas");
  }

  t(key) {
    return (I18N[this.lang] && I18N[this.lang][key]) || I18N.zh[key] || key;
  }

  async _probeBackend() {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 1200);
      const resp = await fetch("./api/config", { signal: ctrl.signal });
      clearTimeout(timer);
      if (resp.ok) {
        const ct = resp.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
          return await resp.json();
        }
      }
    } catch (_) {}
    return null;
  }

  async boot() {
    this._bindEvents();
    this._startClock();

    const backendCfg = await this._probeBackend();
    if (backendCfg) {
      this.useBrowserEngine = false;
      this.config = backendCfg;
    } else {
      // GitHub Pages / 纯静态托管模式：自动激活浏览器独立全功能引擎
      this.useBrowserEngine = true;
      this.browserEngine = new BrowserAutonomousEngine();
      this.config = this.browserEngine.getConfig();
    }

    this.lang = this.config.site?.default_lang || "zh";
    this.audioEnabled = this.config.notifications?.audio_alert !== false;

    this.applyLanguage(this.lang);
    this.mapCtrl.init(this.config, (lat, lng) => {
      document.getElementById("cursor-coords").textContent = `WGS-84: ${lat}, ${lng}`;
    });

    if (this.useBrowserEngine) {
      const runBrowserTick = () => {
        // 当标签页在后台隐藏时跳过重绘，保持电脑零发热、零风扇噪音
        if (document.hidden) return;
        const frame = this.browserEngine.tick();
        this.handleTelemetryFrame(frame);
        this.events = this.browserEngine.getEvents(30);
        this.renderEventsTable();
      };
      runBrowserTick();
      setInterval(runBrowserTick, 1000);
    } else {
      const stateResp = await fetch("./api/state");
      this.handleTelemetryFrame(await stateResp.json());
      await this.refreshEvents();
      this._connectStream();
      setInterval(() => this.refreshEvents(), 4000);
    }
  }

  _connectStream() {
    if (this.useBrowserEngine) return;
    const es = new EventSource("./api/stream");
    es.onmessage = (ev) => {
      try {
        const frame = JSON.parse(ev.data);
        this.handleTelemetryFrame(frame);
      } catch (_) {}
    };
    es.onerror = () => {
      es.close();
      setTimeout(() => this._connectStream(), 2500);
    };
  }

  _startClock() {
    const tick = () => {
      const now = new Date();
      const bkk = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Bangkok",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      }).format(now);
      document.getElementById("bkk-clock").textContent = `BKK ${bkk} (UTC+7)`;
    };
    tick();
    setInterval(tick, 1000);
  }

  _playAtcChime(level) {
    if (!this.audioEnabled) return;
    const now = Date.now();
    if (now - this.lastChimeTs < 8000) return;
    this.lastChimeTs = now;

    try {
      if (!this.audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.audioCtx = new AudioContext();
      }
      if (this.audioCtx.state === "suspended") return;

      const freqs = level === "CRITICAL" ? [880, 660, 880] : [587, 740];
      freqs.forEach((f, idx) => {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.value = f;
        gain.gain.setValueAtTime(0.08, this.audioCtx.currentTime + idx * 0.14);
        gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + idx * 0.14 + 0.12);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(this.audioCtx.currentTime + idx * 0.14);
        osc.stop(this.audioCtx.currentTime + idx * 0.14 + 0.13);
      });
    } catch (_) {}
  }

  applyLanguage(lang) {
    this.lang = lang;
    document.querySelectorAll(".lang-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.lang === lang);
    });
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const k = el.getAttribute("data-i18n");
      el.textContent = this.t(k);
    });
    document.getElementById("btn-audio-toggle").textContent = this.audioEnabled
      ? this.t("soundOn")
      : this.t("soundOff");

    this._syncDynamicLegends();
    if (this.state) this.handleTelemetryFrame(this.state);
    this.renderEventsTable();
  }

  _syncDynamicLegends() {
    if (!this.config) return;
    const ir = this.config.geofence?.inner_nfz_radius_m || 450;
    const or = this.config.geofence?.outer_warn_radius_m || 1200;
    const clat = Number(this.config.site?.center_lat || 13.7267).toFixed(4);
    const clng = Number(this.config.site?.center_lng || 100.5105).toFixed(4);
    const coordsEl = document.getElementById("site-coords-label");
    if (coordsEl) coordsEl.textContent = `${clat}°N ${clng}°E`;

    const venueSel = document.getElementById("venue-preset-select");
    if (venueSel && this.config.site?.preset_id) {
      venueSel.value = this.config.site.preset_id;
    }

    const hasCustomPoly =
      Array.isArray(this.config.geofence?.custom_nfz_polygon) &&
      this.config.geofence.custom_nfz_polygon.length >= 3;
    const lgCustom = document.getElementById("row-legend-custom-nfz");
    if (lgCustom) lgCustom.style.display = hasCustomPoly ? "flex" : "none";
    const clearBtn = document.getElementById("btn-clear-nfz");
    if (clearBtn && !this.mapCtrl.isDrawingNfz) {
      clearBtn.style.display = hasCustomPoly ? "inline-block" : "none";
    }

    document.getElementById("lbl-legend-inner").textContent =
      this.lang === "th"
        ? `เขตห้ามบินชั้นใน (${ir} ม.)`
        : this.lang === "en"
        ? `Core NFZ (${ir}m)`
        : `核心禁飞区 (${ir}m)`;
    document.getElementById("lbl-legend-outer").textContent =
      this.lang === "th"
        ? `เขตเฝ้าระวังชั้นนอก (${or} ม.)`
        : this.lang === "en"
        ? `Warning Zone (${or}m)`
        : `外圈预警区 (${or}m)`;
  }

  async _updateConfig(patch) {
    if (this.useBrowserEngine) {
      this.config = this.browserEngine.updateConfig(patch);
      this._syncDynamicLegends();
      this.mapCtrl.syncGeofenceOverlays(this.config);
      this.handleTelemetryFrame(this.browserEngine.tick());
      return;
    }
    const resp = await fetch("./api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    });
    const res = await resp.json();
    if (res.config) {
      this.config = res.config;
      this._syncDynamicLegends();
      this.mapCtrl.syncGeofenceOverlays(this.config);
    }
  }

  handleTelemetryFrame(frame) {
    this.state = frame;
    const caps = frame.capabilities || {};
    const opMode = this.config?.site?.operating_mode || "show_escort";

    // 1. 顶部模式徽章与快速剧本下拉框同步
    const modeBadge = document.getElementById("run-mode-badge");
    const quickScen = document.getElementById("quick-scenario-select");
    if (caps.simulator_enabled) {
      modeBadge.className = "mode-badge sandbox";
      modeBadge.textContent = this.t("modeSandbox");
      quickScen.style.display = "inline-block";
      if (caps.scenario) quickScen.value = caps.scenario;
    } else {
      modeBadge.className = "mode-badge live";
      modeBadge.textContent = this.t("modeLive");
      quickScen.style.display = "none";
    }

    document.getElementById("btn-mode-show").classList.toggle("active", opMode === "show_escort");
    document.getElementById("btn-mode-venue").classList.toggle("active", opMode !== "show_escort");
    document.getElementById("sec-show-readiness").style.display = opMode === "show_escort" ? "flex" : "none";
    document.getElementById("row-legend-showbox").style.display = opMode === "show_escort" ? "flex" : "none";

    // 2. 全空域最高威胁状态灯 + 告警提示音
    const pill = document.getElementById("overall-status-pill");
    const pillTxt = document.getElementById("overall-status-text");
    const lvl = (frame.overall_alert || "NORMAL").toLowerCase();
    pill.className = `airspace-banner ${lvl}`;
    pillTxt.textContent =
      frame.overall_alert === "CRITICAL"
        ? this.t("statusCritical")
        : frame.overall_alert === "CAUTION"
        ? this.t("statusCaution")
        : this.t("statusNormal");

    if (frame.overall_alert === "CRITICAL") {
      this._playAtcChime("CRITICAL");
    }

    // 3. 能力驱动界面（Capability-Driven UI）：未启用的硬件模块自动隐藏
    document.getElementById("tab-filter-uav").style.display = caps.has_rid ? "inline-block" : "none";
    document.getElementById("tab-filter-manned").style.display = caps.has_adsb ? "inline-block" : "none";

    const rfPanel = document.getElementById("sec-rf-panel");
    const wxPanel = document.getElementById("sec-wx-panel");
    const rightCol = document.getElementById("right-sensor-col");
    const workspace = document.getElementById("atc-workspace");

    rfPanel.style.display = caps.has_spectrum ? "flex" : "none";
    wxPanel.style.display = caps.has_weather ? "flex" : "none";

    const showRight = caps.has_spectrum || caps.has_weather;
    const prevHidden = workspace.classList.contains("no-right-col");
    rightCol.style.display = showRight ? "flex" : "none";
    workspace.classList.toggle("no-right-col", !showRight);
    if (prevHidden !== !showRight) {
      this.mapCtrl.resize();
    }

    // 4. 渲染集群表演安全放行门限
    this._renderReadiness(frame.show_readiness);

    // 5. 渲染航迹卡片与地图动态目标
    this.renderTracks();
    this.mapCtrl.updateTargets(frame.targets || [], this.selectedTargetId);

    // 6. 渲染右侧 SDR 瀑布图与暗飞能量告警
    if (caps.has_spectrum && frame.spectrum) {
      this.spectrumView.render(frame.spectrum);
      document.getElementById("rf-congestion-val").textContent = `${frame.spectrum.channel_congestion_pct}%`;
      const nf =
        this.spectrumView.band === "58g"
          ? frame.spectrum.noise_floor_58g_dbm
          : frame.spectrum.noise_floor_24g_dbm;
      document.getElementById("rf-noise-val").textContent = `${nf} dBm`;
      this._renderRfAlerts(frame.rf_alerts || []);
    }

    // 7. 渲染五要素气象站
    if (caps.has_weather && frame.weather) {
      this._renderWeather(frame.weather);
    }
  }

  _renderReadiness(r) {
    if (!r) return;
    const vEl = document.getElementById("readiness-verdict");
    vEl.className = `readiness-verdict ${r.verdict}`;
    vEl.textContent =
      r.verdict === "GO"
        ? this.t("verdictGo")
        : r.verdict === "CAUTION"
        ? this.t("verdictCaution")
        : this.t("verdictHold");

    const setChk = (id, ok) => {
      const el = document.getElementById(id);
      el.className = `chk-item ${ok ? "ok" : "bad"}`;
      el.querySelector(".st").textContent = ok ? this.t("pass") : this.t("warn");
    };
    setChk("chk-uav", r.uav_airspace_clear);
    setChk("chk-manned", r.manned_aircraft_clear);
    setChk("chk-rf", r.rf_spectrum_clean);
    setChk("chk-wind", r.weather_wind_safe);
  }

  renderTracks() {
    const container = document.getElementById("tracks-container");
    if (!this.state) return;
    const caps = this.state.capabilities || {};
    const all = this.state.targets || [];
    const filtered = all.filter((t) => this.trackFilter === "ALL" || t.category === this.trackFilter);

    document.getElementById("track-count").textContent = String(filtered.length);

    if (!caps.has_rid && !caps.has_adsb) {
      container.innerHTML = `<div class="empty-box">${this.t("noSensorHint")}</div>`;
      return;
    }
    if (filtered.length === 0) {
      container.innerHTML = `<div class="empty-box">${this.t("noTracks")}</div>`;
      return;
    }

    container.innerHTML = filtered
      .map((t) => {
        const isWL = t.whitelist_status === "WHITELIST";
        const isManned = t.category === "MANNED";
        let cardCls = `track-card level-${t.threat_level}`;
        if (isWL) cardCls = "track-card whitelist";
        else if (isManned && t.threat_level === "NORMAL") cardCls = "track-card manned";
        if (t.target_id === this.selectedTargetId) cardCls += " selected";

        let badgeCls = "norm";
        let badgeTxt = this.t("badgeNormal");
        if (isWL) {
          badgeCls = "wl";
          badgeTxt = this.t("badgeWhitelist");
        } else if (t.threat_level === "CRITICAL") {
          badgeCls = "crit";
          badgeTxt =
            t.zone_status === "CUSTOM_NFZ" ? this.t("badgeCustomNfz") : this.t("badgeCritical");
        } else if (t.threat_level === "CAUTION") {
          badgeCls = "warn";
          badgeTxt =
            t.whitelist_status === "BLACKLIST" ? this.t("badgeBlacklist") : this.t("badgeCaution");
        } else if (isManned) {
          badgeCls = "sky";
          badgeTxt = this.t("badgeManned");
        }

        const wlBtnText = isWL ? this.t("btnUnwhitelist") : this.t("btnWhitelist");
        const wlNext = isWL ? "clear" : "whitelist";

        return `
          <div class="${cardCls}" data-tid="${t.target_id}">
            <div class="tc-top">
              <span class="tc-model">${t.model}</span>
              <span class="tc-badge ${badgeCls}">${badgeTxt}</span>
            </div>
            <div class="tc-sn">${t.source} · ${t.serial_no} ${t.freq_mhz ? `· ${t.freq_mhz}MHz` : ""}</div>
            <div class="tc-metrics">
              <div class="tc-m"><span>${this.t("lblRng")}</span><strong>${Math.round(t.distance_to_center_m)}m</strong></div>
              <div class="tc-m"><span>${this.t("lblBrg")}</span><strong>${String(Math.round(t.bearing_from_center_deg)).padStart(3, "0")}°</strong></div>
              <div class="tc-m"><span>${this.t("lblAlt")}</span><strong>${Math.round(t.alt_m)}m</strong></div>
              <div class="tc-m"><span>${this.t("lblSpd")}</span><strong>${t.speed_ms.toFixed(1)}m/s</strong></div>
            </div>
            <div class="tc-actions">
              <button class="mini-btn act-focus" data-lat="${t.lat}" data-lng="${t.lng}">${this.t("btnFocus")}</button>
              ${
                !isWL && t.category === "UAV"
                  ? `<button class="mini-btn dispatch act-dispatch" data-tid="${t.target_id}">${this.t("btnDispatch")}</button>`
                  : ""
              }
              ${
                t.category === "UAV"
                  ? `<button class="mini-btn act-wl" data-sn="${t.serial_no}" data-op="${wlNext}">${wlBtnText}</button>`
                  : ""
              }
            </div>
          </div>
        `;
      })
      .join("");

    container.querySelectorAll(".track-card").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        this.selectedTargetId = card.dataset.tid;
        const found = all.find((x) => x.target_id === this.selectedTargetId);
        if (found) this.mapCtrl.focusCoordinates(found.lat, found.lng, 16);
        this.renderTracks();
      });
    });

    container.querySelectorAll(".act-focus").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.mapCtrl.focusCoordinates(parseFloat(btn.dataset.lat), parseFloat(btn.dataset.lng), 16);
      });
    });

    container.querySelectorAll(".act-wl").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (this.useBrowserEngine) {
          this.config = this.browserEngine.toggleList(btn.dataset.sn, btn.dataset.op);
          this.handleTelemetryFrame(this.browserEngine.tick());
        } else {
          await fetch("./api/list/toggle", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ serial_no: btn.dataset.sn, list_type: btn.dataset.op })
          });
        }
      });
    });

    container.querySelectorAll(".act-dispatch").forEach((btn) => {
      btn.addEventListener("click", () => {
        const found = all.find((x) => x.target_id === btn.dataset.tid);
        if (found) this.openDispatchModal(found);
      });
    });
  }

  _renderRfAlerts(alerts) {
    const box = document.getElementById("rf-alerts-box");
    if (!alerts || alerts.length === 0) {
      box.innerHTML = `<div class="rf-quiet-box">${this.t("rfNoAlert")}</div>`;
      return;
    }
    box.innerHTML = alerts
      .map(
        (a) => `
      <div class="rf-alert-card ${a.threat_level}">
        <strong>⚠ ${this.t("rfDarkAlertTitle")}</strong>
        <div style="font-family:var(--font-mono); color:var(--text-primary);">
          ${a.band} · ${a.center_freq_mhz} MHz (${a.peak_dbm} dBm) · ${this.t("rfEstRange")}: ${a.est_distance_band}
        </div>
      </div>`
      )
      .join("");
  }

  _renderWeather(wx) {
    const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const dStr = dirs[Math.round(wx.wind_dir_deg / 45) % 8];
    document.getElementById("wx-wind").textContent = `${wx.wind_speed_ms.toFixed(1)} m/s`;
    document.getElementById("wx-gust").textContent = `${wx.wind_gust_ms.toFixed(1)} m/s`;
    document.getElementById("wx-dir").textContent = `${Math.round(wx.wind_dir_deg)}° (${dStr})`;
    document.getElementById("wx-temp").textContent = `${wx.temp_c.toFixed(1)} °C`;
    document.getElementById("wx-hum").textContent = `${wx.humidity_pct.toFixed(1)} %`;
    document.getElementById("wx-pres").textContent = `${wx.pressure_hpa.toFixed(1)} hPa`;

    const badge = document.getElementById("wx-safety-badge");
    if (wx.flight_safety === "HOLD") {
      badge.className = "readiness-verdict HOLD";
      badge.textContent = this.t("wxHold");
    } else if (wx.flight_safety === "CAUTION") {
      badge.className = "readiness-verdict CAUTION";
      badge.textContent = this.t("wxCaution");
    } else {
      badge.className = "readiness-verdict GO";
      badge.textContent = this.t("wxSafe");
    }
  }

  async refreshEvents() {
    if (this.useBrowserEngine) {
      this.events = this.browserEngine.getEvents(30);
      this.renderEventsTable();
      return;
    }
    try {
      const resp = await fetch("./api/events?limit=30");
      const data = await resp.json();
      this.events = data.events || [];
      this.renderEventsTable();
    } catch (_) {}
  }

  renderEventsTable() {
    const tbody = document.getElementById("events-tbody");
    if (!this.events.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:16px;">${this.t("emptyLogs")}</td></tr>`;
      return;
    }

    tbody.innerHTML = this.events
      .map((ev) => {
        const cls = ev.severity === "CRITICAL" ? "crit" : "warn";
        return `
        <tr>
          <td style="font-family:var(--font-mono);">${ev.time_ict}</td>
          <td><span class="tc-badge ${cls}">${ev.severity}</span></td>
          <td style="font-family:var(--font-mono);">${ev.source}</td>
          <td style="color:var(--text-primary); font-weight:500;">${ev.model || "-"} <span style="color:var(--text-muted); font-family:var(--font-mono);">(${ev.serial_no || "-"})</span></td>
          <td>${ev.summary}</td>
          <td>
            ${
              ev.lat && ev.lng
                ? `<button class="mini-btn dispatch ev-dispatch-btn" data-id="${ev.id}">${this.t("btnLinePreview")}</button>`
                : "-"
            }
          </td>
        </tr>`;
      })
      .join("");

    tbody.querySelectorAll(".ev-dispatch-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const ev = this.events.find((x) => String(x.id) === btn.dataset.id);
        if (ev) {
          this.openDispatchModal({
            severity: ev.severity,
            model: ev.model,
            serial_no: ev.serial_no,
            distance_to_center_m: ev.distance_m,
            alt_m: ev.alt_m,
            lat: ev.lat,
            lng: ev.lng,
            pilot_lat: ev.pilot_lat || null,
            pilot_lng: ev.pilot_lng || null
          });
        }
      });
    });
  }

  async openDispatchModal(target) {
    if (target.pilot_lat && target.pilot_lng) {
      this.mapCtrl.focusCoordinates(target.pilot_lat, target.pilot_lng, 16);
    }

    let previewText = "";
    if (this.useBrowserEngine) {
      previewText = this.browserEngine.formatDispatchMessage({
        lang: this.lang,
        severity: target.threat_level || target.severity || "CRITICAL",
        model: target.model,
        serial_no: target.serial_no,
        distance_m: target.distance_to_center_m || target.distance_m || 0,
        alt_m: target.alt_m || 0,
        lat: target.lat,
        lng: target.lng,
        pilot_lat: target.pilot_lat,
        pilot_lng: target.pilot_lng
      });
    } else {
      const resp = await fetch("./api/notify/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lang: this.lang,
          severity: target.threat_level || target.severity || "CRITICAL",
          model: target.model,
          serial_no: target.serial_no,
          distance_m: target.distance_to_center_m || target.distance_m || 0,
          alt_m: target.alt_m || 0,
          lat: target.lat,
          lng: target.lng,
          pilot_lat: target.pilot_lat,
          pilot_lng: target.pilot_lng
        })
      });
      const data = await resp.json();
      previewText = data.preview || "";
    }

    document.getElementById("dispatch-preview-text").textContent = previewText;
    document.getElementById("copy-toast").style.display = "none";
    document.getElementById("dispatch-modal").classList.add("open");
  }

  _bindEvents() {
    document.querySelectorAll(".lang-btn").forEach((btn) => {
      btn.addEventListener("click", () => this.applyLanguage(btn.dataset.lang));
    });

    document.getElementById("btn-mode-show").addEventListener("click", () =>
      this._updateConfig({ site: { operating_mode: "show_escort" } })
    );
    document.getElementById("btn-mode-venue").addEventListener("click", () =>
      this._updateConfig({ site: { operating_mode: "venue_guard" } })
    );

    // 顶部场地快速切换下拉框
    document.getElementById("venue-preset-select").addEventListener("change", async (e) => {
      const preset = VENUE_PRESETS[e.target.value];
      if (!preset) return;
      await this._updateConfig({
        site: {
          preset_id: preset.preset_id,
          name: preset.name,
          city: preset.city,
          center_lat: preset.center_lat,
          center_lng: preset.center_lng
        },
        geofence: {
          inner_nfz_radius_m: preset.inner_nfz_radius_m,
          outer_warn_radius_m: preset.outer_warn_radius_m,
          custom_nfz_polygon: [],
          show_formation_box: {
            enabled: true,
            polygon: preset.show_box
          }
        }
      });
      this.mapCtrl.recenter();
    });

    // 鼠标在地图上直接点击手绘自定义多边形禁飞区
    const btnDraw = document.getElementById("btn-draw-nfz");
    const btnFinish = document.getElementById("btn-finish-nfz");
    const btnCancel = document.getElementById("btn-cancel-nfz");
    const btnClear = document.getElementById("btn-clear-nfz");
    const hintBanner = document.getElementById("draw-hint-banner");

    const exitDrawUi = () => {
      btnDraw.style.display = "inline-block";
      btnFinish.style.display = "none";
      btnCancel.style.display = "none";
      hintBanner.style.display = "none";
      this._syncDynamicLegends();
    };

    btnDraw.addEventListener("click", () => {
      btnDraw.style.display = "none";
      btnClear.style.display = "none";
      btnFinish.style.display = "inline-block";
      btnFinish.textContent = `${this.t("btnFinishNfz")} (0)`;
      btnCancel.style.display = "inline-block";
      hintBanner.style.display = "block";

      this.mapCtrl.startDrawingCustomNfz((count) => {
        btnFinish.textContent = `${this.t("btnFinishNfz")} (${count})`;
      });
    });

    btnFinish.addEventListener("click", async () => {
      const pts = this.mapCtrl.finishDrawingCustomNfz();
      exitDrawUi();
      if (pts.length >= 3) {
        await this._updateConfig({
          geofence: { custom_nfz_polygon: pts }
        });
      }
    });

    btnCancel.addEventListener("click", () => {
      this.mapCtrl.cancelDrawingCustomNfz();
      exitDrawUi();
    });

    btnClear.addEventListener("click", async () => {
      await this._updateConfig({
        geofence: { custom_nfz_polygon: [] }
      });
    });

    // 顶部快速演示剧本切换
    document.getElementById("quick-scenario-select").addEventListener("change", (e) => {
      this._updateConfig({ drivers: { simulator: { scenario: e.target.value } } });
    });

    document.getElementById("map-layer-select").addEventListener("change", (e) => {
      this.mapCtrl.setLayer(e.target.value, this.config?.map?.google_maps_api_key || "");
    });

    document.getElementById("btn-recenter").addEventListener("click", () => this.mapCtrl.recenter());

    document.getElementById("btn-audio-toggle").addEventListener("click", () => {
      this.audioEnabled = !this.audioEnabled;
      if (this.audioEnabled && !this.audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) this.audioCtx = new AudioContext();
      }
      document.getElementById("btn-audio-toggle").textContent = this.audioEnabled
        ? this.t("soundOn")
        : this.t("soundOff");
    });

    document.querySelectorAll(".track-filter").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.trackFilter = btn.dataset.filter;
        document.querySelectorAll(".track-filter").forEach((b) => b.classList.toggle("active", b === btn));
        this.renderTracks();
      });
    });

    document.querySelectorAll(".rf-band-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".rf-band-btn").forEach((b) => b.classList.toggle("active", b === btn));
        this.spectrumView.setBand(btn.dataset.band);
      });
    });

    // 导出 CSV 巡检报表（兼容 GitHub Pages 云端与本地网关）
    document.getElementById("btn-export-csv").addEventListener("click", () => {
      if (this.useBrowserEngine) {
        const csvStr = this.browserEngine.exportCsvString();
        const blob = new Blob([csvStr], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "skyguard_security_report.csv";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        window.location.href = "./api/events/export.csv";
      }
    });

    document.getElementById("btn-clear-events").addEventListener("click", async () => {
      if (this.useBrowserEngine) {
        this.browserEngine.clearEvents();
        this.events = [];
        this.renderEventsTable();
      } else {
        await fetch("./api/events/clear", { method: "POST", body: "{}" });
        await this.refreshEvents();
      }
    });

    const settingsModal = document.getElementById("settings-modal");
    const openSettings = () => {
      if (!this.config) return;
      const d = this.config.drivers || {};
      document.getElementById("cfg-sim-enabled").checked = !!d.simulator?.enabled;
      document.getElementById("cfg-sim-scenario").value = d.simulator?.scenario || "mixed_live";
      document.getElementById("cfg-hw-rid").checked = d.rid_receiver?.enabled !== false;
      document.getElementById("cfg-hw-adsb").checked = d.adsb_receiver?.enabled !== false;
      document.getElementById("cfg-hw-sdr").checked = d.sdr_spectrum?.enabled !== false;
      document.getElementById("cfg-hw-wx").checked = d.weather_station?.enabled !== false;
      document.getElementById("cfg-inner-r").value = this.config.geofence?.inner_nfz_radius_m || 450;
      document.getElementById("cfg-outer-r").value = this.config.geofence?.outer_warn_radius_m || 1200;
      document.getElementById("cfg-line-token").value = this.config.notifications?.line_token || "";
      document.getElementById("cfg-google-key").value = this.config.map?.google_maps_api_key || "";
      settingsModal.classList.add("open");
    };

    document.getElementById("btn-open-settings").addEventListener("click", openSettings);
    document.getElementById("btn-close-settings").addEventListener("click", () => settingsModal.classList.remove("open"));
    document.getElementById("btn-cancel-settings").addEventListener("click", () => settingsModal.classList.remove("open"));

    document.getElementById("btn-save-settings").addEventListener("click", async () => {
      const payload = {
        geofence: {
          inner_nfz_radius_m: Number(document.getElementById("cfg-inner-r").value) || 450,
          outer_warn_radius_m: Number(document.getElementById("cfg-outer-r").value) || 1200
        },
        drivers: {
          simulator: {
            enabled: document.getElementById("cfg-sim-enabled").checked,
            scenario: document.getElementById("cfg-sim-scenario").value
          },
          rid_receiver: { enabled: document.getElementById("cfg-hw-rid").checked },
          adsb_receiver: { enabled: document.getElementById("cfg-hw-adsb").checked },
          sdr_spectrum: { enabled: document.getElementById("cfg-hw-sdr").checked },
          weather_station: { enabled: document.getElementById("cfg-hw-wx").checked }
        },
        notifications: {
          line_token: document.getElementById("cfg-line-token").value.trim()
        },
        map: {
          google_maps_api_key: document.getElementById("cfg-google-key").value.trim()
        }
      };

      await this._updateConfig(payload);
      settingsModal.classList.remove("open");
    });

    const dispatchModal = document.getElementById("dispatch-modal");
    document.getElementById("btn-close-dispatch").addEventListener("click", () => dispatchModal.classList.remove("open"));
    document.getElementById("btn-copy-dispatch").addEventListener("click", async () => {
      const txt = document.getElementById("dispatch-preview-text").textContent;
      try {
        await navigator.clipboard.writeText(txt);
        const toast = document.getElementById("copy-toast");
        toast.textContent = this.t("copiedToast");
        toast.style.display = "block";
      } catch (_) {}
    });
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const app = new SkyGuardApp();
  app.boot();
});
