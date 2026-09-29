using System;
using System.IO;
using System.Management.Automation;
using System.Management.Automation.Runspaces;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyTitle("Liberty City Mod Loader IV")]
[assembly: AssemblyProduct("Liberty City Mod Loader IV")]
[assembly: AssemblyDescription("Mod loader and manager for GTA IV: The Complete Edition")]
[assembly: AssemblyCompany("Liberty City Mod Loader IV")]
[assembly: AssemblyCopyright("Free and open source (GPL v3) - source code in the app folder")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

// Starts the app: runs app\Liberty City Mod Loader IV.ps1 with Windows PowerShell, inside this program,
// so the taskbar shows this program's name and icon.
static class Program {
    const string Title = "Liberty City Mod Loader IV";

    [STAThread]
    static int Main(string[] args) {
        string dir = AppDomain.CurrentDomain.BaseDirectory;
        string appDir = Path.Combine(dir, "app");
        string script = Path.Combine(appDir, "Liberty City Mod Loader IV.ps1");
        if (!File.Exists(script)) {
            MessageBox.Show("The 'app' folder is missing.\n\nExtract the whole zip again and keep the 'app' folder next to this program.", Title, MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
        Environment.SetEnvironmentVariable("LCMI_EXE", Application.ExecutablePath);
        Environment.SetEnvironmentVariable("LCMI_APPDIR", appDir);
        string modPath = args.Length > 0 ? args[0] : "";
        bool started = false;
        try {
            Run(script, modPath, ref started);
            return 0;
        } catch (Exception e) {
            while (e.InnerException != null) e = e.InnerException;
            if (started) MessageBox.Show("Something went wrong:\n\n" + e.Message, Title, MessageBoxButtons.OK, MessageBoxIcon.Error);
            else MessageBox.Show("Windows PowerShell couldn't start here:\n\n" + e.Message + "\n\nOpen the 'app' folder and double-click 'Start Liberty City Mod Loader IV.bat' instead.", Title, MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return 1;
        }
    }

    static void Run(string script, string modPath, ref bool started) {
        InitialSessionState state = InitialSessionState.CreateDefault();
        state.ExecutionPolicy = Microsoft.PowerShell.ExecutionPolicy.RemoteSigned;   // Windows' standard setting for your own local scripts
        using (Runspace rs = RunspaceFactory.CreateRunspace(state)) {
            rs.ApartmentState = ApartmentState.STA;
            rs.ThreadOptions = PSThreadOptions.UseCurrentThread;
            rs.Open();
            using (PowerShell ps = PowerShell.Create()) {
                ps.Runspace = rs;
                ps.AddScript(File.ReadAllText(script)).AddParameter("ModPath", modPath);
                started = true;
                ps.Invoke();
            }
        }
    }
}
