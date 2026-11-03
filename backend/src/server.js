import cors from "cors";
import express from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { convertFile, ConversionError } from "./conversion.js";
import { getCapabilities } from "./formats.js";

const port = Number(process.env.PORT) || 4000;
const defaultUploadLimit = 50 * 1024 * 1024;
const configuredConcurrency = Number.parseInt(process.env.MAX_CONCURRENT_CONVERSIONS || "1", 10);
const defaultMaxActiveConversions = Number.isSafeInteger(configuredConcurrency) && configuredConcurrency > 0
  ? configuredConcurrency
  : 1;
const allowedOrigins = new Set(
  (process.env.FRONTEND_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);

class UploadError extends Error {
  constructor(message) {
    super(message);
    this.name = "UploadError";
    this.statusCode = 400;
  }
}

function formatUploadLimit(bytes) {
  if (bytes >= 1024 * 1024) return `${Math.ceil(bytes / 1024 / 1024)} MB`;
  if (bytes >= 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${bytes} bytes`;
}

function createUploadMiddleware(uploadLimitBytes) {
  const upload = multer({
    storage: multer.diskStorage({
      destination(request, _file, callback) {
        callback(null, request.uploadWorkspace);
      },
      filename(_request, file, callback) {
        const extension = path.extname(file.originalname).toLowerCase().slice(0, 12);
        callback(null, `${randomUUID()}${extension}`);
      }
    }),
    limits: { fileSize: uploadLimitBytes, files: 1, fields: 1, fieldSize: 64 }
  }).single("file");

  return async function uploadToDisk(request, response, next) {
    if (!request.is("multipart/form-data")) {
      return response.status(400).json({ error: "Upload must use multipart form data." });
    }

    try {
      request.uploadWorkspace = await mkdtemp(path.join(os.tmpdir(), "convertly-upload-"));
      upload(request, response, async (error) => {
        if (!error) return next();
        try {
          await rm(request.uploadWorkspace, { recursive: true, force: true });
          next(error instanceof multer.MulterError ? error : new UploadError("The uploaded file could not be read. Submit a valid multipart request."));
        } catch (cleanupError) {
          next(new AggregateError([error, cleanupError], "Upload failed and its temporary file could not be removed."));
        }
      });
    } catch (error) {
      next(error);
    }
  };
}

function limitConcurrentConversions(maxActiveConversions) {
  let activeConversions = 0;
  return function conversionLimit(_request, response, next) {
    if (activeConversions >= maxActiveConversions) {
      response.set("Retry-After", "10");
      return response.status(503).json({ error: "Convertly is processing other files. Please try again shortly." });
    }

    activeConversions += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      activeConversions -= 1;
    };
    response.once("finish", release);
    response.once("close", release);
    next();
  };
}

export function createApp({
  uploadLimitBytes = defaultUploadLimit,
  maxActiveConversions = defaultMaxActiveConversions
} = {}) {
  const app = express();
  const safeUploadLimit = Number.isSafeInteger(uploadLimitBytes) && uploadLimitBytes > 0
    ? uploadLimitBytes
    : defaultUploadLimit;
  const safeMaxActiveConversions = Number.isSafeInteger(maxActiveConversions) && maxActiveConversions > 0
    ? maxActiveConversions
    : defaultMaxActiveConversions;
  const upload = createUploadMiddleware(safeUploadLimit);
  const conversionLimit = limitConcurrentConversions(safeMaxActiveConversions);
  app.disable("x-powered-by");
  app.use((_request, response, next) => {
    response.set({
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin"
    });
    next();
  });
  app.use(cors({
    origin(origin, callback) {
      callback(null, !origin || allowedOrigins.has(origin));
    }
  }));
  app.use(express.json({ limit: "16kb" }));

  app.get("/api/health", (_request, response) => {
    response.set("Cache-Control", "no-store").json({ status: "ok" });
  });

  app.get("/api/formats", async (request, response, next) => {
    try {
      const source = String(request.query.source || "").split(".").pop().toLowerCase();
      response.set("Cache-Control", "no-store").json(await getCapabilities(source));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/convert", conversionLimit, upload, async (request, response, next) => {
    let converted;
    let uploadCleanupPromise;
    let convertedCleanupPromise;
    const cleanup = () => {
      if (!uploadCleanupPromise && request.uploadWorkspace) {
        uploadCleanupPromise = rm(request.uploadWorkspace, { recursive: true, force: true });
      }
      if (!convertedCleanupPromise && converted) convertedCleanupPromise = converted.cleanup();
      return Promise.all([uploadCleanupPromise, convertedCleanupPromise]);
    };
    response.once("close", () => {
      cleanup().catch((error) => console.error("Temporary conversion files could not be removed:", error));
    });

    try {
      if (!request.file) {
        await cleanup();
        return response.status(400).json({ error: "Choose a file to convert." });
      }
      const target = String(request.body.target || "").toLowerCase();
      if (!target) {
        await cleanup();
        return response.status(400).json({ error: "Choose an output format." });
      }
      const extension = path.extname(request.file.originalname).toLowerCase();
      if (!extension || extension.length > 12) {
        await cleanup();
        return response.status(400).json({ error: "The uploaded file needs a supported file extension." });
      }

      converted = await convertFile({
        inputPath: request.file.path,
        originalName: request.file.originalname,
        target
      });
      response.download(converted.path, converted.filename, async (error) => {
        try {
          await cleanup();
        } catch (cleanupError) {
          console.error("Temporary conversion files could not be removed:", cleanupError);
        }
        if (error && !response.headersSent) next(error);
      });
    } catch (error) {
      try {
        await cleanup();
      } catch (cleanupError) {
        return next(new AggregateError([error, cleanupError], "Conversion failed and its temporary files could not be removed."));
      }
      next(error);
    }
  });

  const frontendDist = fileURLToPath(new URL("../../frontend/dist/", import.meta.url));
  if (existsSync(frontendDist)) {
    app.use(express.static(frontendDist, { index: false }));
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
      return response.status(413).json({ error: `Files must be ${formatUploadLimit(safeUploadLimit)} or smaller.` });
    }
    if (error instanceof multer.MulterError) {
      return response.status(400).json({ error: error.message });
    }
    const status = error instanceof ConversionError || error instanceof UploadError
      ? error.statusCode
      : error.status || 500;
    if (status >= 500) console.error(error);
    response.status(status).json({
      error: status >= 500
        ? "The file could not be converted. Check that the required conversion engine is installed."
        : error.message
    });
  });

  return app;
}

export function startServer() {
  const server = createApp().listen(port, () => {
    console.log(`Convertly API listening on http://localhost:${port}`);
  });
  server.requestTimeout = 120_000;
  server.headersTimeout = 125_000;
  server.keepAliveTimeout = 5_000;
  server.timeout = 180_000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  startServer();
}
