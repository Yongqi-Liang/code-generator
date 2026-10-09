"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  defaultCartonItemRef,
  generateGs1,
  loadCounters,
  parseCompanyItem,
  parseGs1Cascade,
  resetGs1Counters,
  type Gs1Counters,
  type Gs1HistoryItem,
} from "@/lib/gs1";

function pad(n: number, len: number) {
  return String(n).padStart(len, "0");
}

function addMonthsMinusOne(madeDate: string, months: number) {
  const [y, m, d] = madeDate.split("-").map(Number);
  const dt = new Date(y, m - 1 + months, d);
  dt.setDate(dt.getDate() - 1);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1, 2)}-${pad(dt.getDate(), 2)}`;
}

export type Gs1Generated = {
  xml: string;
  name: string;
  codes: string[];
};

type Props = {
  onGenerated: (result: Gs1Generated) => void;
};

export function Gs1Panel({ onGenerated }: Props) {
  const [lotNo, setLotNo] = useState("GS191701");
  const [companyItem, setCompanyItem] = useState("69241476.00074");
  const [cartonItemRef, setCartonItemRef] = useState("00075");
  const [madeDate, setMadeDate] = useState("2023-07-20");
  const [validMonths, setValidMonths] = useState(36);
  const [cascade, setCascade] = useState("1:2:5");
  const [cartonCount, setCartonCount] = useState(1);
  const [cartonPrefix, setCartonPrefix] = useState<"82" | "86">("86");
  const [error, setError] = useState("");
  const [counters, setCounters] = useState<Gs1Counters | null>(null);

  useEffect(() => {
    setCounters(loadCounters());
  }, []);

  const expireDate = useMemo(
    () => addMonthsMinusOne(madeDate, Number(validMonths) || 12),
    [madeDate, validMonths]
  );

  const autoCartonRef = useMemo(() => {
    try {
      return defaultCartonItemRef(parseCompanyItem(companyItem).itemRef);
    } catch {
      return "00075";
    }
  }, [companyItem]);

  const ratioHint = useMemo(() => {
    try {
      const r = parseGs1Cascade(cascade);
      const boxes = cartonCount * r.midsPerCarton * r.boxesPerMid;
      return `${cartonCount} 大箱 × ${r.midsPerCarton} 中包 × ${r.boxesPerMid} 小盒 = ${boxes} 小盒`;
    } catch {
      return "格式 1:中包数:小盒数";
    }
  }, [cascade, cartonCount]);

  function onGenerate(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const result = generateGs1({
        lotNo: lotNo.trim(),
        companyItem: companyItem.trim(),
        cartonItemRef: (cartonItemRef || autoCartonRef).trim(),
        madeDate,
        expireDate,
        cascade: cascade.trim(),
        cartonCount,
        cartonPrefix,
      });
      setCounters(result.counters);
      onGenerated({
        xml: result.xml,
        name: result.filename,
        codes: result.codes,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function onResetCounters() {
    if (!confirm("将清空 GS1 序号与历史记录（可能导致与已下发文件号重复）。确定？")) {
      return;
    }
    setCounters(resetGs1Counters());
  }

  const history: Gs1HistoryItem[] = counters?.history || [];

  return (
    <div>
      <form onSubmit={onGenerate}>
        <div className="grid">
          <label>
            批号 LOTNO
            <input value={lotNo} onChange={(e) => setLotNo(e.target.value)} required />
          </label>
          <label>
            物料号（公司前缀.小盒物料）
            <input
              value={companyItem}
              onChange={(e) => setCompanyItem(e.target.value)}
              required
              placeholder="69241476.00074"
            />
            <span className="hint">小盒 EPC：urn:epc:id:sgtin:此前缀.小盒码</span>
          </label>
          <label>
            大箱物料号（5位）
            <input
              value={cartonItemRef}
              onChange={(e) => setCartonItemRef(e.target.value)}
              placeholder={autoCartonRef}
            />
            <span className="hint">默认小盒+1；中包自动为指示符2（如 20074）</span>
          </label>
          <label>
            生产日期 DATMF
            <input type="date" value={madeDate} onChange={(e) => setMadeDate(e.target.value)} required />
          </label>
          <label>
            有效期（月）→ DATEX
            <input
              type="number"
              min={1}
              value={validMonths}
              onChange={(e) => setValidMonths(Number(e.target.value))}
            />
            <span className="hint">失效日期 {expireDate}</span>
          </label>
          <label>
            包装比例
            <input value={cascade} onChange={(e) => setCascade(e.target.value)} required />
            <span className="hint">{ratioHint}</span>
          </label>
          <label>
            大箱数量
            <input
              type="number"
              min={1}
              max={99}
              value={cartonCount}
              onChange={(e) => setCartonCount(Number(e.target.value))}
            />
          </label>
          <label>
            大箱码前缀
            <select
              value={cartonPrefix}
              onChange={(e) => setCartonPrefix(e.target.value as "82" | "86")}
            >
              <option value="86">86</option>
              <option value="82">82</option>
            </select>
            <span className="hint">小盒固定 84；码内含生产日期 yyyyMMdd</span>
          </label>
        </div>

        <p className="hint gs1-rules">
          码规则：小盒 <code>84+日期8位+序号10位</code>（20位）；中包{" "}
          <code>日期6位(yyMMdd)+序号6位</code>（12位）；大箱{" "}
          <code>82|86+日期8位+序号10位</code>（20位）。序号存浏览器 localStorage，避免重复。
        </p>

        {error ? <p className="error">{error}</p> : null}

        <div className="actions">
          <button type="submit">生成 GS1 EPCIS XML</button>
          <button type="button" className="ghost" onClick={onResetCounters}>
            重置序号/历史
          </button>
        </div>
      </form>

      {counters ? (
        <p className="hint">
          下次文件序号：{String(counters.fileSeq3 + 1).padStart(3, "0")} /{" "}
          {String(counters.fileSeq6 + 1).padStart(6, "0")}（已记录 {history.length} 次生成）
        </p>
      ) : null}

      {history.length > 0 ? (
        <section className="gs1-history">
          <h2>生成记录</h2>
          <ul>
            {history.slice(0, 20).map((item) => (
              <li key={item.filename + item.at}>
                <code>{item.filename}</code>
                <span className="hint">
                  {" "}
                  箱{item.cartonCount}/中{item.midCount}/盒{item.boxCount}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
