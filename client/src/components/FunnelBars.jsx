export default function FunnelBars({ items, onSelect }) {
  const stack = items.length > 1;
  const n = Math.max(items.length, 1);
  return (
    <div className={`sf-funnel${stack ? " sf-funnel--stack" : " sf-funnel--card"}`}>
      {items.map((item, i) => {
        const top = stack ? 100 - (i / n) * 40 : 100;
        const bot = stack ? 100 - ((i + 1) / n) * 40 : 100;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect?.(item)}
            className="sf-funnel__row"
            style={{ "--top": top, "--bot": bot }}
          >
            <div className="sf-funnel__copy">
              <div className="sf-funnel__title">{item.title}</div>
              {item.subtitle ? <div className="sf-funnel__sub">{item.subtitle}</div> : null}
            </div>
            <div className="sf-funnel__track">
              <span className="sf-funnel__bar" style={{ background: item.color }} />
            </div>
            <div className="sf-funnel__nums">
              <div className="sf-funnel__value">{item.value}</div>
              {item.meta ? <div className="sf-funnel__meta">{item.meta}</div> : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export const FUNNEL_COLORS = {
  rfi: "#1f8a5f",
  rfp: "#c2701c",
  agreement: "#1e5f74",
  completed: "#059669",
  onHold: "#7c6fb0",
  dropped: "#48494A",
};
