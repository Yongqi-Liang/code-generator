"use client";

import { useMemo } from "react";
import { code128Widths } from "@/lib/code128";

function Barcode({ value }: { value: string }) {
  const { rects, total } = useMemo(() => {
    const widths = code128Widths(value);
    const rects: { x: number; w: number }[] = [];
    let x = 0;
    widths.forEach((w, i) => {
      if (i % 2 === 1) {
        rects.push({ x, w });
      }
      x += w;
    });
    return { rects, total: x };
  }, [value]);

  const height = 56;

  return (
    <div className="barcode-item">
      <svg
        className="barcode-svg"
        viewBox={`0 0 ${total} ${height}`}
        role="img"
        aria-label={value}
      >
        {rects.map((rect, i) => (
          <rect key={i} x={rect.x} y="0" width={rect.w} height={height} fill="#111" />
        ))}
      </svg>
      <div className="barcode-text">{value}</div>
    </div>
  );
}

export function BarcodeArea({ codes }: { codes: string[] }) {
  if (codes.length === 0) {
    return null;
  }

  return (
    <section className="barcode-area">
      <h2>条码</h2>
      <p className="hint">共 {codes.length} 个码，不分包装级别</p>
      <div className="barcode-grid">
        {codes.map((code) => (
          <Barcode key={code} value={code} />
        ))}
      </div>
    </section>
  );
}
