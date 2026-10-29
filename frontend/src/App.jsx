import { useEffect, useRef, useState } from "react";
import {
  ArrowDown, ArrowLeftRight, ArrowRight, Check, ChevronDown, CircleHelp,
  CloudUpload, File, FileImage, FileText, FileType2, Github, LockKeyhole,
  Menu, ShieldCheck, Sparkles, X
} from "lucide-react";

const fileSize = (size) => size < 1024 * 1024 ? `${(size / 1024).toFixed(0)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;

export default function App() {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [formats, setFormats] = useState([]);
  const [target, setTarget] = useState("");
  const [loadingFormats, setLoadingFormats] = useState(false);
  const [converting, setConverting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!file) return;
    const extension = file.name.split(".").pop();
    setLoadingFormats(true);
    setError("");
    setComplete(false);
    fetch(`/api/formats?source=${encodeURIComponent(extension)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load conversion options.");
        return response.json();
      })
      .then((data) => {
        setFormats(data.formats);
        setTarget(data.formats[0]?.id || "");
        if (!data.formats.length) setError(`No conversion options are currently available for .${extension} files.`);
      })
      .catch(() => {
        setFormats([]);
        setTarget("");
        setError("Could not connect to Convertly. Make sure the backend is running and try again.");
      })
      .finally(() => setLoadingFormats(false));
  }, [file]);

  const selectFile = (selected) => {
    if (!selected) return;
    setError("");
    setComplete(false);
    setFile(selected);
  };

  const onDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    selectFile(event.dataTransfer.files?.[0]);
  };

  const convert = async () => {
    if (!file || !target || converting) return;
    setConverting(true);
    setError("");
    setComplete(false);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("target", target);
      const response = await fetch("/api/convert", { method: "POST", body });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Conversion failed. Please try again.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${file.name.replace(/\.[^.]+$/, "")}.${target}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setComplete(true);
    } catch (conversionError) {
      setError(conversionError.message);
    } finally {
      setConverting(false);
    }
  };

  const reset = () => {
    setFile(null);
    setFormats([]);
    setTarget("");
    setError("");
    setComplete(false);
    if (inputRef.current) inputRef.current.value = "";
  };
  const selectedFormat = formats.find((format) => format.id === target);

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Convertly home">
          <span className="brand-mark"><ArrowLeftRight size={19} strokeWidth={2.5} /></span>
          <span>convertly<span className="brand-dot">.</span></span>
        </a>
        <nav className={`nav-links ${menuOpen ? "nav-open" : ""}`}>
          <a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a>
          <a href="#features" onClick={() => setMenuOpen(false)}>Why Convertly</a>
        </nav>
        <div className="header-right">
          <span className="secure-label"><LockKeyhole size={13} /> Private & secure</span>
          <button className="menu-toggle" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">
            {menuOpen ? <X size={21} /> : <Menu size={21} />}
          </button>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-sparkle"><Sparkles size={13} /></span> YOUR FILES, YOUR WAY</div>
            <h1>Everything converts.<br /><span>Nothing gets in your way.</span></h1>
            <p className="hero-description">Documents, images, and more. Drop in a file, choose the format you need, and let’s make it happen.</p>
            <div className="trust-row"><span><ShieldCheck size={16} /> Files stay private</span><i /><span>No account needed</span><i /><span>Up to 50 MB</span></div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="orbit orbit-one"></div><div className="orbit orbit-two"></div>
            <div className="art-file art-file-back"><FileImage size={24} /></div>
            <div className="art-file art-file-top"><FileText size={23} /></div>
            <div className="art-center"><ArrowLeftRight size={39} strokeWidth={1.7} /></div>
            <div className="art-file art-file-bottom"><FileType2 size={22} /></div>
            <div className="art-sparkle sparkle-one">✦</div><div className="art-sparkle sparkle-two">✧</div>
          </div>
        </section>

        <section className="workspace-wrap" aria-label="File conversion">
          <div className={`workspace ${dragging ? "workspace-dragging" : ""}`}>
            <div className="workspace-heading">
              <div><span className="step-count">01</span><h2>Start with a file</h2></div>
              {file && <button className="text-button" onClick={reset}><X size={15} /> Clear</button>}
            </div>
            {!file ? (
              <div
                className="dropzone"
                onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
                onKeyDown={(event) => event.key === "Enter" && inputRef.current?.click()}
                role="button"
                tabIndex={0}
                aria-label="Upload or drop a file"
              >
                <input ref={inputRef} type="file" hidden onChange={(event) => selectFile(event.target.files?.[0])} />
                <div className="upload-icon"><CloudUpload size={27} strokeWidth={1.8} /></div>
                <div className="drop-copy"><strong>Drop your file here</strong><span>or <b>browse files</b> from your device</span></div>
                <div className="upload-meta"><span className="meta-icon"><File size={13} /></span> PDFs, docs, spreadsheets & images <i /> Max 50 MB</div>
              </div>
            ) : (
              <div className="file-selected">
                <div className="selected-file-icon"><FileText size={22} /></div>
                <div className="selected-file-details"><strong title={file.name}>{file.name}</strong><span>{fileSize(file.size)} · {file.name.split(".").pop().toUpperCase()} file</span></div>
                <button className="remove-file" onClick={reset} aria-label="Remove file"><X size={17} /></button>
              </div>
            )}

            <div className={`step-two ${file ? "step-active" : ""}`}>
              <div className="workspace-heading output-heading">
                <div><span className="step-count">02</span><h2>Choose your output</h2></div>
                <span className="format-hint"><CircleHelp size={14} /> Options depend on your file</span>
              </div>
              <div className="output-select">
                <div className={`format-picker ${!formats.length ? "picker-disabled" : ""}`}>
                  <span className="format-label">Convert to</span>
                  <select value={target} onChange={(event) => { setTarget(event.target.value); setComplete(false); }} disabled={!formats.length || loadingFormats}>
                    {!formats.length && <option value="">{loadingFormats ? "Finding formats…" : "Choose a file first"}</option>}
                    {formats.map((format) => <option key={format.id} value={format.id}>{format.label}</option>)}
                  </select>
                  <ChevronDown className="select-chevron" size={17} />
                </div>
                <div className="convert-arrow"><ArrowRight size={19} /></div>
                <div className="format-preview">
                  <span className="format-label">Your new file</span>
                  <div className="format-value">{selectedFormat ? <><span className="format-pill">{selectedFormat.extension.toUpperCase()}</span><strong>{file?.name.replace(/\.[^.]+$/, "")}.{target}</strong></> : <span className="format-placeholder">Your converted file appears here</span>}</div>
                </div>
              </div>
              {error && <div className="notice notice-error" role="alert">{error}</div>}
              {complete && <div className="notice notice-success" role="status"><Check size={16} /> All done! Your converted file has been downloaded.</div>}
              <button className="convert-button" onClick={convert} disabled={!file || !target || converting || loadingFormats}>
                {converting ? <><span className="spinner" /> Converting your file…</> : <>Convert file <ArrowDown size={17} /></>}
              </button>
              <div className="processing-note"><LockKeyhole size={13} /> Your files are processed securely and deleted after conversion.</div>
            </div>
          </div>
          <div className="under-workspace"><span className="under-icon"><ShieldCheck size={16} /></span> No sign-up. No surprises. Just a better way to convert files.</div>
        </section>

        <section id="how-it-works" className="how-section">
          <div className="section-intro"><span className="eyebrow">THREE EASY STEPS</span><h2>From here to there,<br /><span>without the headache.</span></h2></div>
          <div className="steps-grid">
            <article className="step-card"><div className="step-illustration upload-illustration"><CloudUpload size={25} /><span className="mini-file">PDF</span></div><span className="card-number">01</span><h3>Drop it in</h3><p>Choose any file from your device. No account or setup required.</p></article>
            <article className="step-card"><div className="step-illustration choose-illustration"><span>PDF</span><ArrowLeftRight size={17} /><span>JPG</span></div><span className="card-number">02</span><h3>Pick a format</h3><p>See the conversion options available for your file, all in one place.</p></article>
            <article className="step-card"><div className="step-illustration done-illustration"><Check size={27} /></div><span className="card-number">03</span><h3>Get it done</h3><p>Convert and download. Your upload is deleted when processing finishes.</p></article>
          </div>
        </section>

        <section className="feature-strip" id="features">
          <div className="feature-title"><span className="eyebrow">MADE FOR THE WAY YOU WORK</span><h2>Simple by design.<br />Thoughtful by nature.</h2></div>
          <div className="feature-item"><div className="feature-icon purple"><ShieldCheck size={19} /></div><div><h3>Private from the start</h3><p>Files are handled for conversion, then automatically removed.</p></div></div>
          <div className="feature-item"><div className="feature-icon mint"><Sparkles size={19} /></div><div><h3>Only useful options</h3><p>Conversion choices adapt to the file you actually uploaded.</p></div></div>
          <div className="feature-item"><div className="feature-icon peach"><ArrowLeftRight size={19} /></div><div><h3>No unnecessary steps</h3><p>Get a clear path from the original file to your new format.</p></div></div>
        </section>
      </main>

      <footer className="footer">
        <a className="brand footer-brand" href="#"><span className="brand-mark"><ArrowLeftRight size={17} strokeWidth={2.5} /></span><span>convertly<span className="brand-dot">.</span></span></a>
        <span>File conversion, made easy.</span>
        <a className="footer-github" href="https://github.com/Jaswanthna/convertly" target="_blank" rel="noreferrer"><Github size={15} /> Built with care</a>
      </footer>
    </div>
  );
}
