using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Windows.Forms;

internal static class Program
{
    private static readonly string[] EdgeCandidates =
    {
        @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        @"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    };

    [STAThread]
    private static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        string baseDir = AppDomain.CurrentDomain.BaseDirectory;
        string root = Path.Combine(baseDir, "out");
        if (!File.Exists(Path.Combine(root, "index.html")))
        {
            MessageBox.Show(
                "未找到页面文件 out\\index.html。\n请先执行 npm run build，再运行打包脚本。",
                "追溯码生成器",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return;
        }

        int port = GetFreePort();
        var listener = new HttpListener();
        string prefix = "http://127.0.0.1:" + port + "/";
        listener.Prefixes.Add(prefix);

        try
        {
            listener.Start();
        }
        catch (Exception ex)
        {
            MessageBox.Show("无法启动本地服务: " + ex.Message, "追溯码生成器",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }

        var cts = new CancellationTokenSource();
        ThreadPool.QueueUserWorkItem(_ => ServeLoop(listener, root, cts.Token));

        string url = prefix;
        Process browser = null;
        try
        {
            browser = OpenInAppWindow(url);
            if (browser == null)
            {
                Process.Start(url);
                MessageBox.Show(
                    "已在浏览器中打开。\n关闭本对话框将停止本地服务。",
                    "追溯码生成器",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
            }
            else
            {
                browser.WaitForExit();
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show("打开页面失败: " + ex.Message, "追溯码生成器",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            cts.Cancel();
            try { listener.Stop(); } catch { }
            try { listener.Close(); } catch { }
            if (browser != null)
            {
                try
                {
                    if (!browser.HasExited) browser.Kill();
                }
                catch { }
                browser.Dispose();
            }
        }
    }

    private static int GetFreePort()
    {
        var tcp = new TcpListener(IPAddress.Loopback, 0);
        tcp.Start();
        int port = ((IPEndPoint)tcp.LocalEndpoint).Port;
        tcp.Stop();
        return port;
    }

    private static Process OpenInAppWindow(string url)
    {
        string edge = null;
        foreach (string candidate in EdgeCandidates)
        {
            if (File.Exists(candidate))
            {
                edge = candidate;
                break;
            }
        }
        if (edge == null) return null;

        string profile = Path.Combine(Path.GetTempPath(), "trace-code-generator-edge");
        Directory.CreateDirectory(profile);

        var psi = new ProcessStartInfo
        {
            FileName = edge,
            Arguments = "--app=\"" + url + "\" --user-data-dir=\"" + profile + "\" --no-first-run",
            UseShellExecute = false,
        };
        return Process.Start(psi);
    }

    private static void ServeLoop(HttpListener listener, string root, CancellationToken token)
    {
        string rootFull = Path.GetFullPath(root);
        while (!token.IsCancellationRequested && listener.IsListening)
        {
            HttpListenerContext ctx = null;
            try
            {
                ctx = listener.GetContext();
            }
            catch
            {
                break;
            }

            try
            {
                HandleRequest(ctx, rootFull);
            }
            catch
            {
                try
                {
                    ctx.Response.StatusCode = 500;
                    ctx.Response.Close();
                }
                catch { }
            }
        }
    }

    private static void HandleRequest(HttpListenerContext ctx, string rootFull)
    {
        string raw = ctx.Request.Url != null ? ctx.Request.Url.AbsolutePath : "/";
        string rel = Uri.UnescapeDataString(raw);
        if (rel == "/" || string.IsNullOrEmpty(rel)) rel = "/index.html";

        string filePath = Path.GetFullPath(Path.Combine(rootFull, rel.TrimStart('/').Replace('/', Path.DirectorySeparatorChar)));
        if (!filePath.StartsWith(rootFull, StringComparison.OrdinalIgnoreCase))
        {
            ctx.Response.StatusCode = 403;
            ctx.Response.Close();
            return;
        }

        if (!File.Exists(filePath))
        {
            string notFound = Path.Combine(rootFull, "404.html");
            if (File.Exists(notFound))
            {
                byte[] data404 = File.ReadAllBytes(notFound);
                ctx.Response.StatusCode = 404;
                ctx.Response.ContentType = "text/html; charset=utf-8";
                ctx.Response.OutputStream.Write(data404, 0, data404.Length);
                ctx.Response.Close();
                return;
            }
            ctx.Response.StatusCode = 404;
            ctx.Response.Close();
            return;
        }

        byte[] bytes = File.ReadAllBytes(filePath);
        ctx.Response.StatusCode = 200;
        ctx.Response.ContentType = Mime(Path.GetExtension(filePath));
        ctx.Response.ContentLength64 = bytes.LongLength;
        ctx.Response.OutputStream.Write(bytes, 0, bytes.Length);
        ctx.Response.Close();
    }

    private static string Mime(string ext)
    {
        switch ((ext ?? "").ToLowerInvariant())
        {
            case ".html": return "text/html; charset=utf-8";
            case ".js": return "application/javascript; charset=utf-8";
            case ".css": return "text/css; charset=utf-8";
            case ".json": return "application/json; charset=utf-8";
            case ".svg": return "image/svg+xml";
            case ".png": return "image/png";
            case ".jpg":
            case ".jpeg": return "image/jpeg";
            case ".gif": return "image/gif";
            case ".ico": return "image/x-icon";
            case ".woff": return "font/woff";
            case ".woff2": return "font/woff2";
            case ".ttf": return "font/ttf";
            case ".map": return "application/json";
            case ".txt": return "text/plain; charset=utf-8";
            case ".xml": return "application/xml; charset=utf-8";
            default: return "application/octet-stream";
        }
    }
}
