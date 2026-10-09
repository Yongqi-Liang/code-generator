const { app, BrowserWindow, shell } = require("electron");
const http = require("http");
const fs = require("fs");
const path = require("path");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

function staticRoot() {
  // packaged: resources/out ; dev: project/out
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "out");
  }
  return path.join(__dirname, "..", "out");
}

function createStaticServer(root) {
  const rootResolved = path.resolve(root);

  return http.createServer((req, res) => {
    try {
      const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      let rel = urlPath === "/" ? "/index.html" : urlPath;
      const filePath = path.resolve(path.join(rootResolved, rel));

      if (!filePath.startsWith(rootResolved + path.sep) && filePath !== rootResolved) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }

      fs.readFile(filePath, (err, data) => {
        if (err) {
          // SPA / Next static: missing paths -> 404.html if present
          const fallback = path.join(rootResolved, "404.html");
          fs.readFile(fallback, (err2, data2) => {
            if (err2) {
              res.writeHead(404);
              res.end("Not found");
              return;
            }
            res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
            res.end(data2);
          });
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
        res.end(data);
      });
    } catch {
      res.writeHead(500);
      res.end("Server error");
    }
  });
}

let mainWindow = null;
let server = null;

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "追溯码生成器",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}/`);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  const root = staticRoot();
  if (!fs.existsSync(path.join(root, "index.html"))) {
    console.error(`未找到静态页面: ${root}\\index.html\n请先执行: npm run build`);
    app.quit();
    return;
  }

  server = createStaticServer(root);
  server.listen(0, "127.0.0.1", () => {
    const { port } = server.address();
    createWindow(port);
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0 && server) {
      const { port } = server.address();
      createWindow(port);
    }
  });
});

app.on("window-all-closed", () => {
  if (server) {
    server.close();
    server = null;
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});
