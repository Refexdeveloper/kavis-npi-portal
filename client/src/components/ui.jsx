import { useEffect } from "react";
import { createPortal } from "react-dom";

export function Box({ title, children, tools, type = "default", footer }) {
  return (
    <div className={`box box-${type}`}>
      {(title || tools) ? (
        <div className="box-header">
          {title ? <h3 className="box-title">{title}</h3> : <span />}
          {tools ? <div className="box-tools">{tools}</div> : null}
        </div>
      ) : null}
      <div className="box-body">{children}</div>
      {footer ? <div className="box-footer">{footer}</div> : null}
    </div>
  );
}

export function Field({ label, children, required, wide, full, hint }) {
  const cls = ["rm-field", wide ? "rm-field--wide" : "", full ? "rm-field--full" : ""].filter(Boolean).join(" ");
  return (
    <div className={cls}>
      <label className={required ? "required" : undefined}>{label}</label>
      {children}
      {hint ? <span className="text-muted" style={{ display: "block", fontSize: 12, marginTop: 4 }}>{hint}</span> : null}
    </div>
  );
}

export function Kpi({ label, value, hint, icon, tone, active, onClick }) {
  const className = `rm-kpi${tone ? ` rm-kpi--${tone}` : ""}${active ? " is-active" : ""}${onClick ? "" : " is-static"}`;
  const inner = (
    <>
      <span className="rm-kpi__label">{label}</span>
      <span className="rm-kpi__value">{value}</span>
      {hint ? <span className="rm-kpi__hint">{hint}</span> : null}
      {icon ? <span className="rm-kpi__icon" aria-hidden><i className={`fas ${icon}`} /></span> : null}
    </>
  );
  if (!onClick) return <div className={className}>{inner}</div>;
  return (
    <button type="button" className={className} onClick={onClick}>
      {inner}
    </button>
  );
}

function useEscape(onClose) {
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
}

export function Modal({ title, onClose, children, wide, footer }) {
  useEscape(onClose);
  return createPortal(
    <div className="rm-modal-overlay" onClick={onClose}>
      <div className={`rm-modal${wide ? " rm-modal--wide" : ""}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="rm-modal__head">
          <h3>{title}</h3>
          <button type="button" className="rm-modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="rm-modal__body">{children}</div>
        {footer ? <div className="rm-modal__foot">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export function EmptyState({ icon = "fa-inbox", title, hint }) {
  return (
    <div style={{ textAlign: "center", padding: "40px 12px", color: "var(--color-muted)" }}>
      <i className={`fas ${icon}`} style={{ fontSize: "1.6rem", marginBottom: 10, display: "block" }} aria-hidden="true" />
      <p style={{ margin: 0, fontWeight: 700, color: "#334155" }}>{title}</p>
      {hint ? <span style={{ fontSize: "0.85rem" }}>{hint}</span> : null}
    </div>
  );
}
