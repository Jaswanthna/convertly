import cors from "cors";
import express from "express";
import multer from "multer";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { convertFile } from "./conversion.js";
import { getCapabilities } from "./formats.js";

const app = express();
const port = Number(process.env.PORT) || 4000;
const allowedOrigins = new Set(
  (process.env.FRONTEND_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 }
});

app.use(cors({
  origin(origin, callback) {
    callback(null, !origin || allowedOrigins.has(origin));
  }
}));
app.use(express.json());

app.get("/api/health", (_request, response) => response.json({ status: "ok" }));

app.get("/api/formats", async (request, response, next) => {
  try {
    const source = String(request.query.source || "").split(".").pop().toLowerCase();
    response.json(await getCapabilities(source));
  } catch (error) {
    next(error);
  }
});

app.post("/api/convert", upload.single("file"), async (request, response, next) => {
  let converted;
  try {
    if (!request.file) return response.status(400).json({ error: "Choose a file to convert." });
    const target = String(request.body.target || "").toLowerCase();
    const extension = path.extname(request.file.originalname).toLowerCase();
    if (!extension || extension.length > 12) {
      return response.status(400).json({ error: "The uploaded file needs a supported file extension." });
    }

    converted = await convertFile({
      buffer: request.file.buffer,
      originalName: request.file.originalname,
      target
    });
    response.download(converted.path, converted.filename, async (error) => {
      await converted.cleanup();
      if (error && !response.headersSent) next(error);
    });
  } catch (error) {
    if (converted) await converted.cleanup();
    next(error);
  }
});

const frontendDist = fileURLToPath(new URL("../../frontend/dist/", import.meta.url));
if (existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get("*", (request, response, next) => {
    if (request.path === "/api" || request.path.startsWith("/api/")) {
      return response.status(404).json({ error: "API endpoint not found." });
    }
    response.sendFile(path.join(frontendDist, "index.html"), (error) => {
      if (error) next(error);
    });
  });
}

app.use((error, _request, response, _next) => {
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return response.status(413).json({ error: "Files must be 50 MB or smaller." });
  }
  if (error instanceof multer.MulterError) {
    return response.status(400).json({ error: error.message });
  }
  const status = error.message.includes("not supported") ? 422 : 500;
  if (status === 500) console.error(error);
  response.status(status).json({
    error: status === 500 ? "The file could not be converted. Check that the required conversion engine is installed." : error.message
  });
});

app.listen(port, () => console.log(`Convertly API listening on http://localhost:${port}`));
