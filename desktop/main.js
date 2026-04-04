const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const Store = require("electron-store");
const { checkLicense, activateLicense } = require("./license");

const store = new Store();
let mainWindow;
let splashWindow;
let backendProcess;

// Backend port
const BACKEND_PORT = 8001;
const isDev = !app.isPackaged;

// ===== Find Python =====
function findPython() {
  if (isDev) return "python3";
  // Bundled Python in resources
  const bundledPython = path.join(process.resourcesPath, "python", "python.exe");
  const fs = require("fs");
  if (fs.existsSync(bundledPython)) return bundledPython;
  return "python";
}

// ===== Find FFmpeg =====
function findFFmpeg() {
  if (isDev) return null; // Use system ffmpeg
  return path.join(process.resourcesPath, "ffmpeg");
}

// ===== Start Backend =====
function startBackend() {
  const pythonPath = findPython();
  const backendDir = isDev
    ? path.join(__dirname, "..", "backend")
    : path.join(app.getAppPath(), "backend");

  const env = {
    ...process.env,
    MONGO_URL: store.get("mongoUrl", "mongodb://localhost:27017/voxidub"),
    DB_NAME: "voxidub",
    JWT_SECRET: store.get("jwtSecret", require("crypto").randomBytes(32).toString("hex")),
    EMERGENT_LLM_KEY: store.get("emergentKey", ""),
    DESKTOP_MODE: "true",
  };

  const ffmpegDir = findFFmpeg();
  if (ffmpegDir) {
    env.PATH = ffmpegDir + path.delimiter + env.PATH;
  }

  console.log(`Starting backend with: ${pythonPath}`);
  console.log(`Backend dir: ${backendDir}`);

  backendProcess = spawn(pythonPath, ["-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", String(BACKEND_PORT)], {
    cwd: backendDir,
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  backendProcess.stdout.on("data", (data) => {
    console.log(`[Backend] ${data}`);
  });

  backendProcess.stderr.on("data", (data) => {
    console.log(`[Backend-err] ${data}`);
  });

  backendProcess.on("close", (code) => {
    console.log(`Backend exited with code ${code}`);
  });
}

// ===== Wait for Backend =====
async function waitForBackend(maxRetries = 30) {
  const axios = require("axios");
  for (let i = 0; i < maxRetries; i++) {
    try {
      await axios.get(`http://localhost:${BACKEND_PORT}/api/projects`, { timeout: 2000 });
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  return false;
}

// ===== Splash Screen =====
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 500,
    height: 350,
    frame: false,
    transparent: true,
    resizable: false,
    center: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  splashWindow.loadFile("splash.html");
}

// ===== Main Window =====
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    icon: path.join(__dirname, "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:3000");
  } else {
    mainWindow.loadFile(path.join(__dirname, "build", "index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ===== IPC Handlers =====
ipcMain.handle("get-license", () => store.get("licenseKey", ""));
ipcMain.handle("get-license-status", () => store.get("licenseActive", false));

ipcMain.handle("activate-license", async (_, key) => {
  const result = await activateLicense(key);
  if (result.success) {
    store.set("licenseKey", key);
    store.set("licenseActive", true);
    store.set("licenseExpiry", result.expiry);
  }
  return result;
});

ipcMain.handle("get-settings", () => ({
  mongoUrl: store.get("mongoUrl", "mongodb://localhost:27017/voxidub"),
  emergentKey: store.get("emergentKey", ""),
}));

ipcMain.handle("save-settings", (_, settings) => {
  if (settings.mongoUrl) store.set("mongoUrl", settings.mongoUrl);
  if (settings.emergentKey) store.set("emergentKey", settings.emergentKey);
  return { success: true };
});

ipcMain.handle("select-file", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [
      { name: "Video/Audio", extensions: ["mp4", "mkv", "avi", "mov", "webm", "mp3", "wav", "flac", "m4a"] },
    ],
  });
  return result.canceled ? null : result.filePaths[0];
});

// ===== App Lifecycle =====
app.whenReady().then(async () => {
  createSplash();

  // Start backend
  startBackend();

  // Wait for backend to be ready
  const ready = await waitForBackend();

  if (splashWindow) {
    splashWindow.close();
    splashWindow = null;
  }

  if (!ready) {
    dialog.showErrorBox("VoxiDub.AI", "Backend failed to start. Please check:\n1. MongoDB is running\n2. Python is installed\n3. All dependencies are installed");
    app.quit();
    return;
  }

  createMainWindow();
});

app.on("window-all-closed", () => {
  if (backendProcess) {
    backendProcess.kill();
  }
  app.quit();
});

app.on("before-quit", () => {
  if (backendProcess) {
    backendProcess.kill();
  }
});
