// SkyGuard ATC — Electron 跨平台航空塔台桌面客户端入口
const { app, BrowserWindow, shell } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");

let pyProc = null;
let mainWindow = null;
const PORT = process.env.SKYGUARD_PORT || "8765";
const SERVER_URL = `http://127.0.0.1:${PORT}`;

function startBackend() {
  const scriptPath = path.join(__dirname, "..", "server", "main.py");
  const pyBin = process.platform === "win32" ? "python" : "python3";
  pyProc = spawn(pyBin, [scriptPath], {
    env: { ...process.env, SKYGUARD_PORT: PORT }
  });
  pyProc.stdout.on("data", (d) => process.stdout.write(d));
  pyProc.stderr.on("data", (d) => process.stderr.write(d));
}

function waitForServer(retries = 25) {
  return new Promise((resolve, reject) => {
    const check = (left) => {
      http
        .get(`${SERVER_URL}/api/config`, (res) => {
          if (res.statusCode === 200) resolve();
          else if (left > 0) setTimeout(() => check(left - 1), 200);
          else reject(new Error("Backend failed"));
        })
        .on("error", () => {
          if (left > 0) setTimeout(() => check(left - 1), 200);
          else reject(new Error("Backend timeout"));
        });
    };
    check(retries);
  });
}

async function createWindow() {
  startBackend();
  await waitForServer();

  mainWindow = new BrowserWindow({
    width: 1520,
    height: 920,
    minWidth: 1200,
    minHeight: 740,
    backgroundColor: "#0a0d12",
    title: "SkyGuard ATC — Low-Altitude Situational Awareness",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadURL(SERVER_URL);

  // 外部链接（如 Google Maps 飞手定位导航链接）使用系统默认浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (pyProc) pyProc.kill();
  app.quit();
});

app.on("before-quit", () => {
  if (pyProc) pyProc.kill();
});
