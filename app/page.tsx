"use client";

import { FormEvent, useMemo, useState } from "react";
import { BarcodeArea } from "@/components/BarcodeArea";
import { Gs1Panel } from "@/components/Gs1Panel";

type Tab = "relation" | "inout" | "gs1";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function pad(n: number, len: number) {
  return String(n).padStart(len, "0");
}

function nowStamp() {
  const d = new Date();
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;
  const time = `${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}:${pad(d.getSeconds(), 2)}`;
  const file =
    `${d.getFullYear()}${pad(d.getMonth() + 1, 2)}${pad(d.getDate(), 2)}` +
    `${pad(d.getHours(), 2)}${pad(d.getMinutes(), 2)}${pad(d.getSeconds(), 2)}`;
  return { actDate: `${date} ${time}`, fileStamp: file };
}

function xmlAttr(name: string, value: string) {
  if (!value) {
    return "";
  }
  return ` ${name}="${escapeXml(value)}"`;
}

type BillAction = "WareHouseIn" | "WareHouseOut";

const BILL_DETAILS: { label: string; code: string; action: BillAction }[] = [
  { label: "销售出库", code: "SalesWareHouseOut", action: "WareHouseOut" },
  { label: "采购入库", code: "PurchaseWareHouseIn", action: "WareHouseIn" },
  { label: "销毁出库", code: "DestoryWareHouseOut", action: "WareHouseOut" },
  { label: "抽检出库", code: "CheckWareHouseOut", action: "WareHouseOut" },
  { label: "退货入库", code: "ReturnWareHouseIn", action: "WareHouseIn" },
  { label: "生产入库", code: "ProduceWareHouseIn", action: "WareHouseIn" },
  { label: "调拨入库", code: "AllocateWareHouseIn", action: "WareHouseIn" },
  { label: "退货出库", code: "ReturnWareHouseOut", action: "WareHouseOut" },
  { label: "调拨出库", code: "AllocateWareHouseOut", action: "WareHouseOut" },
  { label: "返工出库", code: "ReworkWareHouseOut", action: "WareHouseOut" },
  { label: "直调出库", code: "DirectTransferWareHouseOut", action: "WareHouseOut" },
];

