import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import PDFDocument from "pdfkit";
import { convertFile, ConversionError } from "../src/conversion.js";
import { getCapabilities } from "../src/formats.js";

async function createPdf(text) {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument();
    const chunks = [];
    pdf.on("data", (chunk) => chunks.push(chunk));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);
    pdf.text(text);
    pdf.end();
  });
}

test("source code is wrapped in a language-labelled Markdown fence", async () => {
  const converted = await convertFile({
    buffer: Buffer.from('print("hello")\n'),
    originalName: "hello.py",
    target: "md"
  });

  try {
    assert.equal(await readFile(converted.path, "utf8"), '```py\nprint("hello")\n```\n');
  } finally {
    await converted.cleanup();
  }
});

test("Markdown fences safely contain backticks from the source", async () => {
  const converted = await convertFile({
    buffer: Buffer.from("const sample = ```value```;\n"),
    originalName: "sample.js",
    target: "md"
  });

  try {
    assert.match(await readFile(converted.path, "utf8"), /^````js\n/);
  } finally {
    await converted.cleanup();
  }
});

test("JSON is validated and formatted as a fenced Markdown block", async () => {
  const converted = await convertFile({
    buffer: Buffer.from('{"answer":42}'),
    originalName: "data.json",
    target: "md"
  });

  try {
    const markdown = await readFile(converted.path, "utf8");
    assert.match(markdown, /^```json\n/);
    assert.match(markdown, /"answer": 42/);
  } finally {
    await converted.cleanup();
  }
});

test("invalid JSON returns a client error", async () => {
  await assert.rejects(
    convertFile({ buffer: Buffer.from("{bad"), originalName: "data.json", target: "md" }),
    (error) => error instanceof ConversionError && error.statusCode === 422
  );
});

test("HTML structure is converted to Markdown", async () => {
  const converted = await convertFile({
    buffer: Buffer.from("<h1>Title</h1><p>Hello <strong>world</strong>.</p>"),
    originalName: "page.html",
    target: "md"
  });

  try {
    const markdown = await readFile(converted.path, "utf8");
    assert.match(markdown, /# Title/);
    assert.match(markdown, /\*\*world\*\*/);
  } finally {
    await converted.cleanup();
  }
});

test("CSV content is converted to a Markdown table", async () => {
  const converted = await convertFile({
    buffer: Buffer.from("name,count\nalpha,2\nbeta,3"),
    originalName: "rows.csv",
    target: "md"
  });

  try {
    const markdown = await readFile(converted.path, "utf8");
    assert.match(markdown, /\| name \| count \|/);
    assert.match(markdown, /\| alpha \| 2 \|/);
  } finally {
    await converted.cleanup();
  }
});

test("PDF text extracts to Markdown with page headings", async () => {
  const converted = await convertFile({
    buffer: await createPdf("Readable PDF content"),
    originalName: "readable.pdf",
    target: "md"
  });

  try {
    const markdown = await readFile(converted.path, "utf8");
    assert.match(markdown, /## Page 1/);
    assert.match(markdown, /Readable PDF content/);
  } finally {
    await converted.cleanup();
  }
});

test("files whose contents do not match their extension are rejected", async () => {
  await assert.rejects(
    convertFile({ buffer: Buffer.from("not a PDF"), originalName: "invalid.pdf", target: "txt" }),
    (error) => error instanceof ConversionError && error.statusCode === 415
  );
});

test("invalid UTF-8 is rejected as a text file", async () => {
  await assert.rejects(
    convertFile({ buffer: Buffer.from([0xff, 0xfe, 0x00]), originalName: "binary.py", target: "md" }),
    (error) => error instanceof ConversionError && error.statusCode === 415
  );
});

test("conversion cleanup removes its temporary output", async () => {
  const converted = await convertFile({
    buffer: Buffer.from("hello"),
    originalName: "hello.txt",
    target: "md"
  });
  const outputPath = converted.path;
  await access(outputPath);
  await converted.cleanup();
  await assert.rejects(access(outputPath));
});

test("format capabilities include only implemented Markdown paths", async () => {
  const pdfFormats = await getCapabilities("pdf");
  const imageFormats = await getCapabilities("png");
  const sourceFormats = await getCapabilities("py");

  assert(pdfFormats.formats.some(({ id }) => id === "md"));
  assert(sourceFormats.formats.some(({ id }) => id === "md"));
  assert(!imageFormats.formats.some(({ id }) => id === "md"));
});
