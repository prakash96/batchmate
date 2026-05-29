const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const { fileURLToPath } = require("url");
const curlconverter = require("curlconverter");
const fs = require("fs");


ipcMain.handle("parse-curl",  (_, curl) => {
  const result = curlconverter.toJsonString(curl);

  return JSON.parse(result);
});

ipcMain.handle("open-file", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "JSON", extensions: ["json"] }]
  });

  if (result.canceled) return null;

  const filePath = result.filePaths[0];
  const content = fs.readFileSync(filePath, "utf-8");

  return content;
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true
    }
  });

  win.loadURL("http://localhost:5173");
  win.webContents.openDevTools();
}

app.whenReady().then(createWindow);

ipcMain.handle("execute-http", async (_, config) => {
    try {
        const controller = new AbortController();
        let body = config.body;

        if (
        config.headers?.["Content-Type"]?.includes("application/x-www-form-urlencoded") &&
        typeof body === "object"
        ) {
        body = new URLSearchParams(body).toString();
        }
        const timeout = setTimeout(() => controller.abort(), 30000);

        const response = await fetch(config.url, {
            method: config.method,
            headers: config.headers,
            body: body,
            signal: controller.signal
        });

        clearTimeout(timeout);

        const contentType = response.headers.get("content-type") || "";

        let responseBody;

        if (contentType.includes("application/json")) {
            responseBody = await response.json();
        } else {
            responseBody = await response.text();
        }

        return {
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            body: responseBody
        };

    } catch (error) {
        return {
            error: true,
            message: error.message
        };
    }
});
