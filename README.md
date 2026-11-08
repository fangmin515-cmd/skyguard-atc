# SkyGuard ATC — 低空安全态势感知与预警系统

专为 **无人机集群表演现场护航** 与 **泰国商圈 / 景点 / 大型活动日常低空监测** 设计的轻量级商业态势感知系统（纯被动侦测，不涉及无线电干扰/诱骗发射红线）。

## 一、快速启动

### 方式 1：Web 大屏模式（零依赖即开即用，当前电脑可直接运行）
在终端执行（或在访达双击 `start.command`）：
```bash
python3 server/main.py
```
浏览器打开：**http://127.0.0.1:8765**（按 `F11` 或 macOS 全屏即可作为指挥车/保安室监控大屏）。

### 方式 2：Electron 独立桌面客户端模式（跨平台打包 `.dmg` / `.exe`）
安装 Node.js 后（`brew install node`），在项目根目录执行：
```bash
npm install
npm start          # 启动 Electron 航空塔台桌面客户端
npm run pack:mac   # 打包 macOS 安装包
npm run pack:win   # 打包 Windows 安装包
```

---

## 二、核心特性

1. **曼谷 ICONSIAM 真实地理预设 + 原生 WGS-84 多图源引擎**
   - 默认锚定曼谷湄南河畔 **ICONSIAM (`13.7267°N, 100.5105°E`)**。
   - 支持 **暗黑塔台底图 (CartoDB Dark)**、**Esri 高清全球卫星影像**、**OpenStreetMap**、**可选 Google 卫星混合图**，以及 **100% 断网可用的离线极坐标空管雷达盘**。
2. **中 / 英 / 泰（`中文 / EN / ไทย`）三语实时切换**
   - 自用集群表演切中文，给泰国商场安保执勤切泰文/英文。
3. **双业务模式一键切换**
   - **集群表演护航模式**：显示湄南河编队保护空域盒、自有集群白名单、起飞前 4 项安全门限（黑飞净空 / 低空直升机防撞 / 2.4G&5.8G 频谱干净度 / 地面阵风安全）自动给出 `GO / CAUTION / HOLD` 放行建议。
   - **商圈日常值守模式**：专注双层电子围栏（外圈预警 + 内圈核心禁飞区）全天候监控与巡检报表导出。
4. **插件化硬件驱动 + 能力驱动界面（Capability-Driven UI）**
   - 点击右上角 **「硬件与系统配置」**：
     - 交付客户时可一键关闭 **沙盘仿真数据源 (`Simulator Driver`)**，界面自动切换为 `实测运行模式 (LIVE SENSORS)`，零模拟残留。
     - 取消勾选任意未采购的硬件（如未配气象站或未配 SDR），对应 UI 面板**自动隐藏并重排布局**，绝不留空壳假功能。
5. **泰国保安 LINE 执勤派单联动（附飞手 Google Maps 步行导航）**
   - 发现违规无人机后，点击 **「派单找飞手 / แจ้ง รปภ.」**，自动生成带 **飞手遥控器实时经纬度 Google Maps 导航链接** 的三语告警单（填入 LINE Notify Token 即可自动推送到保安手机群）。

---

## 三、第二步：千元级真实被动硬件接入接口规范

后台服务已内置硬件接收网关（见 `server/drivers/hardware_adapters.py`），未来采购硬件后直接按以下标准协议灌入数据即可：

1. **RID 远程识别嗅探模块（ESP32-S3 OpenDroneID）**
   - 发送 JSON 至本地 UDP 端口 `9871` 或 `POST http://127.0.0.1:8765/api/ingest/rid`：
   ```json
   {
     "serial_no": "1581F6N8C236E003",
     "model": "DJI Air 3",
     "lat": 13.7252,
     "lng": 100.5121,
     "alt_m": 85.0,
     "speed_ms": 8.4,
     "heading_deg": 45.0,
     "pilot_lat": 13.7198,
     "pilot_lng": 100.5135,
     "rssi_dbm": -58.0
   }
   ```
2. **ADS-B 航空接收机（RTL-SDR + `dump1090`）**
   - 启动 `dump1090 --net` 后，系统自动轮询 `http://127.0.0.1:8080/data/aircraft.json` 获取周边低空直升机与航班。
3. **五要素微型气象站（RS485 Modbus 转脚本）**
   - `POST http://127.0.0.1:8765/api/ingest/weather`：
   ```json
   {
     "temp_c": 31.5,
     "humidity_pct": 66.0,
     "wind_speed_ms": 4.2,
     "wind_gust_ms": 5.8,
     "wind_dir_deg": 190,
     "pressure_hpa": 1008.2
   }
   ```
4. **SDR 宽带频谱扫描（`hackrf_sweep` / `AntSDR`）**
   - `POST http://127.0.0.1:8765/api/ingest/spectrum` 推送 64 点 `band_24g` / `band_58g` 数组与未知图传突发告警。
