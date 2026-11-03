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
  html: { label: "HTML", mime: "text/html", extension: "html", group: "text" },
  htm: { label: "HTML", mime: "text/html", extension: "htm", group: "text" },
  json: { label: "JSON", mime: "application/json", extension: "json", group: "text" },
  xml: { label: "XML", mime: "application/xml", extension: "xml", group: "text" },
  yaml: { label: "YAML", mime: "application/yaml", extension: "yaml", group: "text" },
  yml: { label: "YAML", mime: "application/yaml", extension: "yml", group: "text" },
  js: { label: "JavaScript", mime: "text/javascript", extension: "js", group: "text" },
  mjs: { label: "JavaScript module", mime: "text/javascript", extension: "mjs", group: "text" },
  cjs: { label: "JavaScript module", mime: "text/javascript", extension: "cjs", group: "text" },
  ts: { label: "TypeScript", mime: "text/typescript", extension: "ts", group: "text" },
  jsx: { label: "React JSX", mime: "text/jsx", extension: "jsx", group: "text" },
  tsx: { label: "React TSX", mime: "text/tsx", extension: "tsx", group: "text" },
  py: { label: "Python", mime: "text/x-python", extension: "py", group: "text" },
  java: { label: "Java", mime: "text/x-java-source", extension: "java", group: "text" },
  c: { label: "C source", mime: "text/x-c", extension: "c", group: "text" },
  h: { label: "C/C++ header", mime: "text/x-c", extension: "h", group: "text" },
  cpp: { label: "C++ source", mime: "text/x-c++src", extension: "cpp", group: "text" },
  hpp: { label: "C++ header", mime: "text/x-c++hdr", extension: "hpp", group: "text" },
  cs: { label: "C# source", mime: "text/x-csharp", extension: "cs", group: "text" },
  go: { label: "Go source", mime: "text/x-go", extension: "go", group: "text" },
  rs: { label: "Rust source", mime: "text/x-rust", extension: "rs", group: "text" },
  php: { label: "PHP source", mime: "text/x-php", extension: "php", group: "text" },
  rb: { label: "Ruby source", mime: "text/x-ruby", extension: "rb", group: "text" },
  sh: { label: "Shell script", mime: "text/x-shellscript", extension: "sh", group: "text" },
  sql: { label: "SQL", mime: "application/sql", extension: "sql", group: "text" },
  css: { label: "CSS", mime: "text/css", extension: "css", group: "text" },
  scss: { label: "SCSS", mime: "text/x-scss", extension: "scss", group: "text" },
  vue: { label: "Vue component", mime: "text/x-vue", extension: "vue", group: "text" },
  svelte: { label: "Svelte component", mime: "text/x-svelte", extension: "svelte", group: "text" },
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
const textExtensions = new Set([
  "txt", "md", "html", "htm", "json", "xml", "yaml", "yml",
  "js", "mjs", "cjs", "ts", "jsx", "tsx", "py", "java", "c", "h",
  "cpp", "hpp", "cs", "go", "rs", "php", "rb", "sh", "sql", "css",
  "scss", "vue", "svelte"
]);

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
    targets.push("png", "jpg", "txt", "md");
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
  } else if (textExtensions.has(extension)) {
    targets = ["pdf", "txt", "md"].filter((target) => target !== extension);
  }

  return {
    formats: [...new Set(targets)].map((id) => ({ id, ...formats[id] })),
    engines: { libreOffice }
  };
}
