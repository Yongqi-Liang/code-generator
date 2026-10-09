/** GS1 / EPCIS 码与 XML 生成（对照 sample 样例） */

export type Gs1PackRatio = { midsPerCarton: number; boxesPerMid: number };

export type Gs1Counters = {
  /** 文件名中的 001–999 */
  fileSeq3: number;
  /** 文件名 / HeaderVersion 的 000001–999999 */
  fileSeq6: number;
  /** 小盒日序号（按 dateKey） */
  boxSeqByDate: Record<string, number>;
  /** 中包日序号 */
  midSeqByDate: Record<string, number>;
  /** 大箱日序号 */
  cartonSeqByDate: Record<string, number>;
  /** 已占用序列号（防重） */
  usedSerials: string[];
  history: Gs1HistoryItem[];
};

export type Gs1HistoryItem = {
  at: string;
  lotNo: string;
  filename: string;
  cartonCount: number;
  midCount: number;
  boxCount: number;
  dateKey: string;
};

export type Gs1GenerateInput = {
  lotNo: string;
  /** 如 69241476.00074 */
  companyItem: string;
  /** 大箱物料号后半段，默认小盒 +1，如 00075 */
  cartonItemRef?: string;
  madeDate: string;
  expireDate: string;
  /** 1:2:3 */
  cascade: string;
  cartonCount: number;
  /** 82 或 86 */
  cartonPrefix: "82" | "86";
  readPointSgln?: string;
  packPointSgln?: string;
  senderSgln?: string;
  receiverSgln?: string;
};

export type Gs1Node = {
  kind: "box" | "mid" | "carton";
  serial: string;
  epc: string;
  children?: Gs1Node[];
};

export type Gs1GenerateResult = {
  xml: string;
  filename: string;
  codes: string[];
  tree: Gs1Node[];
  counters: Gs1Counters;
  historyItem: Gs1HistoryItem;
};

const STORAGE_KEY = "gs1-generator-state-v1";
const MAX_USED = 50000;

const DEFAULT_READ = "urn:epc:id:sgln:4086000.00010.0";
const DEFAULT_PACK = "urn:epc:id:sgln:4056044.00000.0";
const DEFAULT_SENDER = "urn:epc:id:sgln:4000699.00000.0";
const DEFAULT_RECEIVER = "urn:epc:id:sgln:4056044.00000.0";

export function defaultCounters(): Gs1Counters {
  return {
    fileSeq3: 0,
    fileSeq6: 0,
    boxSeqByDate: {},
    midSeqByDate: {},
    cartonSeqByDate: {},
    usedSerials: [],
    history: [],
  };
}

export function loadCounters(): Gs1Counters {
  if (typeof window === "undefined") {
    return defaultCounters();
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultCounters();
    }
    const parsed = JSON.parse(raw) as Partial<Gs1Counters>;
    return {
      ...defaultCounters(),
      ...parsed,
      boxSeqByDate: parsed.boxSeqByDate || {},
      midSeqByDate: parsed.midSeqByDate || {},
      cartonSeqByDate: parsed.cartonSeqByDate || {},
      usedSerials: parsed.usedSerials || [],
      history: parsed.history || [],
    };
  } catch {
    return defaultCounters();
  }
}

