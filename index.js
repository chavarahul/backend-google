const FtpSrv = require("ftp-srv");
const express = require("express");
const path = require("path");
const os = require("os");
const fs = require("fs").promises;
const chokidar = require("chokidar");
const { v4: uuidv4 } = require("uuid");
const WebSocket = require("ws");
const { PrismaClient } = require("@prisma/client");
const cors = require("cors");
const debounce = require("lodash.debounce");
const albumRoutes = require("./routes/albumRoutes");
const profileRoutes = require("./routes/profileRoutes");
const photoRoutes = require("./routes/photoRoutes");
const { uploadImage } = require("./lib/cloudinary");
const authRoutes = require("./routes/authRoutes");
const  authenticateToken  = require("./middleware/protectRoute");
const fileUpload = require("express-fileupload");

const prisma = new PrismaClient();
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors({ origin : '*'}));
app.use(fileUpload());

app.use("/api/auth", authRoutes);
app.use("/api/albums", authenticateToken, albumRoutes);
app.use("/api/profile", authenticateToken, profileRoutes);
app.use("/api/photos", authenticateToken, photoRoutes);
app.get("/api/auth/user-id", authenticateToken, (req, res) => {
  res.json({ userId: req.user.userId, name: req.user.name });
});

const interfaces = os.networkInterfaces();
const address = Object.values(interfaces)
  .flat()
  .filter((iface) => iface.family === "IPv4" && !iface.internal)
  .map((iface) => iface.address);
const host = address[0] || "localhost";

const ftpServer = new FtpSrv({
  url: `ftp://0.0.0.0:2121`,
  anonymous: false,
  pasv_range: "8000-9000",
  pasv_url: host,
  greeting: ["Welcome to FTP server"],
});

const userCredentials = new Map();
const directories = new Map();
const albumIds = new Map();
const processedFiles = new Set();

ftpServer.on("login", ({ connection, username, password }, resolve, reject) => {
  console.log(`FTP login attempt: username=${username}, password="${password}"`);
  console.log(`Raw password bytes: ${Buffer.from(password).toString("hex")}`);
  const user = userCredentials.get(username);
  console.log(`Stored credentials for ${username}:`, user);
  if (user && user.password === password) {
    const userDir = directories.get(username);
    if (!userDir) {
      console.error(`No directory set for user: ${username}`);
      reject(new Error("No directory configured"));
      return;
    }
    resolve({ root: userDir });
    console.log(`FTP login successful for ${username}, root: ${userDir}`);
  } else {
    console.log(`FTP login failed for ${username}: Invalid credentials`);
    console.log(
      `Expected password: "${user?.password}", Received: "${password}"`
    );
    console.log(
      `Expected bytes: ${
        user ? Buffer.from(user.password).toString("hex") : "none"
      }`
    );
    reject(new Error("Invalid credentials"));
  }
});

ftpServer.on("stor", ({ connection, filename }, resolve, reject) => {
  console.log(`FTP file upload: ${filename} by ${connection.username}`);
  resolve();
});

ftpServer
  .listen()
  .then(() => console.log(`FTP Server running on ftp://${host}:2121`))
  .catch((err) => console.error("FTP Server failed:", err));

const server = require("http").createServer(app);
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
  console.log("New WebSocket client connected");
  ws.on("close", () => {
    console.log("WebSocket client disconnected");
  });
});

app.use("/images", (req, res, next) => {
  const username = req.query.username || "defaultuser";
  const userDir = directories.get(username) || path.join(__dirname, "ftp_files");
  express.static(userDir)(req, res, next);
});

app.get("/api/credentials", (req, res) => {
  const credentials = Array.from(userCredentials.entries()).map(
    ([username, { password }]) => ({
      username,
      password,
      directory: directories.get(username),
      albumId: albumIds.get(username),
    })
  );
  console.log("Returning stored credentials:", credentials);
  res.json(credentials);
});

app.post("/api/reset-credentials", (req, res) => {
  userCredentials.clear();
  directories.clear();
  albumIds.clear();
  processedFiles.clear();
  console.log("Credentials and processed files reset");
  res.json({ message: "Credentials reset successfully" });
});

