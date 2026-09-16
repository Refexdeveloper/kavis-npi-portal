import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { fetchDocumentBlob, triggerDownload } from "../api/client.js";

function previewKind(contentType = "", filename = "") {
  const ct = (contentType || "").toLowerCase();
  const name = (filename || "").toLowerCase();
  if (ct.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name)) return "image";
  if (ct.includes("pdf") || name.endsWith(".pdf")) return "pdf";
  if (ct.startsWith("text/") || /\.(txt|csv|log|md)$/i.test(name)) return "text";
  return "other";
}

/**
 * In-app document preview (PDF / images / text). Download is optional from here.
 */
export default function DocumentPreview({ doc, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [blob, setBlob] = useState(null);
  const [url, setUrl] = useState("");
  const [contentType, setContentType] = useState("");
  const [textBody, setTextBody] = useState("");

  const filename = doc.originalFilename || doc.original_filename || "document";
  const kind = previewKind(contentType || doc.mimeType || doc.mime_type, filename);

  useEffect(() => {
    let revoked = false;
    let objectUrl = "";
    setLoading(true);
    setError("");
    fetchDocumentBlob(doc.id)
      .then(async (res) => {
        if (revoked) {
          URL.revokeObjectURL(res.url);
          return;
        }
        objectUrl = res.url;
        setBlob(res.blob);
        setUrl(res.url);
        setContentType(res.contentType || "");
        const k = previewKind(res.contentType, filename);
        if (k === "text") {
          const text = await res.blob.text();
          if (!revoked) setTextBody(text.slice(0, 200_000));
        }
      })
      .catch((err) => {
        if (!revoked) setError(err.message || "Could not open document");
      })
      .finally(() => {
        if (!revoked) setLoading(false);
      });

    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [doc.id, filename]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  function download() {
    if (!blob) return;
    triggerDownload(blob, filename);
  }

  return createPortal(
    <div className="doc-preview-overlay" onClick={onClose}>
      <div className="doc-preview" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Preview ${filename}`}>
        <header className="doc-preview__head">
          <div>
            <p className="doc-preview__eyebrow">Document preview</p>
            <h2 title={filename}>{filename}{doc.version != null ? <span> · v{doc.version}</span> : null}</h2>
          </div>
          <div className="doc-preview__actions">
            <button type="button" className="btn btn-theme btn-sm" disabled={!blob || loading} onClick={download}>
              <i className="fas fa-download" /> Download
            </button>
            <button type="button" className="doc-preview__close" onClick={onClose} aria-label="Close">×</button>
          </div>
        </header>
        <div className="doc-preview__body">
          {loading ? (
            <div className="doc-preview__state"><i className="fas fa-spinner fa-spin" /> Loading preview…</div>
          ) : error ? (
            <div className="doc-preview__state doc-preview__state--err"><i className="fas fa-circle-exclamation" /> {error}</div>
          ) : kind === "pdf" ? (
            <iframe className="doc-preview__frame" title={filename} src={url} />
          ) : kind === "image" ? (
            <div className="doc-preview__image-wrap">
              <img src={url} alt={filename} />
            </div>
          ) : kind === "text" ? (
            <pre className="doc-preview__text">{textBody}</pre>
          ) : (
            <div className="doc-preview__state">
              <i className="fas fa-file-lines" />
              <p>In-browser preview is not available for this file type ({contentType || "unknown"}).</p>
              <p className="text-muted">Use Download to open it in your desktop application.</p>
              <button type="button" className="btn btn-theme" onClick={download} disabled={!blob}>
                <i className="fas fa-download" /> Download file
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
