# 追溯码生成器（code-generator）

桌面可用的追溯码 / XML 生成工具，支持 ESC 关联关系、出入库单据，以及 GS1 EPCIS 三级包装码。

用户端**不需要安装 Node.js**：使用打包好的便携版即可。

## 功能

| 页签 | 说明 |
|------|------|
| ESC关联关系 | 按表单生成箱/盒 20 位码与关联关系 XML，可预览条码、下载文件 |
| 出入库 | 按出入库类型与追溯码列表生成出入库 XML |
| GS1码 | 生成 EPCIS XML（小盒 / 中包 / 大箱 + AggregationEvent），序号本地防重 |

### GS1 码规则（摘要）

- 文件名：`{批号}_{公司前缀.物料}_{yyyyMMdd}-{hhmmss}-{001}_{000001}.xml`
- 包装比例：`1:中包数:小盒数`（如 `1:2:3` = 1 大箱含 2 中包，每中包 3 小盒）
- 小盒 20 位：`84` + 生产日期 8 位 + 序号 10 位
- 中包 12 位：`yyMMdd` 6 位 + 序号 6 位
- 大箱 20 位：`82`/`86` + 生产日期 8 位 + 序号 10 位
- EPC：`urn:epc:id:sgtin:{公司前缀}.{物料}.{序列号}`  
  - 小盒物料如 `00074`，中包指示符位为 `2`（`20074`），大箱默认物料 +1（`00075`）
- `DATMF` = 生产日期，`DATEX` = 有效期（与样例一致）
- 生成记录与序号保存在浏览器 **localStorage**，避免重复

样例参考：`sample/GS191701_69241476.00074_20231030-065057-057_74874.xml`

## 便携版（推荐给最终用户）

### 获取

开发机执行：

```bash
npm run dist
```

产物目录：

```text
release/code-generator-portable-v0.2/
  code-generator-portable-v0.2.exe
  out/          ← 必须与 exe 放在同一目录
```

把**整个文件夹**拷贝给用户即可。

### 使用

1. 双击 `code-generator-portable-v0.2.exe`
2. 会启动本地页面（Edge 应用窗口）；关闭窗口即结束
3. 勿单独拷贝 exe，缺少 `out` 无法打开

若 exe 被杀软删除，将目录加入白名单后重新执行 `npm run dist`。

## 开发

### 环境

- Node.js 18+
- Windows（打包 exe 需本机 .NET Framework 4.x，一般系统自带）

### 命令

```bash
npm install
npm run dev      # 开发：http://localhost:3000
npm run build    # 静态导出到 out/
npm run dist     # 构建便携版到 release/code-generator-portable-v0.2/
```

### 目录结构（主要）

```text
app/                 # Next.js 页面
components/          # UI（含 Gs1Panel、BarcodeArea）
lib/                 # 业务逻辑（code128、gs1）
launcher/            # 便携版 C# 启动器源码
electron/            # 可选 Electron 主进程
scripts/build-exe.ps1
sample/              # GS1 样例 XML
```

## 可选：Electron 打包

需能访问 npm 并安装依赖后：

```bash
npm i -D electron electron-builder
npm run electron:dist
```

日常更推荐轻量便携版（`npm run dist`），体积小、无需额外下载 Chromium。

## 注意

- 直接双击打开 `out/index.html` **没有样式**：资源路径按网站方式加载，须通过 dev / 便携 exe / 本地静态服务访问
- GS1「重置序号/历史」会清空本地计数，可能导致文件号与已下发文件冲突，慎用