export function saveCounters(counters: Gs1Counters) {
  if (typeof window === "undefined") {
    return;
  }
  const trimmed: Gs1Counters = {
    ...counters,
    usedSerials: counters.usedSerials.slice(-MAX_USED),
    history: counters.history.slice(0, 100),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

export function clearGs1History() {
  const c = loadCounters();
  c.history = [];
  saveCounters(c);
  return c;
}

export function pad(n: number, len: number) {
  return String(n).padStart(len, "0");
}

export function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** 解析 1:M:B，M=每箱中包数，B=每中包小盒数 */
export function parseGs1Cascade(cascade: string): Gs1PackRatio {
  const parts = cascade
    .trim()
    .split(":")
    .map((p) => Number(p.trim()))
    .filter((n) => Number.isFinite(n));
  if (parts.length < 3) {
    throw new Error("包装比例须为 1:中包数:小盒数，例如 1:2:3");
  }
  const midsPerCarton = Math.min(999, Math.max(1, parts[1] || 1));
  const boxesPerMid = Math.min(999, Math.max(1, parts[2] || 1));
  return { midsPerCarton, boxesPerMid };
}

export function parseCompanyItem(value: string): { company: string; itemRef: string } {
  const m = value.trim().match(/^(\d{6,12})\.(\d{4,6})$/);
  if (!m) {
    throw new Error("物料号格式须为 公司前缀.物料，例如 69241476.00074");
  }
  return { company: m[1], itemRef: m[2].padStart(5, "0").slice(-5) };
}

/** 中包：指示符位改为 2（00074 → 20074） */
export function midItemRef(itemRef: string) {
  const body = itemRef.padStart(5, "0").slice(-5);
  return `2${body.slice(1)}`;
}

/** 大箱默认物料：末位 +1（00074 → 00075） */
export function defaultCartonItemRef(itemRef: string) {
  const n = Number(itemRef);
  if (!Number.isFinite(n)) {
    return itemRef;
  }
  return pad(n + 1, itemRef.length);
}

function ymdCompact(date: string) {
  return date.replaceAll("-", "");
}

function nextSeq(map: Record<string, number>, key: string, max: number) {
  const cur = map[key] || 0;
  const next = cur + 1;
  if (next > max) {
    throw new Error(`日期 ${key} 的序号已超过上限 ${max}，请换日或清零计数`);
  }
  map[key] = next;
  return next;
}

function claimSerial(counters: Gs1Counters, serial: string, used: Set<string>) {
  if (used.has(serial) || counters.usedSerials.includes(serial)) {
    throw new Error(`序列号重复: ${serial}`);
  }
  used.add(serial);
  counters.usedSerials.push(serial);
}

function sgtin(company: string, itemRef: string, serial: string) {
  return `urn:epc:id:sgtin:${company}.${itemRef}.${serial}`;
}

function lgtin(company: string, itemRef: string, lotNo: string) {
  return `urn:epc:class:lgtin:${company}.${itemRef}.${lotNo}`;
}

function randomInstanceId() {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function isoStamp(d = new Date()) {
  return d.toISOString().replace("Z", "") + "Z";
}

function fileTimeParts(d = new Date()) {
  const yyyyMMdd = `${d.getFullYear()}${pad(d.getMonth() + 1, 2)}${pad(d.getDate(), 2)}`;
  const hhmmss = `${pad(d.getHours(), 2)}${pad(d.getMinutes(), 2)}${pad(d.getSeconds(), 2)}`;
  return { yyyyMMdd, hhmmss };
}

/**
 * 码规则（嵌入 8 位日期降低碰撞）：
 * - 小盒 20 位：84 + yyyyMMdd(8) + seq(10)
 * - 中包 12 位：yyMMdd(6) + seq(6)
 * - 大箱 20 位：82|86 + yyyyMMdd(8) + seq(10)
 *
 * EPC 物料分层（对照样例）：
 * - 小盒 company.00074
 * - 中包 company.20074
 * - 大箱 company.00075（可改）
 */
export function generateGs1(input: Gs1GenerateInput, prev?: Gs1Counters): Gs1GenerateResult {
  const counters: Gs1Counters = prev
    ? (JSON.parse(JSON.stringify(prev)) as Gs1Counters)
    : loadCounters();
  const { company, itemRef } = parseCompanyItem(input.companyItem);
  const midRef = midItemRef(itemRef);
  const cartonRef = (input.cartonItemRef || defaultCartonItemRef(itemRef)).padStart(5, "0").slice(-5);
  const { midsPerCarton, boxesPerMid } = parseGs1Cascade(input.cascade);
  const cartonCount = Math.min(99, Math.max(1, input.cartonCount || 1));

  const dateKey = ymdCompact(input.madeDate);
  if (dateKey.length !== 8) {
    throw new Error("生产日期无效");
  }
  const yyMMdd = dateKey.slice(2);
  const used = new Set<string>();

  const tree: Gs1Node[] = [];
  const allCodes: string[] = [];

  for (let c = 0; c < cartonCount; c += 1) {
    const cartonSeq = nextSeq(counters.cartonSeqByDate, dateKey, 9999999999);
    const cartonSerial = `${input.cartonPrefix}${dateKey}${pad(cartonSeq, 10)}`;
    claimSerial(counters, `C:${cartonSerial}`, used);
    const carton: Gs1Node = {
      kind: "carton",
      serial: cartonSerial,
      epc: sgtin(company, cartonRef, cartonSerial),
      children: [],
    };
    allCodes.push(cartonSerial);

    for (let m = 0; m < midsPerCarton; m += 1) {
      const midSeq = nextSeq(counters.midSeqByDate, dateKey, 999999);
      const midSerial = `${yyMMdd}${pad(midSeq, 6)}`;
      claimSerial(counters, `M:${midSerial}`, used);
      const mid: Gs1Node = {
        kind: "mid",
        serial: midSerial,
        epc: sgtin(company, midRef, midSerial),
        children: [],
      };
      allCodes.push(midSerial);

      for (let b = 0; b < boxesPerMid; b += 1) {
        const boxSeq = nextSeq(counters.boxSeqByDate, dateKey, 9999999999);
        const boxSerial = `84${dateKey}${pad(boxSeq, 10)}`;
        claimSerial(counters, `B:${boxSerial}`, used);
        const box: Gs1Node = {
          kind: "box",
          serial: boxSerial,
          epc: sgtin(company, itemRef, boxSerial),
        };
        allCodes.push(boxSerial);
        mid.children!.push(box);
      }
      carton.children!.push(mid);
    }
    tree.push(carton);
  }

  counters.fileSeq3 += 1;
  if (counters.fileSeq3 > 999) {
    throw new Error("文件序号(001-999)已用尽，请重置计数或联系管理员");
  }
  counters.fileSeq6 += 1;
  if (counters.fileSeq6 > 999999) {
    throw new Error("文件序号(000001-999999)已用尽，请重置计数");
  }

  const now = new Date();
  const { yyyyMMdd, hhmmss } = fileTimeParts(now);
  const seq3 = pad(counters.fileSeq3, 3);
  const seq6 = pad(counters.fileSeq6, 6);
  const filename = `${input.lotNo}_${company}.${itemRef}_${yyyyMMdd}-${hhmmss}-${seq3}_${seq6}.xml`;

  const xml = buildEpcisXml({
    input,
    company,
    itemRef,
    midRef,
    cartonRef,
    tree,
    filename,
    headerVersion: seq6,
    now,
  });

  const historyItem: Gs1HistoryItem = {
    at: now.toISOString(),
    lotNo: input.lotNo,
    filename,
    cartonCount: tree.length,
    midCount: tree.reduce((n, t) => n + (t.children?.length || 0), 0),
    boxCount: tree.reduce(
      (n, t) => n + (t.children || []).reduce((m, mid) => m + (mid.children?.length || 0), 0),
      0
    ),
    dateKey,
  };
  counters.history.unshift(historyItem);
  saveCounters(counters);

  return { xml, filename, codes: allCodes, tree, counters, historyItem };
}

type XmlCtx = {
  input: Gs1GenerateInput;
  company: string;
  itemRef: string;
  midRef: string;
  cartonRef: string;
  tree: Gs1Node[];
  filename: string;
  headerVersion: string;
  now: Date;
};

function buildEpcisXml(ctx: XmlCtx) {
  const {
    input,
    company,
    itemRef,
    midRef,
    cartonRef,
    tree,
    filename,
    headerVersion,
    now,
  } = ctx;
  const lot = escapeXml(input.lotNo);
  // 样例语义：DATMF=生产日期，DATEX=有效期
  const datmf = escapeXml(input.madeDate);
  const datex = escapeXml(input.expireDate);
  const readPoint = escapeXml(input.readPointSgln || DEFAULT_READ);
  const packPoint = escapeXml(input.packPointSgln || DEFAULT_PACK);
  const sender = escapeXml(input.senderSgln || DEFAULT_SENDER);
  const receiver = escapeXml(input.receiverSgln || DEFAULT_RECEIVER);
  const created = isoStamp(now);
  const eventTime = created.replace(/\.\d+Z$/, ".000Z");
  const instanceId = randomInstanceId();

  const boxes = tree.flatMap((c) => (c.children || []).flatMap((m) => m.children || []));
  const mids = tree.flatMap((c) => c.children || []);
  const cartons = tree;

  const objAttrs = `        <SAPExtension>
          <ObjAttributes>
            <LOTNO>${lot}</LOTNO>
            <DATEX>${datex}</DATEX>
            <DATMF>${datmf}</DATMF>
          </ObjAttributes>
        </SAPExtension>`;

  function commissioningEmpty(item: string, time: string) {
    return `      <ObjectEvent>
        <eventTime>${time}</eventTime>
        <eventTimeZoneOffset>+08:00</eventTimeZoneOffset>
        <epcList></epcList>
        <action>ADD</action>
        <bizStep>urn:epcglobal:cbv:bizstep:commissioning</bizStep>
        <disposition>urn:epcglobal:cbv:disp:active</disposition>
        <readPoint>
          <id>${readPoint}</id>
        </readPoint>
        <bizLocation>
          <id>${readPoint}</id>
        </bizLocation>
        <extension>
          <quantityList>
            <quantityElement>
              <epcClass>${escapeXml(lgtin(company, item, input.lotNo))}</epcClass>
              <quantity>0</quantity>
            </quantityElement>
          </quantityList>
        </extension>
${objAttrs}
      </ObjectEvent>`;
  }

  function commissioningList(nodes: Gs1Node[], time: string) {
    const epcs = nodes.map((n) => `          <epc>${escapeXml(n.epc)}</epc>`).join("\n");
    return `      <ObjectEvent>
        <eventTime>${time}</eventTime>
        <eventTimeZoneOffset>+08:00</eventTimeZoneOffset>
        <epcList>
${epcs}
        </epcList>
        <action>ADD</action>
        <bizStep>urn:epcglobal:cbv:bizstep:commissioning</bizStep>
        <disposition>urn:epcglobal:cbv:disp:active</disposition>
        <readPoint>
          <id>${readPoint}</id>
        </readPoint>
        <bizLocation>
          <id>${readPoint}</id>
        </bizLocation>
${objAttrs}
      </ObjectEvent>`;
  }

  function aggregation(parent: Gs1Node, children: Gs1Node[], time: string) {
    const epcs = children.map((n) => `          <epc>${escapeXml(n.epc)}</epc>`).join("\n");
    return `      <AggregationEvent>
        <eventTime>${time}</eventTime>
        <eventTimeZoneOffset>+08:00</eventTimeZoneOffset>
        <parentID>${escapeXml(parent.epc)}</parentID>
        <childEPCs>
${epcs}
        </childEPCs>
        <action>ADD</action>
        <bizStep>urn:epcglobal:cbv:bizstep:packing</bizStep>
        <readPoint>
          <id>${packPoint}</id>
        </readPoint>
        <bizLocation>
          <id>${packPoint}</id>
        </bizLocation>
      </AggregationEvent>`;
  }

  const t0 = eventTime;
  const events: string[] = [];

  // 小盒 commissioning
  events.push(commissioningEmpty(itemRef, t0));
  if (boxes.length) {
    events.push(commissioningList(boxes, t0));
  }
  // 中包
  events.push(commissioningEmpty(midRef, t0));
  if (mids.length) {
    events.push(commissioningList(mids, t0));
  }
  // 大箱
  events.push(commissioningEmpty(cartonRef, t0));
  if (cartons.length) {
    events.push(commissioningList(cartons, t0));
  }

  // 聚合：中包←小盒，大箱←中包
  for (const carton of cartons) {
    for (const mid of carton.children || []) {
      if (mid.children?.length) {
        events.push(aggregation(mid, mid.children, t0));
      }
    }
    if (carton.children?.length) {
      events.push(aggregation(carton, carton.children, t0));
    }
  }

  const baseName = filename.replace(/\.xml$/i, "");

  return `<?xml version="1.0" encoding="UTF-8"?>
<ns0:EPCISDocument xmlns:ns0="urn:epcglobal:epcis:xsd:1" schemaVersion="1.1" creationDate="${created}">
  <EPCISHeader>
    <ns1:StandardBusinessDocumentHeader xmlns:ns1="http://www.unece.org/cefact/namespaces/StandardBusinessDocumentHeader">
      <ns1:HeaderVersion>${headerVersion}</ns1:HeaderVersion>
      <ns1:Sender>
        <ns1:Identifier Authority="SGLN">${sender}</ns1:Identifier>
      </ns1:Sender>
      <ns1:Receiver>
        <ns1:Identifier Authority="SGLN">${receiver}</ns1:Identifier>
      </ns1:Receiver>
      <ns1:DocumentIdentification>
        <ns1:Standard>EPCglobal</ns1:Standard>
        <ns1:TypeVersion>1.0</ns1:TypeVersion>
        <ns1:InstanceIdentifier>${instanceId}</ns1:InstanceIdentifier>
        <ns1:Type>Events</ns1:Type>
        <ns1:CreationDateAndTime>${created}</ns1:CreationDateAndTime>
      </ns1:DocumentIdentification>
    </ns1:StandardBusinessDocumentHeader>
  </EPCISHeader>
  <EPCISBody>
    <EventList>
${events.join("\n")}
    </EventList>
  </EPCISBody>
  <extension>${escapeXml(baseName)}</extension>
</ns0:EPCISDocument>
`;
}

export function resetGs1Counters() {
  const c = defaultCounters();
  saveCounters(c);
  return c;
}
