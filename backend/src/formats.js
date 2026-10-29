import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const formats = {
  pdf: { label: "PDF", mime: "application/pdf", extension: "pdf", group: "document" },
  docx: { label: "Word document", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", extension: "docx", group: "office" },
  doc: { label: "Word 97–2003", mime: "application/msword", extension: "doc", group: "office" },
  xlsx: { label: "Excel workbook", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extension: "xlsx", group: "spreadsheet" },
  xls: { label: "Excel 97–2003", mime: "application/vnd.ms-excel", extension: "xls", group: "spreadsheet" },
  csv: { label: "CSV spreadsheet", mime: "text/csv", extension: "csv", group: "spreadsheet" },
  odt: { label: "OpenDocument text", mime: "application/vnd.oasis.opendocument.text", extension: "odt", group: "office" },
  rtf: { label: "Rich text", mime: "application/rtf", extension: "rtf", group: "office" },
  txt: { label: "Plain text", mime: "text/plain", extension: "txt", group: "text" },
  md: { label: "Markdown", mime: "text/markdown", extension: "md", group: "text" },
  png: { label: "PNG image", mime: "image/png", extension: "png", group: "image" },
  jpg: { label: "JPG image", mime: "image/jpeg", extension: "jpg", group: "image" },
  webp: { label: "WebP image", mime: "image/webp", extension: "webp", group: "image" },
  avif: { label: "AVIF image", mime: "image/avif", extension: "avif", group: "image" },
  tiff: { label: "TIFF image", mime: "image/tiff", extension: "tiff", group: "image" },
  gif: { label: "GIF image", mime: "image/gif", extension: "gif", group: "image" },
  svg: { label: "SVG image", mime: "image/svg+xml", extension: "svg", group: "image" }
};

const officeFormats = ["docx", "doc", "odt", "rtf", "txt", "pdf"];
const spreadsheetFormats = ["xlsx", "xls", "csv"];
const imageFormats = ["png", "jpg", "webp", "avif", "tiff", "gif"];

async function commandAvailable(command) {
  try {
    await execFileAsync(command, ["--version"], { timeout: 1500, windowsHide: true });
    return true;
  } catch (error) {
    return error.code !== "ENOENT";
  }
}

export async function getCapabilities(source) {
  const libreOffice = await commandAvailable(process.env.LIBREOFFICE_PATH || "libreoffice");
  const extension = source?.toLowerCase().replace(/^\./, "");
  const sourceFormat = formats[extension];
  let targets = [];

  if (sourceFormat?.group === "image") {
    targets = [...imageFormats, "pdf"].filter((target) => target !== extension);
  } else if (extension === "pdf") {
    targets.push("png", "jpg", "txt");
    if (libreOffice) targets.push("docx", "doc", "odt", "rtf");
  } else if (extension === "csv") {
    targets = ["xlsx", "txt", "md", "pdf"];
    if (libreOffice) {
      targets.push(...officeFormats, ...spreadsheetFormats.filter((target) => target !== extension));
    }
  } else if (extension === "xlsx") {
    targets = ["csv", "txt", "md", "pdf"];
    if (libreOffice) targets.push(...officeFormats, ...spreadsheetFormats.filter((target) => target !== extension));
  } else if (["doc", "docx"].includes(extension)) {
    targets = ["txt", "md", "pdf"];
    if (libreOffice) {
      targets.push(
        ...officeFormats.filter((target) => target !== extension),
        ...spreadsheetFormats.filter((target) => target !== extension)
      );
    }
  } else if (sourceFormat?.group === "office" || sourceFormat?.group === "spreadsheet") {
    if (libreOffice) {
      targets = [...officeFormats, ...spreadsheetFormats].filter((target) => target !== extension);
    }
  } else if (["txt", "md"].includes(extension)) {
    targets = ["pdf", "txt", "md"].filter((target) => target !== extension);
  }

  return {
    formats: [...new Set(targets)].map((id) => ({ id, ...formats[id] })),
    engines: { libreOffice }
  };
}