function parseTraceCodes(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function digits(value: string) {
  return value.replace(/\D/g, "");
}

function ymdParts(date: string) {
  const [y, m, d] = date.split("-");
  return { y, m, d };
}

function addMonthsMinusOneDay(madeDate: string, months: number) {
  const [y, m, d] = madeDate.split("-").map(Number);
  const dt = new Date(y, m - 1 + months, d);
  dt.setDate(dt.getDate() - 1);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1, 2)}-${pad(dt.getDate(), 2)}`;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** 20位码：单号10位 + 箱序号5位 + 盒序号5位（箱码盒序号为00000） */
function orderPrefix(orderNo: string) {
  const d = digits(orderNo);
  return d.length >= 10 ? d.slice(0, 10) : d.padStart(10, "0");
}

function parseBoxesPerCarton(cascade: string) {
  const matched = cascade.trim().match(/:(\d+)\s*$/);
  const n = matched ? Number(matched[1]) : 9;
  return Math.min(99999, Math.max(1, n || 9));
}

function makeCode(orderNo: string, carton: number, box: number) {
  return `${orderPrefix(orderNo)}${pad(carton, 5)}${pad(box, 5)}`;
}

function buildCodes(orderNo: string, cartonCount: number, boxesPerCarton: number) {
  const cartons: string[] = [];
  const boxes: { code: string; parent: string }[] = [];
  for (let i = 1; i <= cartonCount; i += 1) {
    const cartonCode = makeCode(orderNo, i, 0);
    cartons.push(cartonCode);
    for (let j = 1; j <= boxesPerCarton; j += 1) {
      boxes.push({ code: makeCode(orderNo, i, j), parent: cartonCode });
    }
  }
  return { cartons, boxes };
}

function flattenCodes(cartons: string[], boxes: { code: string; parent: string }[]) {
  return [...cartons, ...boxes.map((item) => item.code)];
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("relation");
  const [preview, setPreview] = useState("");
  const [previewName, setPreviewName] = useState("");
  const [previewKind, setPreviewKind] = useState<"relation" | "inout" | "gs1" | "">("");
  const [barcodeCodes, setBarcodeCodes] = useState<string[]>([]);

  const [orderNo, setOrderNo] = useState("20260918021");
  const [batchNo, setBatchNo] = useState("TEST26091821");
  const [productCode, setProductCode] = useState("9999999");
  const [subTypeNo, setSubTypeNo] = useState("9999999999");
  const [bizDate, setBizDate] = useState(today());
  const [cascade, setCascade] = useState("1:9");
  const [packageSpec, setPackageSpec] = useState("盒1片");
  const [comment, setComment] = useState("");
  const [madeDate, setMadeDate] = useState("2026-09-16");
  const [validMonths, setValidMonths] = useState(12);
  const [workshop, setWorkshop] = useState("TEST车间");
  const [lineName, setLineName] = useState("1");
  const [lineManager, setLineManager] = useState("TESTER");
  const [cartonCount, setCartonCount] = useState(1);

  const [billNo, setBillNo] = useState("187419027");
  const [billAction, setBillAction] = useState<BillAction>("WareHouseIn");
  const [detailCode, setDetailCode] = useState("PurchaseWareHouseIn");
  const [ownerCorp, setOwnerCorp] = useState("");
  const [fromCorp, setFromCorp] = useState("");
  const [toCorp, setToCorp] = useState("");
  const [traceCodes, setTraceCodes] = useState("");

  const detailOptions = useMemo(
    () => BILL_DETAILS.filter((item) => item.action === billAction),
    [billAction]
  );

  const validateDate = useMemo(
    () => addMonthsMinusOneDay(madeDate, Number(validMonths) || 12),
    [madeDate, validMonths]
  );

  function packedCodes() {
    return buildCodes(
      orderNo,
      Math.min(99, Math.max(1, cartonCount)),
      parseBoxesPerCarton(cascade)
    );
  }

  function relationXml(cartons: string[], boxes: { code: string; parent: string }[]) {

    const cartonLines = cartons
      .map((code) => `                    <Code curCode="${code}" packLayer="2" parentCode="" flag="0"/>`)
      .join("\n");
    const boxLines = boxes
      .map(
        (item) =>
          `                    <Code curCode="${item.code}" packLayer="1" parentCode="${item.parent}" flag="0"/>`
      )
      .join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" noNamespaceSchemaLocation="关联关系XML Schema-3.0.xsd" License="">
    <Events version="3.0">
        <Event name="RelationCreate">
            <Relation productCode="${escapeXml(productCode)}" subTypeNo="${escapeXml(subTypeNo)}" cascade="${escapeXml(cascade)}" packageSpec="${escapeXml(packageSpec)}" comment="${escapeXml(comment)}">
                <Batch batchNo="${escapeXml(batchNo)}" madeDate="${madeDate}" validateDate="${validateDate}" workshop="${escapeXml(workshop)}" lineName="${escapeXml(lineName)}" lineManager="${escapeXml(lineManager)}">
${cartonLines}

${boxLines}
                </Batch>
            </Relation>
        </Event>
    </Events>
</Document>
`;
  }

  function inoutXml(actDate: string) {
    const codes = parseTraceCodes(traceCodes);
    const dataLines = codes
      .map((code) => {
        const owner = xmlAttr("OwnerCorpID", ownerCorp);
        const partner =
          billAction === "WareHouseIn"
            ? xmlAttr("FromCorpID", fromCorp)
            : xmlAttr("ToCorpID", toCorp);
        return `        <Data Code="${escapeXml(code)}" Actor="高松" ActDate="${actDate}" CorpOrderID="${escapeXml(billNo)}"${owner} WrongCode="false"${partner}/>`;
      })
      .join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<UploadBillInfo xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" Version="3.0">
  <Events>
    <Event Name="${escapeXml(detailCode)}" MainAction="${billAction}">
      <DataField>
${dataLines}
      </DataField>
    </Event>
  </Events>
</UploadBillInfo>
`;
  }

  function onGenerateRelation(e: FormEvent) {
    e.preventDefault();
    const date = bizDate || today();
    const { y, m, d } = ymdParts(date);
    const { cartons, boxes } = packedCodes();
    const xml = relationXml(cartons, boxes);
    setPreview(xml);
    setPreviewKind("relation");
    setPreviewName(`${orderNo}_${batchNo}_${subTypeNo}_${y}_${m}_${d} 1_1.xml`);
    setBarcodeCodes(flattenCodes(cartons, boxes));
  }

  function onDownloadRelationFile() {
    if (!preview || previewKind !== "relation") {
      return;
    }
    downloadText(previewName, preview);
  }

  function onGenerateInOut(e: FormEvent) {
    e.preventDefault();
    const { actDate, fileStamp } = nowStamp();
    const xml = inoutXml(actDate);
    setPreview(xml);
    setPreviewKind("inout");
    setPreviewName(`${detailCode}_0${billNo}_${fileStamp}.xml`);
    setBarcodeCodes(parseTraceCodes(traceCodes));
  }

  function onDownloadInOutFile() {
    if (!preview || previewKind !== "inout") {
      return;
    }
    downloadText(previewName, preview);
  }

  return (
    <main>
      <h1>追溯码生成器</h1>
      <p className="subtitle">按表单字段组装关联关系 XML、出入库 XML 和 GS1 EPCIS XML。</p>

      <div className="tabs">
        <button className={tab === "relation" ? "active" : ""} onClick={() => setTab("relation")} type="button">
          ESC关联关系
        </button>
        <button className={tab === "inout" ? "active" : ""} onClick={() => setTab("inout")} type="button">
          出入库
        </button>
        <button className={tab === "gs1" ? "active" : ""} onClick={() => setTab("gs1")} type="button">
          GS1码
        </button>
      </div>

      {tab === "relation" ? (
        <form onSubmit={onGenerateRelation}>
          <div className="grid">
            <label>
              关联关系单号
              <input value={orderNo} onChange={(e) => setOrderNo(e.target.value)} required />
              <span className="hint">码前10位取单号数字，例如 2026093001</span>
            </label>
            <label>
              批号
              <input value={batchNo} onChange={(e) => setBatchNo(e.target.value)} required />
            </label>
            <label>
              产品编码
              <input value={productCode} onChange={(e) => setProductCode(e.target.value)} />
            </label>
            <label>
              子类编码
              <input value={subTypeNo} onChange={(e) => setSubTypeNo(e.target.value)} required />
            </label>
            <label>
              年月日
              <input type="date" value={bizDate} onChange={(e) => setBizDate(e.target.value)} />
              <span className="hint">不填则按当天</span>
            </label>
            <label>
              包装比例
              <input value={cascade} onChange={(e) => setCascade(e.target.value)} />
              <span className="hint">格式 1:N，N 为每箱盒数，例如 1:9</span>
            </label>
            <label>
              包装规格
              <input value={packageSpec} onChange={(e) => setPackageSpec(e.target.value)} />
            </label>
            <label>
              备注
              <input value={comment} onChange={(e) => setComment(e.target.value)} />
            </label>
            <label>
              生产日期
              <input type="date" value={madeDate} onChange={(e) => setMadeDate(e.target.value)} required />
            </label>
            <label>
              有效期（月）
              <input
                type="number"
                min={1}
                value={validMonths}
                onChange={(e) => setValidMonths(Number(e.target.value))}
              />
              <span className="hint">默认 12 个月，失效日期 {validateDate}</span>
            </label>
            <label>
              车间名
              <input value={workshop} onChange={(e) => setWorkshop(e.target.value)} />
            </label>
            <label>
              产线名称
              <input value={lineName} onChange={(e) => setLineName(e.target.value)} />
            </label>
            <label>
              产线经理
              <input value={lineManager} onChange={(e) => setLineManager(e.target.value)} />
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
          </div>
          <div className="actions">
            <button type="submit">生成关联关系 XML</button>
          </div>
        </form>
      ) : null}

      {tab === "inout" ? (
        <form onSubmit={onGenerateInOut}>
          <div className="grid">
            <label>
              出入库单号
              <input value={billNo} onChange={(e) => setBillNo(e.target.value)} required />
            </label>
            <label>
              出入库类型
              <select
                value={billAction}
                onChange={(e) => {
                  const next = e.target.value as BillAction;
                  setBillAction(next);
                  const first = BILL_DETAILS.find((item) => item.action === next);
                  if (first) {
                    setDetailCode(first.code);
                  }
                }}
              >
                <option value="WareHouseIn">入库</option>
                <option value="WareHouseOut">出库</option>
              </select>
            </label>
            <label>
              出入库详细类型
              <select value={detailCode} onChange={(e) => setDetailCode(e.target.value)}>
                {detailOptions.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.label}
                  </option>
                ))}
              </select>
              <span className="hint">{detailCode}</span>
            </label>
            <label>
              货主单位
              <input value={ownerCorp} onChange={(e) => setOwnerCorp(e.target.value)} />
              <span className="hint">空则不生成 OwnerCorpID</span>
            </label>
            {billAction === "WareHouseIn" ? (
              <label>
                发货单位编码
                <input value={fromCorp} onChange={(e) => setFromCorp(e.target.value)} />
                <span className="hint">空则不生成 FromCorpID</span>
              </label>
            ) : (
              <label>
                收货单位编码
                <input value={toCorp} onChange={(e) => setToCorp(e.target.value)} />
                <span className="hint">空则不生成 ToCorpID</span>
              </label>
            )}
            <label className="span-2">
              追溯码
              <textarea
                value={traceCodes}
                onChange={(e) => setTraceCodes(e.target.value)}
                placeholder={"每行一个码\n86500120002341409140"}
                required
              />
            </label>
          </div>
          <div className="actions">
            <button type="submit">生成出入库 XML</button>
          </div>
        </form>
      ) : null}

      {tab === "gs1" ? (
        <Gs1Panel
          onGenerated={({ xml, name, codes }) => {
            setPreview(xml);
            setPreviewName(name);
            setPreviewKind("gs1");
            setBarcodeCodes(codes);
          }}
        />
      ) : null}

      {preview ? (
        <section className="xml-area">
          <div className="section-head">
            <h2>XML 内容</h2>
            <button
              type="button"
              className="ghost"
              onClick={() => navigator.clipboard.writeText(preview)}
            >
              复制
            </button>
          </div>
          <pre className="preview">{preview}</pre>
          {previewKind === "relation" ? (
            <div className="actions">
              <button type="button" className="primary" onClick={onDownloadRelationFile}>
                关联关系 XML 下载
              </button>
            </div>
          ) : null}
          {previewKind === "inout" ? (
            <div className="actions">
              <button type="button" className="primary" onClick={onDownloadInOutFile}>
                出入库 XML 下载
              </button>
            </div>
          ) : null}
          {previewKind === "gs1" ? (
            <div className="actions">
              <button
                type="button"
                className="primary"
                onClick={() => downloadText(previewName, preview)}
              >
                GS1 XML 下载
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      <BarcodeArea codes={barcodeCodes} />
    </main>
  );
}
