// Compile-time stand-in for Windows PowerShell 5.1's System.Management.Automation (only what the launcher uses).
// At run time the real one from Windows is used (same name, version and key).
using System;
using System.Collections.ObjectModel;
using System.Reflection;
[assembly: AssemblyVersion("3.0.0.0")]
namespace Microsoft.PowerShell { public enum ExecutionPolicy { Unrestricted = 0, RemoteSigned = 1, AllSigned = 2, Restricted = 3, Default = 3, Bypass = 4, Undefined = 5 } }
namespace System.Management.Automation {
    public class PSObject { }
    public sealed class PowerShell : IDisposable {
        public static PowerShell Create() { throw null; }
        public PowerShell AddScript(string script) { throw null; }
        public PowerShell AddParameter(string parameterName, object value) { throw null; }
        public Collection<PSObject> Invoke() { throw null; }
        public Runspaces.Runspace Runspace { get { throw null; } set { } }
        public void Dispose() { }
    }
}
namespace System.Management.Automation.Runspaces {
    public enum PSThreadOptions { Default = 0, UseNewThread = 1, ReuseThread = 2, UseCurrentThread = 3 }
    public class InitialSessionState {
        public static InitialSessionState CreateDefault() { throw null; }
        public Microsoft.PowerShell.ExecutionPolicy ExecutionPolicy { get { throw null; } set { } }
    }
    public abstract class Runspace : IDisposable {
        public System.Threading.ApartmentState ApartmentState { get { throw null; } set { } }
        public PSThreadOptions ThreadOptions { get { throw null; } set { } }
        public void Open() { }
        public void Dispose() { }
    }
    public static class RunspaceFactory { public static Runspace CreateRunspace(InitialSessionState initialSessionState) { throw null; } }
}
