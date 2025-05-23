const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const { exec } = require("child_process");
const { Settings } = require("./src/SettingsController");
const Updater = require("./src/Auto-Updater");
const { post } = require("axios");
const { initRPC, toggleRPC } = require("./src/DiscordRPC");

require("./src/console/Controller");

let mainWindow;
let splashWindow;

initRPC();

const settings = Settings.loadSettings();
toggleRPC(settings.DiscordRPC);

const state = {
  autoInject: settings.autoInject,
  isInjection: false,
  autoIsInjection: false,
};

function sendToConsole(message) {
  return post("http://localhost:9292/roblox-console", {
    content: `[NiceHurt]: ${message}`,
  });
}

async function createWindows() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    alwaysOnTop: false,
    transparent: true,
    resizable: false,
    icon: path.join(__dirname, "src/screens/assets/NiceHurt-Logo.png"),
    webPreferences: {
      preload: path.join(__dirname, "src/screens/preloads/bootstrap.js"),
      contextIsolation: true,
    },
  });
  splashWindow.loadFile("src/screens/Bootscreen.html");

  mainWindow = new BrowserWindow({
    width: 750,
    height: 600,
    icon: path.join(__dirname, "src/screens/assets/NiceHurt-Logo.png"),
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, "src/screens/preloads/renderer.js"),
      nodeIntegration: true,
    },
  });
  mainWindow.loadFile("src/screens/Mainscreen.html");

  mainWindow.setAlwaysOnTop(settings.alwaysOnTop);
  mainWindow.setContentProtection(settings.screenShareProtect);
  splashWindow.setAlwaysOnTop(settings.alwaysOnTop);
  splashWindow.setContentProtection(settings.screenShareProtect);

  require("./src/ipc/ipcScripts")(ipcMain, mainWindow, sendToConsole);
  require("./src/ipc/ipcSettings")(ipcMain, mainWindow, state);
  require("./src/ipc/ipcExecutor")(ipcMain, mainWindow, sendToConsole, state);
  require("./src/ipc/ipcWindow")(app, ipcMain, mainWindow);

  if (!settings.skipWhitelistAsk) {
    const choice = dialog.showMessageBoxSync(splashWindow, {
      type: "info",
      buttons: ["Yes", "No"],
      defaultId: 0,
      cancelId: 1,
      title: "Windows Defender",
      message: `Do you want to whitelist the NiceHurt folder for Windows Defender? \nThis will help prevent any false positives.`,
    });
    settings.skipWhitelistAsk = true;
    settings.whitelistFolder = choice === 0;
    Settings.saveSettings(settings);
  }

  if (settings.whitelistFolder) {
    const whitelistCommand = `powershell -Command "Add-MpPreference -ExclusionPath '${path.join(
      process.env.APPDATA,
      "NiceHurt"
    )}'"`;
    exec(whitelistCommand, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error: ${error.message}`);
        return;
      }
      if (stderr) {
        console.error(`PowerShell-Error: ${stderr}`);
        return;
      }
    });
  } else {
    console.log("User chose not to whitelist.");
  }

  splashWindow.webContents.send("update-status", {
    progress: 0,
    message: "Checking for updates...",
  });
  try {
    await Updater.checkForUpdates(splashWindow);
  } catch (e) {
    console.error("Error during auto-update:", e);
    splashWindow.webContents.send("update-status", {
      progress: 0,
      message: "Update check failed",
    });
  }

  splashWindow.webContents.send("update-status", {
    progress: 20,
    message: "Checking for SirHurt updates...",
  });
  try {
    await Updater.checkForUpdatesSirhurt(splashWindow);
  } catch (e) {
    console.error("Error during SirHurt update:", e);
    splashWindow.webContents.send("update-status", {
      progress: 0,
      message: "SirHurt update failed",
    });
  }

  setTimeout(() => {
    splashWindow.close();
    mainWindow.show();
  }, 2000);
}

app.whenReady().then(() => {
  createWindows();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

module.exports = {
  mainWindow: () => mainWindow,
  state: () => state,
};
