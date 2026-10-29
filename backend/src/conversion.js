import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createCanvas, Path2D } from "@napi-rs/canvas";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import sharp from "sharp";
import WordExtractor from "word-extractor";
import { formats } from "./formats.js";

const execFileAsync = promisify(execFile);
const imageExtensions = new Set(["png", "jpg", "webp", "avif", "tiff", "gif", "svg"]);
globalThis.Path2D = Path2D;
const standardFontDataUrl = `${path.join(
  path.dirname(fileURLToPath(import.meta.resolve("pdfjs-dist/legacy/build/pdf.mjs"))),
  "..",
  "..",
  "standard_fonts"
)}${path.sep}`;

function run(command, args) {
  return execFileAsync(command, args, {
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true
  });
}

function makePdfFromText(text, destination) {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ margin: 56 });
    const output = createWriteStream(destination);
    output.on("finish", resolve);
    output.on("error", reject);
    document.on("error", reject);
    document.pipe(output);
    document.fontSize(11).text(text, { width: 480, lineGap: 4 });
    document.end();
  });
}

function markdownToText(markdown) {
  return markdown
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*([-*_]\s*){3,}$/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/`{1,3}([^`]+)`{1,3}/g, "$1");
}

function getWorksheetRows(worksheet) {
  const rows = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    rows.push(Array.from({ length: row.cellCount }, (_, index) => row.getCell(index + 1).text));
  });
  return rows;
}

function rowsToMarkdown(rows) {
  if (!rows.length) return "";
  const escape = (value) => String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  const formatRow = (row) => `| ${row.map(escape).join(" | ")} |`;
  const width = Math.max(...rows.map((row) => row.length));
  const header = [...rows[0], ...Array(Math.max(0, width - rows[0].length)).fill("")];
  return [
    formatRow(header),
    `| ${Array(width).fill("---").join(" | ")} |`,
    ...rows.slice(1).map((row) => formatRow([...row, ...Array(Math.max(0, width - row.length)).fill("")]))
  ].join("\n");
}

async function convertSpreadsheet(sourcePath, sourceExtension, targetPath, target) {
  const workbook = new ExcelJS.Workbook();
  if (sourceExtension === "csv") await workbook.csv.readFile(sourcePath);
  else await workbook.xlsx.readFile(sourcePath);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("The spreadsheet does not contain a worksheet.");

  if (target === "xlsx") {
    await workbook.xlsx.writeFile(targetPath);
    return;
  }
  if (target === "csv") {
    await workbook.csv.writeFile(targetPath, { sheetName: worksheet.name });
    return;
  }
  const rows = getWorksheetRows(worksheet);
  if (target === "md") {
    await writeFile(targetPath, rowsToMarkdown(rows), "utf8");
    return;
  }
  if (target === "txt" || target === "pdf") {
    const text = rows.map((row) => row.join("\t")).join("\n");
    if (target === "txt") await writeFile(targetPath, text, "utf8");
    else await makePdfFromText(text, targetPath);
    return;
  }
  throw new Error(`Spreadsheet conversion to ${target} is not supported.`);
}

async function convertWordDocument(sourcePath, targetPath, target) {
  const extractor = new WordExtractor();
  const document = await extractor.extract(sourcePath);
  const text = document.getBody();
  if (target === "pdf") return makePdfFromText(text, targetPath);
  if (target === "txt") return writeFile(targetPath, text, "utf8");
  if (target === "md") return writeFile(targetPath, text, "utf8");
  throw new Error(`Word document conversion to ${target} requires LibreOffice.`);
}

async function convertPdf(sourcePath, targetPath, target) {
  const pdf = await getDocument({
    data: new Uint8Array(await readFile(sourcePath)),
    standardFontDataUrl
  }).promise;
  try {
    if (target === "txt") {
      const pages = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        pages.push(content.items
          .filter((item) => "str" in item)
          .map((item) => `${item.str}${item.hasEOL ? "\n" : " "}`)
          .join(""));
        page.cleanup();
      }
      await writeFile(targetPath, pages.join("\n"), "utf8");
      return;
    }

    const page = await pdf.getPage(1);
    const scale = 1.5;
    const viewport = page.getViewport({ scale });
    const pixelLimit = 100_000_000;
    const safeScale = viewport.width * viewport.height > pixelLimit
      ? scale * Math.sqrt(pixelLimit / (viewport.width * viewport.height))
      : scale;
    const safeViewport = page.getViewport({ scale: safeScale });
    const canvas = createCanvas(Math.ceil(safeViewport.width), Math.ceil(safeViewport.height));
    await page.render({ canvasContext: canvas.getContext("2d"), viewport: safeViewport }).promise;
    const png = canvas.toBuffer("image/png");

    if (target === "png") await writeFile(targetPath, png);
    else await sharp(png).jpeg({ quality: 88 }).toFile(targetPath);
    page.cleanup();
  } finally {
    await pdf.destroy();
  }
}

async function convertImage(sourcePath, targetPath, target) {
  const image = sharp(sourcePath, { limitInputPixels: 100_000_000 });
  if (target === "jpg") return image.jpeg({ quality: 88 }).toFile(targetPath);
  if (target === "png") return image.png().toFile(targetPath);
  if (target === "webp") return image.webp({ quality: 88 }).toFile(targetPath);
  if (target === "avif") return image.avif({ quality: 75 }).toFile(targetPath);
  if (target === "tiff") return image.tiff().toFile(targetPath);
  if (target === "gif") return image.gif().toFile(targetPath);
  if (target === "pdf") {
    const metadata = await image.metadata();
    const page = await sharp(sourcePath).rotate().png().toBuffer();
    await new Promise((resolve, reject) => {
      const document = new PDFDocument({
        autoFirstPage: false,
        size: [metadata.width || 612, metadata.height || 792],
        margin: 0
      });
      const output = createWriteStream(targetPath);
      output.on("finish", resolve);
      output.on("error", reject);
      document.on("error", reject);
      document.pipe(output);
      document.addPage({ size: [metadata.width || 612, metadata.height || 792], margin: 0 });
      document.image(page, 0, 0, { fit: [metadata.width || 612, metadata.height || 792] });
      document.end();
    });
    return;
  }
  throw new Error(`Image conversion to ${target} is not supported.`);
}

export async function convertFile({ buffer, originalName, target }) {
  const sourceExtension = path.extname(originalName).slice(1).toLowerCase();
  if (!formats[target]) throw new Error("That output format is not supported.");
  const workspace = await mkdtemp(path.join(os.tmpdir(), "convertly-"));

  const baseName = path.basename(originalName, path.extname(originalName))
    .replace(/[^\p{L}\p{N}._-]/gu, "_")
    .slice(0, 100) || "converted-file";
  const sourcePath = path.join(workspace, `source.${sourceExtension}`);
  const targetPath = path.join(workspace, `${baseName}.${target}`);

  try {
    await writeFile(sourcePath, buffer, { flag: "wx" });

    if (imageExtensions.has(sourceExtension) && (imageExtensions.has(target) || target === "pdf")) {
      await convertImage(sourcePath, targetPath, target);
    } else if (sourceExtension === "pdf" && ["png", "jpg", "txt"].includes(target)) {
      await convertPdf(sourcePath, targetPath, target);
    } else if (
      formats[sourceExtension]?.group === "spreadsheet" &&
      ["csv", "xlsx"].includes(sourceExtension) &&
      ["csv", "xlsx", "txt", "md", "pdf"].includes(target)
    ) {
      await convertSpreadsheet(sourcePath, sourceExtension, targetPath, target);
    } else if (["doc", "docx"].includes(sourceExtension) && ["txt", "md", "pdf"].includes(target)) {
      await convertWordDocument(sourcePath, targetPath, target);
    } else if (["txt", "md"].includes(sourceExtension) && ["txt", "md"].includes(target)) {
      const text = await readFile(sourcePath, "utf8");
      await writeFile(targetPath, sourceExtension === "md" && target === "txt" ? markdownToText(text) : text, "utf8");
    } else if (["txt", "md"].includes(sourceExtension) && target === "pdf") {
      const text = await readFile(sourcePath, "utf8");
      await makePdfFromText(sourceExtension === "md" ? markdownToText(text) : text, targetPath);
    } else if (
      ["office", "spreadsheet"].includes(formats[sourceExtension]?.group) &&
      (["office", "spreadsheet"].includes(formats[target]?.group) ||
        formats[target]?.group === "text" ||
        target === "pdf")
    ) {
      await run(process.env.LIBREOFFICE_PATH || "libreoffice", [
        "--headless", "-env:UserInstallation=file://" + path.join(workspace, "lo-profile"),
        "--convert-to", target, "--outdir", workspace, sourcePath
      ]);
      const convertedPath = path.join(workspace, `${path.parse(sourcePath).name}.${target}`);
      if (convertedPath !== targetPath) await copyFile(convertedPath, targetPath);
    } else if (sourceExtension === "pdf" && ["docx", "doc", "odt", "rtf"].includes(target)) {
      await run(process.env.LIBREOFFICE_PATH || "libreoffice", [
        "--headless", "-env:UserInstallation=file://" + path.join(workspace, "lo-profile"),
        "--convert-to", target, "--outdir", workspace, sourcePath
      ]);
      const convertedPath = path.join(workspace, `source.${target}`);
      await copyFile(convertedPath, targetPath);
    } else {
      throw new Error(`Conversion from .${sourceExtension || "unknown"} to .${target} is not supported by the configured engines.`);
    }

    return {
      path: targetPath,
      filename: `${baseName}.${target}`,
      mime: formats[target].mime,
      cleanup: () => rm(workspace, { recursive: true, force: true })
    };
  } catch (error) {
    await rm(workspace, { recursive: true, force: true });
    if (error.code === "ENOENT") {
      throw new Error("A required conversion engine is not installed. Check the backend setup instructions.");
    }
    throw error;
  }
}