app.post("/api/test-credentials", (req, res) => {
  const { username, password } = req.body;
  console.log(`Test credentials: username=${username}, password="${password}"`);
  console.log(`Raw test password bytes: ${Buffer.from(password).toString("hex")}`);
  const user = userCredentials.get(username);
  if (user && user.password === password) {
    console.log(`Test credentials successful for ${username}`);
    res.json({ valid: true });
  } else {
    console.log(`Test credentials failed for ${username}`);
    res.json({ valid: false, expected: user?.password });
  }
});

async function saveToAlbum(imageUrl, albumId) {
  try {
    await prisma.photo.create({
      data: {
        url: imageUrl,
        albumId,
      },
    });
    await prisma.album.update({
      where: { id: albumId },
      data: { photoCount: { increment: 1 } },
    });
    console.log(`Saved image ${imageUrl} to album ${albumId}`);
  } catch (error) {
    console.error(`Failed to save image to album ${albumId}:`, error);
  }
}

app.post("/api/start-ftp", async (req, res) => {
  const { username, directory, albumId } = req.body;

  if (!username || !directory || !albumId) {
    console.error("Missing required fields:", { username, directory, albumId });
    return res.status(400).json({ error: "Missing required fields" });
  }

  console.log(`Received directory: ${directory}`);

  try {
    const absoluteDir = path.resolve(directory);
    const stats = await fs.stat(absoluteDir);
    if (!stats.isDirectory()) {
      console.error(`Path is not a directory: ${absoluteDir}`);
      return res.status(400).json({ error: "Selected path is not a directory" });
    }
    console.log(`Using existing directory: ${absoluteDir}`);
  } catch (error) {
    console.error(
      `Directory does not exist or is inaccessible: ${directory}`,
      error
    );
    return res.status(400).json({
      error: "Directory does not exist or is inaccessible",
    });
  }

  const password = `${username}_${uuidv4().split("-")[0]}`;
  userCredentials.set(username, { password });
  directories.set(username, path.resolve(directory));
  albumIds.set(username, albumId);

  console.log(`Stored credentials: username=${username}, password="${password}"`);
  console.log(`Raw password bytes: ${Buffer.from(password).toString("hex")}`);

  res.json({
    host,
    username,
    password,
    port: 2121,
    mode: "Passive",
  });

  const watcher = chokidar.watch(path.resolve(directory), {
    ignored: /(^|[\/\\])\../,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 1000,
      pollInterval: 100,
    },
  });

  const handleFileAdd = debounce(async (filePath) => {
    const fileName = path.basename(filePath);
    console.log(`Chokidar detected new file: ${filePath}`);

    if (processedFiles.has(filePath)) {
      console.log(`File already processed: ${filePath}`);
      return;
    }

    processedFiles.add(filePath);
    setTimeout(() => {
      processedFiles.delete(filePath);
    }, 10000);

    if (/\.(jpg|jpeg|png|gif|webp)$/i.test(fileName)) {
      console.log(`Processing image: ${filePath}`);
      const file = { path: filePath, originalname: fileName };
      let cloudinaryUrl;
      try {
        const Url = await uploadImage(file);
        cloudinaryUrl = Url.secure_url;

      } catch (error) {
        console.error(
          `Skipping processing for ${fileName} due to Cloudinary upload failure`
        );
        return;
      }

      const message = JSON.stringify({ action: "add", imageUrl: cloudinaryUrl });
      console.log(
        `Sending WebSocket message to ${wss.clients.size} clients: ${message}`
      );
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        } else {
          console.log("Skipping WebSocket client: not open");
        }
      });

      try {
        await fs.access(filePath);
        console.log(`Image confirmed in directory: ${filePath}`);
      } catch (error) {
        console.error(`Image not found in directory: ${filePath}`, error);
      }

      await saveToAlbum(cloudinaryUrl, albumId);
    }
  }, 500);

  watcher.on("add", handleFileAdd);

  watcher.on("unlink", (filePath) => {
    console.log(`Image removed: ${filePath}`);
  });

  watcher.on("error", (error) => {
    console.error(`Chokidar error: ${error}`);
  });
});

server.listen(4000, () => {
  console.log("HTTP Server running on http://localhost:4000");
});