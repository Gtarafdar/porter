using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;

/// <summary>
/// Thin Windows launcher — mirrors Mac Porter.app shell: start bundled node + open UI.
/// Runs as the normal user (installer is elevated once; this process is not).
/// </summary>
internal static class Program
{
    private static int Main(string[] args)
    {
        try
        {
            var baseDir = AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            var node = Path.Combine(baseDir, "node.exe");
            var cli = Path.Combine(baseDir, "app", "packages", "core", "dist", "cli.js");
            var ui = Path.Combine(baseDir, "ui");
            var versionFile = Path.Combine(baseDir, "VERSION");
            var version = File.Exists(versionFile) ? File.ReadAllText(versionFile).Trim() : "0.0.0";

            if (!File.Exists(node) || !File.Exists(cli))
            {
                Console.Error.WriteLine("Porter payload incomplete. Reinstall to C:\\Program Files\\Porter");
                return 1;
            }

            // If already healthy, just open the UI.
            if (IsHealthy())
            {
                OpenUi();
                return 0;
            }

            var psi = new ProcessStartInfo
            {
                FileName = node,
                Arguments = $"\"{cli}\" serve",
                WorkingDirectory = baseDir,
                UseShellExecute = false,
                CreateNoWindow = true,
            };
            psi.Environment["PORTER_RESOURCES"] = baseDir;
            psi.Environment["PORTER_UI_DIR"] = ui;
            psi.Environment["PORTER_VERSION"] = version;
            psi.Environment["PORTER_OPEN_BROWSER"] = "0";

            Process.Start(psi);

            // Wait briefly for health, then open browser UI (same design as Mac).
            for (var i = 0; i < 40; i++)
            {
                System.Threading.Thread.Sleep(250);
                if (IsHealthy()) break;
            }
            OpenUi();
            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine(ex.Message);
            return 1;
        }
    }

    private static bool IsHealthy()
    {
        try
        {
            using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(1) };
            var json = client.GetStringAsync("http://127.0.0.1:47831/api/health").GetAwaiter().GetResult();
            return json.Contains("\"ok\":true") || json.Contains("\"ok\": true");
        }
        catch
        {
            return false;
        }
    }

    private static void OpenUi()
    {
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = "http://127.0.0.1:47831/",
                UseShellExecute = true,
            });
        }
        catch
        {
            // ignore
        }
    }
}
