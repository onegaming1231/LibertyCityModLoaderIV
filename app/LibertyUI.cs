// Liberty City Mod Installer - UI helpers
// Smooth animations, rounded buttons and cards, dark lists, bundled fonts, own taskbar icon.
// Written for C# 5 / .NET Framework 4 so Windows can also build it by itself if needed.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Windows.Forms;

namespace LCMI {

    // ------------------------------------------------------------------
    //  Own taskbar button and icon (instead of PowerShell's)
    // ------------------------------------------------------------------
    public static class Taskbar {
        [DllImport("shell32.dll")]
        static extern int SetCurrentProcessExplicitAppUserModelID([MarshalAs(UnmanagedType.LPWStr)] string appId);
        [DllImport("shell32.dll")]
        static extern int SHGetPropertyStoreForWindow(IntPtr hwnd, ref Guid riid, out IPropertyStore store);

        [StructLayout(LayoutKind.Sequential, Pack = 4)]
        public struct PropertyKey { public Guid fmtid; public uint pid; public PropertyKey(Guid g, uint p) { fmtid = g; pid = p; } }
        [StructLayout(LayoutKind.Sequential)]
        public struct PropVariant { public ushort vt; public ushort r1; public ushort r2; public ushort r3; public IntPtr p; public IntPtr p2; }

        [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        public interface IPropertyStore {
            [PreserveSig] int GetCount(out uint count);
            [PreserveSig] int GetAt(uint index, out PropertyKey key);
            [PreserveSig] int GetValue(ref PropertyKey key, out PropVariant value);
            [PreserveSig] int SetValue(ref PropertyKey key, ref PropVariant value);
            [PreserveSig] int Commit();
        }
        static readonly Guid AppModel = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");

        public static void SetProcessId(string appId) { SetCurrentProcessExplicitAppUserModelID(appId); }

        public static void SetWindow(IntPtr hwnd, string appId, string exePath, string name) { SetWindow(hwnd, appId, exePath, name, null); }
        // iconPath: an .ico file - the taskbar reads the button icon from here (more reliable than the exe)
        public static void SetWindow(IntPtr hwnd, string appId, string exePath, string name, string iconPath) {
            Guid iid = typeof(IPropertyStore).GUID;
            IPropertyStore store;
            if (SHGetPropertyStoreForWindow(hwnd, ref iid, out store) != 0 || store == null) return;
            try {
                Set(store, 5, appId);
                if (!String.IsNullOrEmpty(exePath)) {
                    Set(store, 2, "\"" + exePath + "\"");
                    Set(store, 3, (!String.IsNullOrEmpty(iconPath) && File.Exists(iconPath)) ? iconPath + ",0" : exePath + ",0");
                    Set(store, 4, name);
                }
                store.Commit();
            } finally { Marshal.ReleaseComObject(store); }
        }
        static void Set(IPropertyStore store, uint pid, string value) {
            PropertyKey key = new PropertyKey(AppModel, pid);
            PropVariant v = new PropVariant();
            v.vt = 31; // VT_LPWSTR
            v.p = Marshal.StringToCoTaskMemUni(value);
            try { store.SetValue(ref key, ref v); } finally { Marshal.FreeCoTaskMem(v.p); }
        }
    }

    // ------------------------------------------------------------------
    //  Bundled fonts (private to this app, nothing is installed)
    // ------------------------------------------------------------------
    public static class Fonts {
        [DllImport("gdi32.dll", CharSet = CharSet.Unicode)]
        static extern int AddFontResourceEx(string file, uint flags, IntPtr reserved);
        static readonly PrivateFontCollection pfc = new PrivateFontCollection();

        public static bool Load(string path) {
            if (!File.Exists(path)) return false;
            try { AddFontResourceEx(path, 0x10, IntPtr.Zero); } catch { }   // FR_PRIVATE: lets normal text drawing use it
            try { pfc.AddFontFile(path); return true; } catch { return false; }
        }

        public static Font Make(string family, float size, FontStyle style) {
            foreach (FontFamily f in pfc.Families) {
                if (!String.Equals(f.Name, family, StringComparison.OrdinalIgnoreCase)) continue;
                FontStyle st = style;
                if (!f.IsStyleAvailable(st)) st = FontStyle.Regular;
                if (!f.IsStyleAvailable(st)) st = FontStyle.Bold;
                try { return new Font(f, size, st); } catch { return null; }
            }
            return null;
        }
    }

    // ------------------------------------------------------------------
    //  Animation engine: one shared timer, eased
    // ------------------------------------------------------------------
    public static class Anim {
        class Job { public Control C; public string Key; public DateTime Start; public int Ms; public Action<double> Step; public Action Done; }
        static readonly List<Job> jobs = new List<Job>();
        static Timer timer;
        public static bool Enabled = true;

        public static double Ease(double t) { double u = 1 - t; return 1 - u * u * u; }   // ease-out cubic

        public static void Run(Control c, string key, int ms, Action<double> step, Action done) {
            // a new animation of the same kind replaces the old one (the old one finishes first)
            for (int i = jobs.Count - 1; i >= 0; i--) {
                Job o = jobs[i];
                if (o.C == c && o.Key == key) { jobs.RemoveAt(i); try { o.Step(1); if (o.Done != null) o.Done(); } catch { } }
            }
            if (!Enabled || ms <= 0 || c == null || c.IsDisposed) { step(1); if (done != null) done(); return; }
            Job j = new Job(); j.C = c; j.Key = key; j.Start = DateTime.Now; j.Ms = ms; j.Step = step; j.Done = done;
            jobs.Add(j);
            try { step(0); } catch { }
            if (timer == null) { timer = new Timer(); timer.Interval = 15; timer.Tick += Tick; }
            if (!timer.Enabled) timer.Start();
        }

        static void Tick(object sender, EventArgs e) {
            DateTime now = DateTime.Now;
            foreach (Job j in jobs.ToArray()) {
                if (j.C.IsDisposed) { jobs.Remove(j); continue; }
                double t = Math.Min(1.0, (now - j.Start).TotalMilliseconds / j.Ms);
                try { j.Step(Ease(t)); } catch { t = 1; }
                if (t >= 1) { jobs.Remove(j); try { if (j.Done != null) j.Done(); } catch { } }
            }
            if (jobs.Count == 0) timer.Stop();
        }

        public static Color Mix(Color a, Color b, double t) {
            if (t <= 0) return a; if (t >= 1) return b;
            return Color.FromArgb((int)(a.A + (b.A - a.A) * t), (int)(a.R + (b.R - a.R) * t), (int)(a.G + (b.G - a.G) * t), (int)(a.B + (b.B - a.B) * t));
        }

        public static void BackColor(Control c, Color to, int ms) {
            Color from = c.BackColor;
            if (from.A < 255 || to.A < 255) { c.BackColor = to; return; }
            Run(c, "back", ms, delegate(double t) { c.BackColor = Mix(from, to, t); }, null);
        }
        public static void ForeColor(Control c, Color from, Color to, int ms) {
            Run(c, "fore", ms, delegate(double t) { c.ForeColor = Mix(from, to, t); }, null);
        }
        public static void MoveTo(Control c, int x, int y, int ms) {
            Point f = c.Location;
            Run(c, "move", ms, delegate(double t) { c.Location = new Point((int)Math.Round(f.X + (x - f.X) * t), (int)Math.Round(f.Y + (y - f.Y) * t)); }, null);
        }
        // a docked page slides in from the side, then docks again
        public static void SlideIn(Control page, int dx, int ms) {
            if (page.Parent == null) return;
            DockStyle d = page.Dock;
            Rectangle r = page.Parent.DisplayRectangle;
            page.Dock = DockStyle.None;
            page.Bounds = new Rectangle(r.X + dx, r.Y, r.Width, r.Height);
            Run(page, "slide", ms, delegate(double t) { page.Left = r.X + (int)Math.Round(dx * (1 - t)); }, delegate { page.Dock = d; });
        }
        public static void FadeIn(Form f, int ms) {
            f.Opacity = 0;
            Run(f, "fade", ms, delegate(double t) { f.Opacity = t; }, delegate { f.Opacity = 1; });
        }
        // less flicker when things move
        public static void DoubleBuffer(Control c) {
            if (c is Panel || c is Form || c is UserControl) {
                try {
                    PropertyInfo p = typeof(Control).GetProperty("DoubleBuffered", BindingFlags.NonPublic | BindingFlags.Instance);
                    p.SetValue(c, true, null);
                } catch { }
            }
            foreach (Control ch in c.Controls) DoubleBuffer(ch);
        }

        public static GraphicsPath Round(Rectangle r, int radius) {
            GraphicsPath p = new GraphicsPath();
            int d = Math.Max(1, Math.Min(radius * 2, Math.Min(r.Width, r.Height)));
            if (radius <= 0) { p.AddRectangle(r); return p; }
            p.AddArc(r.X, r.Y, d, d, 180, 90);
            p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
            p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
            p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
            p.CloseFigure();
            return p;
        }
    }

    // ------------------------------------------------------------------
    //  Rounded button with a soft hover glow. BackColor is its fill.
    // ------------------------------------------------------------------
    public class SmoothButton : Button {
        public int Radius = 6;
        public Font SubFont;                 // two-line buttons: second line smaller and dimmer
        public Color SubColor = Color.FromArgb(150, 150, 158);
        public int PadLeft = 0;
        double hover; bool over; bool down;

        public SmoothButton() {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer |
                     ControlStyles.ResizeRedraw | ControlStyles.SupportsTransparentBackColor, true);
            FlatStyle = FlatStyle.Flat;
            FlatAppearance.BorderSize = 0;
            Cursor = Cursors.Hand;
        }
        protected override bool ShowFocusCues { get { return false; } }

        void Glow(bool on) {
            over = on;
            double from = hover, to = on ? 1 : 0;
            Anim.Run(this, "hover", on ? 120 : 260, delegate(double t) { hover = from + (to - from) * t; Invalidate(); }, null);
        }
        protected override void OnMouseEnter(EventArgs e) { base.OnMouseEnter(e); if (Enabled) Glow(true); }
        protected override void OnMouseLeave(EventArgs e) { base.OnMouseLeave(e); down = false; Glow(false); }
        protected override void OnMouseDown(MouseEventArgs e) { base.OnMouseDown(e); down = true; Invalidate(); }
        protected override void OnMouseUp(MouseEventArgs e) { base.OnMouseUp(e); down = false; Invalidate(); }
        protected override void OnEnabledChanged(EventArgs e) { base.OnEnabledChanged(e); if (!Enabled) { hover = 0; over = false; } Invalidate(); }

        protected override void OnPaint(PaintEventArgs e) {
            Graphics g = e.Graphics;
            ButtonRenderer.DrawParentBackground(g, ClientRectangle, this);
            g.SmoothingMode = SmoothingMode.AntiAlias;
            Rectangle r = new Rectangle(0, 0, Width - 1, Height - 1);
            using (GraphicsPath path = Anim.Round(r, Radius)) {
                Color fill = BackColor;
                if (!Enabled && fill.A > 0) fill = Anim.Mix(fill, Color.FromArgb(fill.A, 30, 32, 36), 0.55);
                if (fill.A > 0) using (SolidBrush b = new SolidBrush(fill)) g.FillPath(b, path);
                if (hover > 0.01) using (SolidBrush b = new SolidBrush(Color.FromArgb((int)(34 * hover), 255, 255, 255))) g.FillPath(b, path);
                if (down) using (SolidBrush b = new SolidBrush(Color.FromArgb(46, 0, 0, 0))) g.FillPath(b, path);
            }
            g.SmoothingMode = SmoothingMode.None;
            Color fg = Enabled ? ForeColor : Color.FromArgb(150, 156, 166);   // disabled: grey text you can still read
            int nl = Text.IndexOf('\n');
            if (SubFont != null && nl >= 0) {
                string a = Text.Substring(0, nl).Trim(), s = Text.Substring(nl + 1).Trim();
                int h1 = TextRenderer.MeasureText(a, Font).Height, h2 = TextRenderer.MeasureText(s, SubFont).Height;
                int y = (Height - h1 - h2) / 2 + 1;
                TextRenderer.DrawText(g, a, Font, new Rectangle(PadLeft, y, Width - PadLeft - 6, h1), fg, TextFormatFlags.Left | TextFormatFlags.SingleLine | TextFormatFlags.EndEllipsis);
                TextRenderer.DrawText(g, s, SubFont, new Rectangle(PadLeft, y + h1 - 2, Width - PadLeft - 6, h2), Enabled ? SubColor : fg, TextFormatFlags.Left | TextFormatFlags.SingleLine | TextFormatFlags.EndEllipsis);
                return;
            }
            TextFormatFlags f = TextFormatFlags.SingleLine | TextFormatFlags.EndEllipsis | TextFormatFlags.VerticalCenter;
            switch (TextAlign) {
                case ContentAlignment.MiddleLeft: case ContentAlignment.TopLeft: case ContentAlignment.BottomLeft: f |= TextFormatFlags.Left; break;
                case ContentAlignment.MiddleRight: case ContentAlignment.TopRight: case ContentAlignment.BottomRight: f |= TextFormatFlags.Right; break;
                default: f |= TextFormatFlags.HorizontalCenter; break;
            }
            int pad = PadLeft > 0 ? PadLeft : 8;
            TextRenderer.DrawText(g, Text.Replace("\n", " ").Trim(), Font, new Rectangle(pad, 0, Width - pad * 2, Height), fg, f);
        }
    }

    // ------------------------------------------------------------------
    //  Rounded card (tiles, drop zone, steps). Children see its fill.
    // ------------------------------------------------------------------
    public class Card : Panel {
        public Color Fill = Color.FromArgb(36, 38, 44);
        public Color HoverFill = Color.Empty;
        public Color Border = Color.Empty;
        public Color Accent = Color.Empty;    // thin bar on the left
        public bool Dashed;
        public int Radius = 10;
        double hover; bool over;

        public Card() {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer |
                     ControlStyles.ResizeRedraw | ControlStyles.SupportsTransparentBackColor, true);
            BackColor = Color.Transparent;
        }
        public void SetFill(Color c) { Fill = c; Invalidate(true); }

        void Check() {
            if (HoverFill.IsEmpty || IsDisposed) return;
            bool o = ClientRectangle.Contains(PointToClient(Cursor.Position));
            if (o == over) return;
            over = o;
            double from = hover, to = o ? 1 : 0;
            Anim.Run(this, "hover", o ? 140 : 280, delegate(double t) { hover = from + (to - from) * t; Invalidate(true); }, null);
        }
        protected override void OnMouseEnter(EventArgs e) { base.OnMouseEnter(e); Check(); }
        protected override void OnMouseLeave(EventArgs e) { base.OnMouseLeave(e); Check(); }
        protected override void OnControlAdded(ControlEventArgs e) {
            base.OnControlAdded(e);
            e.Control.MouseEnter += delegate { Check(); };
            e.Control.MouseLeave += delegate { Check(); };
        }

        protected override void OnPaintBackground(PaintEventArgs e) {
            base.OnPaintBackground(e);                       // what's behind the rounded corners
            Graphics g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            Rectangle r = new Rectangle(0, 0, Width - 1, Height - 1);
            using (GraphicsPath path = Anim.Round(r, Radius)) {
                Color f = HoverFill.IsEmpty ? Fill : Anim.Mix(Fill, HoverFill, hover);
                using (SolidBrush b = new SolidBrush(f)) g.FillPath(b, path);
                if (!Accent.IsEmpty) {
                    Region old = g.Clip;
                    g.SetClip(path, CombineMode.Intersect);
                    using (SolidBrush b = new SolidBrush(Accent)) g.FillRectangle(b, 0, 0, 4, Height);
                    g.Clip = old;
                }
                if (!Border.IsEmpty) {
                    Color bc = HoverFill.IsEmpty ? Border : Anim.Mix(Border, Color.FromArgb(Border.A, Math.Min(255, Border.R + 50), Math.Min(255, Border.G + 50), Math.Min(255, Border.B + 50)), hover);
                    using (Pen p = new Pen(bc, 1.5f)) {
                        if (Dashed) { p.DashStyle = DashStyle.Dash; p.DashPattern = new float[] { 5, 4 }; }
                        g.DrawPath(p, path);
                    }
                }
            }
            g.SmoothingMode = SmoothingMode.None;
        }
    }

    // ------------------------------------------------------------------
    //  Dark list: roomy rows, soft stripes, dark headers, custom tick boxes
    // ------------------------------------------------------------------
    public class DarkListView : ListView {
        public Color HeaderFill = Color.FromArgb(27, 29, 33);
        public Color HeaderText = Color.FromArgb(150, 150, 158);
        public Color SelectFill = Color.FromArgb(52, 74, 98);
        public Color Accent = Color.FromArgb(108, 164, 216);
        public Font HeaderFont;
        public int RowHeight = 30;
        // small pictures in the first column (My Mods); items with Tag "nothumb" get none
        public bool ShowThumbs;
        public Dictionary<string, Image> Thumbs = new Dictionary<string, Image>(StringComparer.OrdinalIgnoreCase);
        public int DropLine = -1;   // drag to reorder: a line above this row
        static readonly Color[] ThumbColors = { Color.FromArgb(70, 110, 160), Color.FromArgb(150, 90, 60), Color.FromArgb(80, 130, 90), Color.FromArgb(130, 80, 140), Color.FromArgb(160, 130, 50), Color.FromArgb(60, 130, 140) };
        void DrawThumb(Graphics g, Rectangle tb, string name) {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            using (GraphicsPath p = Anim.Round(tb, 5)) {
                Image img;
                if (Thumbs.TryGetValue(name ?? "", out img) && img != null) {
                    Region old = g.Clip;
                    g.SetClip(p, CombineMode.Intersect);
                    // fill the box (crop the middle)
                    float sc = Math.Max((float)tb.Width / img.Width, (float)tb.Height / img.Height);
                    float w = img.Width * sc, h = img.Height * sc;
                    try { g.DrawImage(img, tb.X + (tb.Width - w) / 2f, tb.Y + (tb.Height - h) / 2f, w, h); } catch { }
                    g.Clip = old;
                } else {
                    int hsh = 0; foreach (char ch in (name ?? "")) hsh = hsh * 31 + ch;
                    Color c = ThumbColors[Math.Abs(hsh % ThumbColors.Length)];
                    using (LinearGradientBrush b = new LinearGradientBrush(tb, c, Anim.Mix(c, Color.Black, 0.45), 45f)) g.FillPath(b, p);
                    string letter = string.IsNullOrEmpty(name) ? "?" : name.Trim().Substring(0, 1).ToUpper();
                    using (Font f = new Font(Font.FontFamily, Math.Max(8f, tb.Height * 0.42f), FontStyle.Bold, GraphicsUnit.Pixel))
                        TextRenderer.DrawText(g, letter, f, tb, Color.FromArgb(235, 240, 245), TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine | TextFormatFlags.NoPrefix);
                }
                using (Pen pen = new Pen(Color.FromArgb(60, 255, 255, 255))) g.DrawPath(pen, p);
            }
            g.SmoothingMode = SmoothingMode.None;
        }

        // the column header is painted by us directly (Windows ignores owner-draw headers in some setups)
        [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
        [StructLayout(LayoutKind.Sequential)] public struct PAINTSTRUCT { public IntPtr hdc; public int fErase; public RECT rc; public int fRestore; public int fIncUpdate; [MarshalAs(UnmanagedType.ByValArray, SizeConst = 32)] public byte[] reserved; }
        [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, int msg, IntPtr w, IntPtr l);
        [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, int msg, IntPtr w, ref RECT l);
        [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr h, out RECT r);
        [DllImport("user32.dll")] static extern IntPtr BeginPaint(IntPtr h, out PAINTSTRUCT ps);
        [DllImport("user32.dll")] static extern bool EndPaint(IntPtr h, ref PAINTSTRUCT ps);
        [DllImport("user32.dll")] static extern bool InvalidateRect(IntPtr h, IntPtr r, bool erase);

        class HeaderPainter : NativeWindow {
            readonly DarkListView lv;
            public HeaderPainter(DarkListView l) { lv = l; }
            protected override void WndProc(ref Message m) {
                if (m.Msg == 0x000F) {            // WM_PAINT
                    PAINTSTRUCT ps;
                    IntPtr hdc = BeginPaint(Handle, out ps);
                    try { using (Graphics g = Graphics.FromHdc(hdc)) lv.PaintHeader(g, Handle); } catch { }
                    finally { EndPaint(Handle, ref ps); }
                    return;
                }
                if (m.Msg == 0x0014) { m.Result = (IntPtr)1; return; }   // WM_ERASEBKGND
                base.WndProc(ref m);
            }
        }
        HeaderPainter headerPainter;

        protected override void OnHandleCreated(EventArgs e) {
            base.OnHandleCreated(e);
            try {
                IntPtr hdr = SendMessage(Handle, 0x101F, IntPtr.Zero, IntPtr.Zero);   // LVM_GETHEADER
                if (hdr != IntPtr.Zero) { headerPainter = new HeaderPainter(this); headerPainter.AssignHandle(hdr); InvalidateRect(hdr, IntPtr.Zero, true); }
            } catch { }
        }
        protected override void OnHandleDestroyed(EventArgs e) {
            if (headerPainter != null) { try { headerPainter.ReleaseHandle(); } catch { } headerPainter = null; }
            base.OnHandleDestroyed(e);
        }

        void PaintHeader(Graphics screen, IntPtr hdr) {
            RECT cr; GetClientRect(hdr, out cr);
            int w = Math.Max(1, cr.Right - cr.Left), h = Math.Max(1, cr.Bottom - cr.Top);
            using (Bitmap bmp = new Bitmap(w, h))
            using (Graphics g = Graphics.FromImage(bmp)) {
                using (SolidBrush b = new SolidBrush(HeaderFill)) g.FillRectangle(b, 0, 0, w, h);
                int count = (int)SendMessage(hdr, 0x1200, IntPtr.Zero, IntPtr.Zero);     // HDM_GETITEMCOUNT
                Color line = Anim.Mix(HeaderFill, Color.White, 0.08);
                for (int i = 0; i < count && i < Columns.Count; i++) {
                    RECT r = new RECT();
                    SendMessage(hdr, 0x1207, (IntPtr)i, ref r);                         // HDM_GETITEMRECT
                    Rectangle tr = new Rectangle(r.Left + 8, 0, Math.Max(0, r.Right - r.Left - 12), h);
                    TextRenderer.DrawText(g, Columns[i].Text.ToUpper(), HeaderFont ?? Font, tr, HeaderText,
                        TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine | TextFormatFlags.EndEllipsis | TextFormatFlags.NoPrefix);
                    if (i < count - 1) using (Pen p = new Pen(line)) g.DrawLine(p, r.Right - 1, 6, r.Right - 1, h - 7);
                }
                using (Pen p = new Pen(line)) g.DrawLine(p, 0, h - 1, w, h - 1);
                screen.DrawImageUnscaled(bmp, 0, 0);
            }
        }

        public DarkListView() {
            OwnerDraw = true;
            DoubleBuffered = true;
            ImageList il = new ImageList();
            il.ImageSize = new Size(1, RowHeight);
            SmallImageList = il;
        }
        public void SetRowHeight(int h) { RowHeight = h; ImageList il = new ImageList(); il.ImageSize = new Size(1, h); SmallImageList = il; }

        protected override void OnDrawColumnHeader(DrawListViewColumnHeaderEventArgs e) {
            using (SolidBrush b = new SolidBrush(HeaderFill)) e.Graphics.FillRectangle(b, e.Bounds);
            Rectangle r = new Rectangle(e.Bounds.X + 8, e.Bounds.Y, e.Bounds.Width - 12, e.Bounds.Height);
            TextRenderer.DrawText(e.Graphics, e.Header.Text.ToUpper(), HeaderFont ?? Font, r, HeaderText,
                TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine | TextFormatFlags.EndEllipsis);
            using (Pen p = new Pen(Anim.Mix(HeaderFill, Color.White, 0.08))) e.Graphics.DrawLine(p, e.Bounds.Left, e.Bounds.Bottom - 1, e.Bounds.Right, e.Bounds.Bottom - 1);
        }
        protected override void OnDrawItem(DrawListViewItemEventArgs e) { if (View != View.Details) e.DrawDefault = true; }
        protected override void OnDrawSubItem(DrawListViewSubItemEventArgs e) {
            Graphics g = e.Graphics;
            bool sel = e.Item.Selected;
            Color bg = sel ? SelectFill : (e.ItemIndex % 2 == 1 ? Anim.Mix(BackColor, Color.White, 0.03) : BackColor);
            using (SolidBrush b = new SolidBrush(bg)) g.FillRectangle(b, e.Bounds);
            Rectangle r = e.Bounds;
            if (e.ColumnIndex == 0) {
                if (sel) using (SolidBrush b = new SolidBrush(Accent)) g.FillRectangle(b, r.X, r.Y, 3, r.Height);
                if (CheckBoxes) {
                    Rectangle box = new Rectangle(r.X + 6, r.Y + (r.Height - 14) / 2, 14, 14);
                    g.SmoothingMode = SmoothingMode.AntiAlias;
                    using (GraphicsPath p = Anim.Round(box, 3)) {
                        if (e.Item.Checked) {
                            using (SolidBrush b = new SolidBrush(Accent)) g.FillPath(b, p);
                            using (Pen pen = new Pen(Color.FromArgb(20, 20, 24), 2f))
                                g.DrawLines(pen, new Point[] { new Point(box.X + 3, box.Y + 7), new Point(box.X + 6, box.Y + 10), new Point(box.X + 11, box.Y + 4) });
                        } else using (Pen pen = new Pen(Color.FromArgb(120, 124, 132), 1.5f)) g.DrawPath(pen, p);
                    }
                    g.SmoothingMode = SmoothingMode.None;
                    r = new Rectangle(r.X + 24, r.Y, r.Width - 24, r.Height);
                }
                if (ShowThumbs && !("nothumb".Equals(e.Item.Tag as string))) {
                    int th = Math.Max(10, r.Height - 10), tw = th * 16 / 9;
                    DrawThumb(g, new Rectangle(r.X + 6, r.Y + 5, tw, th), e.Item.Text);
                    r = new Rectangle(r.X + tw + 10, r.Y, Math.Max(0, r.Width - tw - 10), r.Height);
                }
            }
            Color fg = e.Item.UseItemStyleForSubItems ? e.Item.ForeColor : e.SubItem.ForeColor;
            if (fg.IsEmpty) fg = ForeColor;
            TextRenderer.DrawText(g, e.SubItem.Text, Font, new Rectangle(r.X + 8, r.Y, Math.Max(0, r.Width - 12), r.Height), fg,
                TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine | TextFormatFlags.EndEllipsis | TextFormatFlags.NoPrefix);
            if (DropLine >= 0 && (e.ItemIndex == DropLine || (DropLine >= Items.Count && e.ItemIndex == Items.Count - 1)))
                using (SolidBrush b = new SolidBrush(Accent)) g.FillRectangle(b, e.Bounds.X, DropLine >= Items.Count ? e.Bounds.Bottom - 3 : e.Bounds.Y, e.Bounds.Width, 3);
        }
        protected override void OnPaintBackground(PaintEventArgs e) { using (SolidBrush b = new SolidBrush(BackColor)) e.Graphics.FillRectangle(b, ClientRectangle); }

        // last column fills the rest, so no light header strip shows on the right
        bool fitting;
        public void FitLastColumn() {
            if (fitting || Columns.Count == 0 || View != View.Details) return;
            fitting = true;
            try {
                int used = 0;
                for (int i = 0; i < Columns.Count - 1; i++) used += Columns[i].Width;
                int w = ClientSize.Width - used - 2;
                if (w > 60) Columns[Columns.Count - 1].Width = w;
            } finally { fitting = false; }
        }
        protected override void OnResize(EventArgs e) { base.OnResize(e); FitLastColumn(); }
        protected override void OnColumnWidthChanged(ColumnWidthChangedEventArgs e) { base.OnColumnWidthChanged(e); if (e.ColumnIndex != Columns.Count - 1) FitLastColumn(); }
    }

    // ------------------------------------------------------------------
    //  RPF (version 2) archive editor - puts mod files inside game archives
    //  like playerped.rpf. Never edits the original: it writes a full modded
    //  copy that Fusion Fix loads from the update folder.
    //  The archive key is read from the player's own GTAIV.exe.
    // ------------------------------------------------------------------
    // a second name for the same file on disk (no extra space used). False if it can't (other drive, FAT32...)
    public static class Files {
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        static extern bool CreateHardLink(string lpFileName, string lpExistingFileName, IntPtr lpSecurityAttributes);
        public static bool HardLink(string link, string existing) {
            try { return CreateHardLink(link, existing, IntPtr.Zero); } catch { return false; }
        }
    }

    public static class Rpf {
        const int Block = 0x800;
        const int MagicV2 = 0x32465052;
        const string KeyHash = "DEA375EF1E6EF2223A1221C2C575C47BF17EFA5E";
        static readonly uint[] KnownOffsets = {
            0xC5B73C, 0xC5B33C,                                   // Complete Edition 1.2.0.59 / 1.2.0.32
            0xC95FD8, 0xBE7540, 0xBE6540, 0xBE1370, 0xB7AEF4, 0xB75C9C, 0xB56BC4, 0xB607C4, 0xA94204,
            0xB5B65C, 0xB569F4, 0xB76CB4, 0xB7AEFC, 0xB8813C, 0xB8C38C, 0xBE6510 };
        public static byte[] KeyOverride;      // for testing only
        public static int LastKeyOffset = -1;

        static bool IsKey(byte[] buf, int off, SHA1 sha) {
            if (off < 0 || off + 32 > buf.Length) return false;
            byte[] h = sha.ComputeHash(buf, off, 32);
            return BitConverter.ToString(h).Replace("-", "") == KeyHash;
        }
        // hint: a remembered offset from last time (or -1)
        public static byte[] FindKey(string exePath, int hint) {
            if (KeyOverride != null) return KeyOverride;
            byte[] buf = File.ReadAllBytes(exePath);
            using (SHA1 sha = SHA1.Create()) {
                int found = -1;
                if (IsKey(buf, hint, sha)) found = hint;
                if (found < 0) foreach (uint o in KnownOffsets) if (IsKey(buf, (int)o, sha)) { found = (int)o; break; }
                if (found < 0) for (int o = 0; o + 32 <= buf.Length; o += 4) if (IsKey(buf, o, sha)) { found = o; break; }
                if (found < 0) return null;
                LastKeyOffset = found;
                byte[] key = new byte[32];
                Buffer.BlockCopy(buf, found, key, 0, 32);
                return key;
            }
        }

        internal static byte[] Decrypt(byte[] data, byte[] key) {
            byte[] d = (byte[])data.Clone();
            using (RijndaelManaged rj = new RijndaelManaged()) {
                rj.BlockSize = 128; rj.KeySize = 256; rj.Mode = CipherMode.ECB; rj.Padding = PaddingMode.None; rj.Key = key; rj.IV = new byte[16];
                using (ICryptoTransform t = rj.CreateDecryptor()) {
                    int len = d.Length & ~0x0F;
                    if (len > 0) for (int i = 0; i < 16; i++) t.TransformBlock(d, 0, len, d, 0);
                }
            }
            return d;
        }
        // test helper: the reverse of Decrypt
        public static byte[] Encrypt(byte[] data, byte[] key) {
            byte[] d = (byte[])data.Clone();
            using (RijndaelManaged rj = new RijndaelManaged()) {
                rj.BlockSize = 128; rj.KeySize = 256; rj.Mode = CipherMode.ECB; rj.Padding = PaddingMode.None; rj.Key = key; rj.IV = new byte[16];
                using (ICryptoTransform t = rj.CreateEncryptor()) {
                    int len = d.Length & ~0x0F;
                    if (len > 0) for (int i = 0; i < 16; i++) t.TransformBlock(d, 0, len, d, 0);
                }
            }
            return d;
        }

        class Node {
            public string Name; public bool Dir; public int DirFlags;
            public List<Node> Kids = new List<Node>();
            public int Size, Offset, SizeInArchive, ResType; public bool Compressed, Resource; public uint RscFlags;
            public string NewSource;
            public int NameOff, OutOffset, OutIndex;
        }

        static string ReadName(byte[] names, int off) {
            if (off < 0 || off >= names.Length) throw new InvalidDataException("bad name");
            int end = off; while (end < names.Length && names[end] != 0) end++;
            return Encoding.ASCII.GetString(names, off, end - off);
        }

        static Node Load(string path, byte[] key, out int unknown) {
            using (FileStream fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read)) {
                BinaryReader br = new BinaryReader(fs);
                int magic = br.ReadInt32(), tocSize = br.ReadInt32(), count = br.ReadInt32();
                unknown = br.ReadInt32();
                int enc = br.ReadInt32();
                if (magic != MagicV2) throw new InvalidDataException(magic == 0x33465052 ? "This archive type (version 3, used for audio) can't be edited." : "This isn't a GTA IV archive.");
                if (count <= 0 || tocSize < count * 16 || tocSize > 64 * 1024 * 1024) throw new InvalidDataException("The archive looks damaged.");
                fs.Position = Block;
                byte[] toc = br.ReadBytes(tocSize);
                if (enc != 0) {
                    if (key == null) throw new InvalidDataException("Couldn't find the archive key in GTAIV.exe.");
                    toc = Decrypt(toc, key);
                }
                byte[] names = new byte[tocSize - count * 16];
                Buffer.BlockCopy(toc, count * 16, names, 0, names.Length);
                int[] a = new int[count], b = new int[count], c = new int[count]; uint[] d = new uint[count];
                for (int i = 0; i < count; i++) {
                    a[i] = BitConverter.ToInt32(toc, i * 16); b[i] = BitConverter.ToInt32(toc, i * 16 + 4);
                    c[i] = BitConverter.ToInt32(toc, i * 16 + 8); d[i] = BitConverter.ToUInt32(toc, i * 16 + 12);
                }
                if (c[0] >= 0) throw new InvalidDataException("Couldn't read the archive (wrong key?).");
                bool[] seen = new bool[count];
                Node root = Make(0, a, b, c, d, names, seen, fs.Length);
                return root;
            }
        }
        static Node Make(int i, int[] a, int[] b, int[] c, uint[] d, byte[] names, bool[] seen, long fileLen) {
            if (i < 0 || i >= seen.Length || seen[i]) throw new InvalidDataException("Couldn't read the archive (wrong key?).");
            seen[i] = true;
            Node n = new Node();
            n.Name = ReadName(names, a[i]);
            if (c[i] < 0) {
                n.Dir = true; n.DirFlags = b[i];
                int first = (int)((uint)c[i] & 0x7fffffff), num = (int)(d[i] & 0x0fffffff);
                if (first + num > seen.Length) throw new InvalidDataException("Couldn't read the archive (wrong key?).");
                for (int k = 0; k < num; k++) n.Kids.Add(Make(first + k, a, b, c, d, names, seen, fileLen));
            } else {
                n.Size = b[i];
                if ((d[i] & 0xC0000000) == 0xC0000000) {
                    n.Resource = true; n.ResType = c[i] & 0xFF; n.Offset = c[i] & 0x7fffff00; n.SizeInArchive = b[i]; n.RscFlags = d[i];
                } else {
                    n.Offset = c[i]; n.SizeInArchive = (int)(d[i] & 0xbfffffff); n.Compressed = (d[i] & 0x40000000) != 0;
                }
                if (n.Offset < 0 || n.Offset + (long)n.SizeInArchive > fileLen) throw new InvalidDataException("Couldn't read the archive (wrong key?).");
            }
            return n;
        }

        static void Walk(Node n, string path, List<KeyValuePair<string, Node>> all) {
            foreach (Node k in n.Kids) {
                string p = path.Length == 0 ? k.Name : path + "/" + k.Name;
                all.Add(new KeyValuePair<string, Node>(p, k));
                if (k.Dir) Walk(k, p, all);
            }
        }
        static void Insert(Node dir, Node n) {
            int i = 0;
            while (i < dir.Kids.Count && String.Compare(dir.Kids[i].Name, n.Name, StringComparison.OrdinalIgnoreCase) < 0) i++;
            dir.Kids.Insert(i, n);
        }
        static void SetSource(Node n, string src) {
            n.NewSource = src;
            byte[] head = new byte[12];
            using (FileStream f = File.OpenRead(src)) f.Read(head, 0, 12);
            long len = new FileInfo(src).Length;
            if (len > int.MaxValue) throw new InvalidDataException("File too big: " + src);
            n.Size = (int)len; n.SizeInArchive = (int)len; n.Compressed = false;
            if (BitConverter.ToUInt32(head, 0) == 0x05435352) {   // "RSC" resource (models, textures)
                n.Resource = true; n.ResType = (int)(BitConverter.ToUInt32(head, 4) & 0xFF); n.RscFlags = BitConverter.ToUInt32(head, 8) | 0xC0000000;
            } else { n.Resource = false; n.ResType = 0; n.RscFlags = 0; }
        }

        // inner: path inside the archive with '/', or "?name" = find that file name anywhere.
        // Returns a short report, one line per file.
        public static string Build(string original, string output, byte[] key, string[] inner, string[] sources) {
            int unknown;
            Node root = Load(original, key, out unknown);
            StringBuilder report = new StringBuilder();
            for (int i = 0; i < inner.Length; i++) {
                List<KeyValuePair<string, Node>> all = new List<KeyValuePair<string, Node>>();
                Walk(root, "", all);
                string want = inner[i].Replace('\\', '/').Trim('/');
                bool byName = want.StartsWith("?");
                if (byName) want = want.Substring(1);
                string file = want.Contains("/") ? want.Substring(want.LastIndexOf('/') + 1) : want;
                Node hit = null; string hitPath = null;
                foreach (KeyValuePair<string, Node> kv in all) {
                    if (kv.Value.Dir) continue;
                    if (byName ? String.Equals(kv.Value.Name, file, StringComparison.OrdinalIgnoreCase) : String.Equals(kv.Key, want, StringComparison.OrdinalIgnoreCase)) { hit = kv.Value; hitPath = kv.Key; break; }
                }
                if (hit != null) { SetSource(hit, sources[i]); report.AppendLine("replaced " + hitPath); continue; }
                // new file: pick its folder
                Node dir = root; string where = "";
                if (byName) {
                    // the folder that holds the most files starting the same way (e.g. "uppr_")
                    string pre = file.Contains("_") ? file.Substring(0, file.IndexOf('_') + 1) : file;
                    int best = 0;
                    foreach (KeyValuePair<string, Node> kv in all) {
                        if (!kv.Value.Dir) continue;
                        int cnt = 0;
                        foreach (Node k in kv.Value.Kids) if (!k.Dir && k.Name.StartsWith(pre, StringComparison.OrdinalIgnoreCase)) cnt++;
                        if (cnt > best) { best = cnt; dir = kv.Value; where = kv.Key; }
                    }
                    if (best == 0) {
                        // no file like it yet: use the folder with the most clothing/face parts
                        System.Text.RegularExpressions.Regex part = new System.Text.RegularExpressions.Regex(@"^[a-z0-9]+_(diff_|normal_|spec_)?\d{3}_", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                        foreach (KeyValuePair<string, Node> kv in all) {
                            if (!kv.Value.Dir) continue;
                            int cnt = 0;
                            foreach (Node k in kv.Value.Kids) if (!k.Dir && part.IsMatch(k.Name)) cnt++;
                            if (cnt > best) { best = cnt; dir = kv.Value; where = kv.Key; }
                        }
                        if (best == 0) {
                            int rootParts = 0;
                            foreach (Node k in root.Kids) if (!k.Dir && part.IsMatch(k.Name)) rootParts++;
                            if (rootParts == 0) { dir = root; where = ""; }
                        }
                    }
                } else if (want.Contains("/")) {
                    string[] parts = want.Substring(0, want.LastIndexOf('/')).Split('/');
                    foreach (string part in parts) {
                        Node next = null;
                        foreach (Node k in dir.Kids) if (k.Dir && String.Equals(k.Name, part, StringComparison.OrdinalIgnoreCase)) { next = k; break; }
                        if (next == null) { next = new Node(); next.Name = part.ToLowerInvariant(); next.Dir = true; Insert(dir, next); }
                        dir = next;
                        where = where.Length == 0 ? next.Name : where + "/" + next.Name;
                    }
                }
                Node nn = new Node(); nn.Name = file.ToLowerInvariant();
                SetSource(nn, sources[i]);
                Insert(dir, nn);
                report.AppendLine("added " + (where.Length == 0 ? nn.Name : where + "/" + nn.Name));
            }
            Write(original, output, root, unknown);
            return report.ToString();
        }

        static int Align(long v) { return (int)((v + Block - 1) / Block * Block); }

        static void Write(string original, string output, Node root, int unknown) {
            // table order: each folder's contents sit together (root first)
            List<Node> list = new List<Node>(); list.Add(root);
            for (int i = 0; i < list.Count; i++) {
                Node n = list[i];
                if (n.Dir) { n.OutIndex = list.Count; list.AddRange(n.Kids); }
            }
            MemoryStream names = new MemoryStream();
            foreach (Node n in list) {
                n.NameOff = (int)names.Length;
                byte[] nb = Encoding.ASCII.GetBytes(n.Name); names.Write(nb, 0, nb.Length); names.WriteByte(0);
            }
            int tocSize = list.Count * 16 + (int)names.Length;
            long pos = Align(Block + tocSize);
            foreach (Node n in list) {
                if (n.Dir) continue;
                n.OutOffset = (int)pos;
                pos += Align(Math.Max(1, n.SizeInArchive));
                if (pos > int.MaxValue) throw new InvalidDataException("The modded archive would be too big.");
            }
            string dir = Path.GetDirectoryName(output);
            if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
            string tmp = output + ".building";
            using (FileStream src = new FileStream(original, FileMode.Open, FileAccess.Read, FileShare.Read))
            using (FileStream o = new FileStream(tmp, FileMode.Create, FileAccess.Write)) {
                BinaryWriter bw = new BinaryWriter(o);
                bw.Write(MagicV2); bw.Write(tocSize); bw.Write(list.Count); bw.Write(unknown); bw.Write(0);   // table not encrypted
                o.Position = Block;
                foreach (Node n in list) {
                    bw.Write(n.NameOff);
                    if (n.Dir) { bw.Write(n.DirFlags); bw.Write((uint)n.OutIndex | 0x80000000); bw.Write(n.Kids.Count); }
                    else if (n.Resource) { bw.Write(n.Size); bw.Write(n.OutOffset | (n.ResType & 0xFF)); bw.Write(n.RscFlags); }
                    else { bw.Write(n.Size); bw.Write(n.OutOffset); bw.Write((uint)n.SizeInArchive | (n.Compressed ? 0x40000000u : 0u)); }
                }
                byte[] nm = names.ToArray(); bw.Write(nm);
                byte[] buf = new byte[1 << 16];
                foreach (Node n in list) {
                    if (n.Dir) continue;
                    o.Position = n.OutOffset;
                    Stream from; long left = n.SizeInArchive;
                    if (n.NewSource != null) from = File.OpenRead(n.NewSource); else { src.Position = n.Offset; from = src; }
                    try {
                        while (left > 0) {
                            int r = from.Read(buf, 0, (int)Math.Min(buf.Length, left));
                            if (r <= 0) throw new EndOfStreamException("Archive ended early.");
                            o.Write(buf, 0, r); left -= r;
                        }
                    } finally { if (from != src) from.Dispose(); }
                }
                if (o.Length < pos) o.SetLength(pos);
            }
            if (File.Exists(output)) File.Delete(output);
            File.Move(tmp, output);
        }

        // list what's inside (for checking)
        public static string[] List(string path, byte[] key) {
            int unknown;
            Node root = Load(path, key, out unknown);
            List<KeyValuePair<string, Node>> all = new List<KeyValuePair<string, Node>>();
            Walk(root, "", all);
            List<string> r = new List<string>();
            foreach (KeyValuePair<string, Node> kv in all) r.Add((kv.Value.Dir ? "D " : "F ") + kv.Key + (kv.Value.Dir ? "" : " " + kv.Value.Size + (kv.Value.Resource ? " rsc" + kv.Value.ResType : "")));
            return r.ToArray();
        }
        // read one file out (unpacked if it was compressed)
        public static byte[] Extract(string path, byte[] key, string inner) {
            int unknown;
            Node root = Load(path, key, out unknown);
            List<KeyValuePair<string, Node>> all = new List<KeyValuePair<string, Node>>();
            Walk(root, "", all);
            string want = inner.Replace('\\', '/').Trim('/');
            foreach (KeyValuePair<string, Node> kv in all) {
                if (kv.Value.Dir || !String.Equals(kv.Key, want, StringComparison.OrdinalIgnoreCase)) continue;
                byte[] b = new byte[kv.Value.SizeInArchive];
                using (FileStream fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite)) { fs.Position = kv.Value.Offset; ReadAll(fs, b); }
                if (kv.Value.Compressed && !kv.Value.Resource) return Inflate(b, kv.Value.Size);
                return b;
            }
            return null;
        }
        internal static void ReadAll(Stream s, byte[] b) {
            int got = 0;
            while (got < b.Length) { int r = s.Read(b, got, b.Length - got); if (r <= 0) throw new EndOfStreamException("The archive ended early."); got += r; }
        }
        static byte[] Inflate(byte[] data, int size) {
            for (int skip = 0; skip <= 2; skip += 2) {       // raw deflate, or zlib (2-byte header)
                try {
                    using (MemoryStream ms = new MemoryStream(data, skip, data.Length - skip))
                    using (System.IO.Compression.DeflateStream ds = new System.IO.Compression.DeflateStream(ms, System.IO.Compression.CompressionMode.Decompress)) {
                        byte[] outb = new byte[size]; int got = 0;
                        while (got < size) { int r = ds.Read(outb, got, size - got); if (r <= 0) break; got += r; }
                        if (got == size) return outb;
                    }
                } catch { }
            }
            throw new InvalidDataException("Couldn't unpack this file.");
        }
    }

    // GTA IV .img archives (version 3). Some are encrypted with the same key as .rpf archives.
    public static class Img {
        const uint Magic = 0xA94E2A52;
        public class Entry { public string Name; public int Size; public long Offset; public bool Resource; public int Type; }
        public static List<Entry> Read(string path, byte[] key) {
            using (FileStream fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite)) {
                BinaryReader br = new BinaryReader(fs);
                byte[] head = br.ReadBytes(20);
                if (head.Length < 20) throw new InvalidDataException("This isn't a GTA IV .img archive.");
                bool enc = BitConverter.ToUInt32(head, 0) != Magic;
                if (enc) {
                    if (key == null) throw new InvalidDataException("Couldn't find the archive key in GTAIV.exe.");
                    head = Rpf.Decrypt(head, key);
                }
                if (BitConverter.ToUInt32(head, 0) != Magic || BitConverter.ToInt32(head, 4) != 3) throw new InvalidDataException("This isn't a GTA IV .img archive.");
                int count = BitConverter.ToInt32(head, 8), tocSize = BitConverter.ToInt32(head, 12);
                if (count < 0 || tocSize < count * 16 || tocSize > 64 * 1024 * 1024) throw new InvalidDataException("The archive looks damaged.");
                byte[] toc = br.ReadBytes(tocSize);
                if (toc.Length < tocSize) throw new InvalidDataException("The archive looks damaged.");
                if (enc) toc = Rpf.Decrypt(toc, key);
                string[] names = Encoding.ASCII.GetString(toc, count * 16, tocSize - count * 16).Split('\0');
                List<Entry> list = new List<Entry>();
                for (int i = 0; i < count; i++) {
                    int o = i * 16;
                    uint first = BitConverter.ToUInt32(toc, o);
                    int type = BitConverter.ToInt32(toc, o + 4), block = BitConverter.ToInt32(toc, o + 8);
                    int used = BitConverter.ToUInt16(toc, o + 12), flags = BitConverter.ToUInt16(toc, o + 14);
                    Entry e = new Entry();
                    e.Name = i < names.Length ? names[i] : ("file" + i);
                    e.Resource = (first & 0xC0000000) != 0;
                    e.Size = e.Resource ? used * 0x800 - (flags & 0x7FF) : (int)first;
                    e.Offset = (long)block * 0x800; e.Type = type & 0xFF;
                    if (e.Size < 0 || e.Offset + e.Size > fs.Length) throw new InvalidDataException("Couldn't read the archive (wrong key?).");
                    list.Add(e);
                }
                return list;
            }
        }
        // same text format as Rpf.List: "F name size" (+ " rscN" for models/textures)
        public static string[] List(string path, byte[] key) {
            List<string> r = new List<string>();
            foreach (Entry e in Read(path, key)) r.Add("F " + e.Name + " " + e.Size + (e.Resource ? " rsc" + e.Type : ""));
            return r.ToArray();
        }
        public static byte[] Extract(string path, byte[] key, string name) {
            foreach (Entry e in Read(path, key)) {
                if (!String.Equals(e.Name, name, StringComparison.OrdinalIgnoreCase)) continue;
                byte[] b = new byte[e.Size];
                using (FileStream fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite)) { fs.Position = e.Offset; Rpf.ReadAll(fs, b); }
                return b;
            }
            return null;
        }
    }

    // GTA IV texture dictionaries (.wtd): see the pictures, save them, replace one picture.
    // The file layout (pgDictionary / grcTexturePC) follows SparkIV's RageLib by Aru and ahmed605 (GPL v3).
    public class Wtd {
        public class Tex { public string Name; public int Width, Height, Format, Levels, DataOffset, DataSize; }
        public const int DXT1 = 0x31545844, DXT3 = 0x33545844, DXT5 = 0x35545844, ARGB = 0x15, L8 = 0x32;
        byte[] head;               // first 12 bytes (magic, type, flags)
        byte[] sys, gfx;
        public List<Tex> Textures = new List<Tex>();
        public bool Changed;

        static int Mem(uint a, uint b) { return (int)(a << (int)(b + 8)); }
        static int Ptr(byte[] d, int at, int nibble) {
            uint v = BitConverter.ToUInt32(d, at);
            if (v == 0) return -1;
            if ((v >> 28) != nibble) throw new InvalidDataException("This texture file looks damaged.");
            return (int)(v & 0x0FFFFFFF);
        }
        public static Wtd Load(byte[] file) {
            if (file == null || file.Length < 16 || BitConverter.ToUInt32(file, 0) != 0x05435352) throw new InvalidDataException("This isn't a GTA IV texture file.");
            if (BitConverter.ToUInt32(file, 4) != 8) throw new InvalidDataException("This file isn't a texture dictionary (.wtd).");
            if (file[12] != 0x78 || file[13] != 0xDA) throw new InvalidDataException("This texture file is packed in a way that isn't supported (console version?).");
            Wtd w = new Wtd();
            w.head = new byte[12]; Buffer.BlockCopy(file, 0, w.head, 0, 12);
            uint flags = BitConverter.ToUInt32(file, 8);
            int sysSize = Mem(flags & 0x7FF, (flags >> 11) & 0xF), gfxSize = Mem((flags >> 15) & 0x7FF, (flags >> 26) & 0xF);
            byte[] all = new byte[sysSize + gfxSize];
            using (MemoryStream ms = new MemoryStream(file, 14, file.Length - 14))
            using (System.IO.Compression.DeflateStream ds = new System.IO.Compression.DeflateStream(ms, System.IO.Compression.CompressionMode.Decompress)) {
                int got = 0; while (got < all.Length) { int r = ds.Read(all, got, all.Length - got); if (r <= 0) break; got += r; }
            }
            w.sys = new byte[sysSize]; w.gfx = new byte[gfxSize];
            Buffer.BlockCopy(all, 0, w.sys, 0, sysSize); Buffer.BlockCopy(all, sysSize, w.gfx, 0, gfxSize);
            byte[] s = w.sys;
            int count = BitConverter.ToUInt16(s, 20);
            int list = Ptr(s, 24, 5);
            for (int i = 0; i < count; i++) {
                int ti = Ptr(s, list + i * 4, 5);
                Tex t = new Tex();
                int nameAt = Ptr(s, ti + 20, 5);
                int end = nameAt; while (end < s.Length && s[end] != 0) end++;
                t.Name = Encoding.ASCII.GetString(s, nameAt, end - nameAt);
                if (t.Name.StartsWith("pack:/")) t.Name = t.Name.Substring(6);
                if (t.Name.EndsWith(".dds", StringComparison.OrdinalIgnoreCase)) t.Name = t.Name.Substring(0, t.Name.Length - 4);
                t.Width = BitConverter.ToUInt16(s, ti + 28); t.Height = BitConverter.ToUInt16(s, ti + 30);
                t.Format = BitConverter.ToInt32(s, ti + 32); t.Levels = Math.Max(1, (int)s[ti + 39]);
                t.DataOffset = Ptr(s, ti + 72, 6);
                int total = 0;
                for (int l = 0; l < t.Levels; l++) total += LevelSize(t, l);
                t.DataSize = Math.Min(total, w.gfx.Length - t.DataOffset);
                w.Textures.Add(t);
            }
            return w;
        }
        public static int LevelW(Tex t, int l) { return Math.Max(1, t.Width >> l); }
        public static int LevelH(Tex t, int l) { return Math.Max(1, t.Height >> l); }
        public static int LevelSize(Tex t, int l) {
            int w = LevelW(t, l), h = LevelH(t, l);
            switch (t.Format) {
                case DXT1: return Math.Max(1, (w + 3) / 4) * Math.Max(1, (h + 3) / 4) * 8;
                case DXT3: case DXT5: return Math.Max(1, (w + 3) / 4) * Math.Max(1, (h + 3) / 4) * 16;
                case ARGB: return w * h * 4;
                case L8: return w * h;
            }
            throw new InvalidDataException("Unknown picture format.");
        }
        public static string FormatName(int f) { switch (f) { case DXT1: return "DXT1"; case DXT3: return "DXT3"; case DXT5: return "DXT5"; case ARGB: return "A8R8G8B8"; case L8: return "L8"; } return "0x" + f.ToString("X"); }

        // ---- picture out ----
        // raw picture data -> B G R A pixels
        public static byte[] Decode(byte[] gfx, int o, int w, int h, int fmt) {
            byte[] px = new byte[w * h * 4];
                        if (fmt == ARGB) Buffer.BlockCopy(gfx, o, px, 0, Math.Min(px.Length, gfx.Length - o));
            else if (fmt == L8) { for (int i = 0; i < w * h && o + i < gfx.Length; i++) { px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = gfx[o + i]; px[i * 4 + 3] = 255; } }
            else {
                int bw = Math.Max(1, (w + 3) / 4), bh = Math.Max(1, (h + 3) / 4), bs = fmt == DXT1 ? 8 : 16;
                uint[] pal = new uint[4]; byte[] al = new byte[16];
                for (int by = 0; by < bh; by++) for (int bx = 0; bx < bw; bx++) {
                    int b = o + (by * bw + bx) * bs;
                    if (b + bs > gfx.Length) continue;
                    int c = b;
                    if (fmt == DXT3) { for (int i = 0; i < 16; i++) { int v = (gfx[b + i / 2] >> ((i & 1) * 4)) & 0xF; al[i] = (byte)(v * 17); } c = b + 8; }
                    else if (fmt == DXT5) { DecodeAlpha(gfx, b, al); c = b + 8; }
                    Palette(BitConverter.ToUInt16(gfx, c), BitConverter.ToUInt16(gfx, c + 2), fmt == DXT1, pal);
                    uint idx = BitConverter.ToUInt32(gfx, c + 4);
                    for (int i = 0; i < 16; i++) {
                        int x = bx * 4 + (i & 3), y = by * 4 + (i >> 2);
                        if (x >= w || y >= h) continue;
                        uint col = pal[(idx >> (i * 2)) & 3];
                        int p = (y * w + x) * 4;
                        px[p] = (byte)col; px[p + 1] = (byte)(col >> 8); px[p + 2] = (byte)(col >> 16);
                        px[p + 3] = fmt == DXT1 ? (byte)(col >> 24) : al[i];
                    }
                }
            }
            return px;
        }
        public Bitmap Picture(int index) {
            Tex t = Textures[index];
            int w = t.Width, h = t.Height;
            byte[] px = Decode(gfx, t.DataOffset, w, h, t.Format);
            Bitmap bmp = new Bitmap(w, h, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
            System.Drawing.Imaging.BitmapData bd = bmp.LockBits(new Rectangle(0, 0, w, h), System.Drawing.Imaging.ImageLockMode.WriteOnly, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
            for (int y = 0; y < h; y++) Marshal.Copy(px, y * w * 4, new IntPtr(bd.Scan0.ToInt64() + (long)y * bd.Stride), w * 4);
            bmp.UnlockBits(bd);
            return bmp;
        }
        static uint Rgb(int c) {   // 565 -> 0xAARRGGBB
            int r = (c >> 11) & 31, g = (c >> 5) & 63, b = c & 31;
            return 0xFF000000u | (uint)(((r << 3) | (r >> 2)) << 16) | (uint)(((g << 2) | (g >> 4)) << 8) | (uint)((b << 3) | (b >> 2));
        }
        static uint Mix(uint a, uint b, int wa, int wb, int div) {
            uint r = 0xFF000000u;
            for (int sh = 0; sh < 24; sh += 8) r |= (uint)((((a >> sh) & 255) * wa + ((b >> sh) & 255) * wb) / div) << sh;
            return r;
        }
        static void Palette(int c0, int c1, bool dxt1, uint[] pal) {
            pal[0] = Rgb(c0); pal[1] = Rgb(c1);
            if (c0 > c1 || !dxt1) { pal[2] = Mix(pal[0], pal[1], 2, 1, 3); pal[3] = Mix(pal[0], pal[1], 1, 2, 3); }
            else { pal[2] = Mix(pal[0], pal[1], 1, 1, 2); pal[3] = 0; }
        }
        static void DecodeAlpha(byte[] d, int b, byte[] al) {
            int a0 = d[b], a1 = d[b + 1];
            int[] a = new int[8]; a[0] = a0; a[1] = a1;
            if (a0 > a1) for (int i = 1; i < 7; i++) a[i + 1] = ((7 - i) * a0 + i * a1) / 7;
            else { for (int i = 1; i < 5; i++) a[i + 1] = ((5 - i) * a0 + i * a1) / 5; a[6] = 0; a[7] = 255; }
            ulong bits = 0; for (int i = 0; i < 6; i++) bits |= (ulong)d[b + 2 + i] << (8 * i);
            for (int i = 0; i < 16; i++) al[i] = (byte)a[(int)((bits >> (3 * i)) & 7)];
        }

        // ---- picture in: resized to the same size, all smaller levels made again ----
        public void Replace(int index, Image img) {
            Tex t = Textures[index];
            int pos = t.DataOffset, end = t.DataOffset + t.DataSize;
            for (int l = 0; l < t.Levels; l++) {
                int w = LevelW(t, l), h = LevelH(t, l), size = LevelSize(t, l);
                if (pos + size > end) break;
                byte[] px = Pixels(img, w, h);
                byte[] enc = Encode(px, w, h, t.Format);
                Buffer.BlockCopy(enc, 0, gfx, pos, Math.Min(size, enc.Length));
                pos += size;
            }
            Changed = true;
        }
        static byte[] Pixels(Image img, int w, int h) {
            using (Bitmap bmp = new Bitmap(w, h, System.Drawing.Imaging.PixelFormat.Format32bppArgb)) {
                using (Graphics g = Graphics.FromImage(bmp)) {
                    g.CompositingMode = CompositingMode.SourceCopy;
                    g.InterpolationMode = InterpolationMode.HighQualityBicubic; g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                    using (System.Drawing.Imaging.ImageAttributes ia = new System.Drawing.Imaging.ImageAttributes()) {
                        ia.SetWrapMode(WrapMode.TileFlipXY);
                        g.DrawImage(img, new Rectangle(0, 0, w, h), 0, 0, img.Width, img.Height, GraphicsUnit.Pixel, ia);
                    }
                }
                byte[] px = new byte[w * h * 4];
                System.Drawing.Imaging.BitmapData bd = bmp.LockBits(new Rectangle(0, 0, w, h), System.Drawing.Imaging.ImageLockMode.ReadOnly, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
                for (int y = 0; y < h; y++) Marshal.Copy(new IntPtr(bd.Scan0.ToInt64() + (long)y * bd.Stride), px, y * w * 4, w * 4);
                bmp.UnlockBits(bd);
                return px;   // B G R A
            }
        }
        public static byte[] Encode(byte[] px, int w, int h, int fmt) {
            if (fmt == ARGB) return px;
            if (fmt == L8) { byte[] o = new byte[w * h]; for (int i = 0; i < o.Length; i++) o[i] = (byte)((px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2]) / 3); return o; }
            int bw = Math.Max(1, (w + 3) / 4), bh = Math.Max(1, (h + 3) / 4), bs = fmt == DXT1 ? 8 : 16;
            byte[] outb = new byte[bw * bh * bs];
            int[] r = new int[16], g = new int[16], b = new int[16], a = new int[16];
            for (int by = 0; by < bh; by++) for (int bx = 0; bx < bw; bx++) {
                for (int i = 0; i < 16; i++) {
                    int x = Math.Min(w - 1, bx * 4 + (i & 3)), y = Math.Min(h - 1, by * 4 + (i >> 2));
                    int p = (y * w + x) * 4;
                    b[i] = px[p]; g[i] = px[p + 1]; r[i] = px[p + 2]; a[i] = px[p + 3];
                }
                int o = (by * bw + bx) * bs, c = o;
                if (fmt == DXT3) { for (int i = 0; i < 16; i += 2) outb[o + i / 2] = (byte)(((a[i] * 15 + 127) / 255) | (((a[i + 1] * 15 + 127) / 255) << 4)); c = o + 8; }
                else if (fmt == DXT5) { EncodeAlpha(a, outb, o); c = o + 8; }
                EncodeColor(r, g, b, a, fmt == DXT1, outb, c);
            }
            return outb;
        }
        static int To565(int r, int g, int b) { return ((Math.Min(255, Math.Max(0, r)) >> 3) << 11) | ((Math.Min(255, Math.Max(0, g)) >> 2) << 5) | (Math.Min(255, Math.Max(0, b)) >> 3); }
        static void EncodeColor(int[] r, int[] g, int[] b, int[] a, bool dxt1, byte[] o, int at) {
            bool holes = false;
            if (dxt1) for (int i = 0; i < 16; i++) if (a[i] < 128) holes = true;
            // the two end colors: along the line through the block's colors (brightest vs darkest spread), pulled in a little
            int mr = 0, mg = 0, mb = 0, n = 0;
            for (int i = 0; i < 16; i++) { if (holes && a[i] < 128) continue; mr += r[i]; mg += g[i]; mb += b[i]; n++; }
            if (n == 0) { o[at] = 0; o[at + 1] = 0; o[at + 2] = 0; o[at + 3] = 0; o[at + 4] = o[at + 5] = o[at + 6] = o[at + 7] = 0xFF; return; }
            mr /= n; mg /= n; mb /= n;
            // main direction (rough): the biggest spread of r, g, b together
            double cr = 0, cg = 0, cb = 0;
            for (int i = 0; i < 16; i++) { if (holes && a[i] < 128) continue; int dr = r[i] - mr, dg = g[i] - mg, db = b[i] - mb; int s = (dr + dg + db) >= 0 ? 1 : -1; cr += dr * s; cg += dg * s; cb += db * s; }
            if (cr == 0 && cg == 0 && cb == 0) { cr = cg = cb = 1; }
            double lo = double.MaxValue, hi = double.MinValue;
            for (int i = 0; i < 16; i++) { if (holes && a[i] < 128) continue; double d = (r[i] - mr) * cr + (g[i] - mg) * cg + (b[i] - mb) * cb; if (d < lo) lo = d; if (d > hi) hi = d; }
            double len = cr * cr + cg * cg + cb * cb;
            double inset = (hi - lo) / 16.0; lo += inset; hi -= inset;
            int c0 = To565((int)(mr + cr * hi / len), (int)(mg + cg * hi / len), (int)(mb + cb * hi / len));
            int c1 = To565((int)(mr + cr * lo / len), (int)(mg + cg * lo / len), (int)(mb + cb * lo / len));
            if (holes) { if (c0 > c1) { int tt = c0; c0 = c1; c1 = tt; } }
            else { if (c0 < c1) { int tt = c0; c0 = c1; c1 = tt; } if (c0 == c1) { if (c1 > 0) c1--; else c0++; } }
            uint[] pal = new uint[4]; Palette(c0, c1, dxt1, pal);
            uint idx = 0;
            for (int i = 0; i < 16; i++) {
                int best = 0;
                if (holes && a[i] < 128) best = 3;
                else {
                    int bd = int.MaxValue;
                    for (int k = 0; k < (holes ? 3 : 4); k++) {
                        int dr = (int)((pal[k] >> 16) & 255) - r[i], dg = (int)((pal[k] >> 8) & 255) - g[i], db = (int)(pal[k] & 255) - b[i];
                        int dd = dr * dr * 3 + dg * dg * 4 + db * db * 2;
                        if (dd < bd) { bd = dd; best = k; }
                    }
                }
                idx |= (uint)best << (i * 2);
            }
            o[at] = (byte)c0; o[at + 1] = (byte)(c0 >> 8); o[at + 2] = (byte)c1; o[at + 3] = (byte)(c1 >> 8);
            o[at + 4] = (byte)idx; o[at + 5] = (byte)(idx >> 8); o[at + 6] = (byte)(idx >> 16); o[at + 7] = (byte)(idx >> 24);
        }
        static void EncodeAlpha(int[] a, byte[] o, int at) {
            int lo = 255, hi = 0;
            for (int i = 0; i < 16; i++) { if (a[i] < lo) lo = a[i]; if (a[i] > hi) hi = a[i]; }
            o[at] = (byte)hi; o[at + 1] = (byte)lo;
            int[] pal = new int[8]; pal[0] = hi; pal[1] = lo;
            for (int i = 1; i < 7; i++) pal[i + 1] = ((7 - i) * hi + i * lo) / 7;
            ulong bits = 0;
            for (int i = 0; i < 16; i++) {
                int best = 0, bd = int.MaxValue;
                if (hi != lo) for (int k = 0; k < 8; k++) { int d = Math.Abs(pal[k] - a[i]); if (d < bd) { bd = d; best = k; } }
                bits |= (ulong)best << (3 * i);
            }
            for (int i = 0; i < 6; i++) o[at + 2 + i] = (byte)(bits >> (8 * i));
        }

        // ---- the whole file again (same size in memory, so the archive entry stays valid) ----
        public byte[] Save() {
            byte[] all = new byte[sys.Length + gfx.Length];
            Buffer.BlockCopy(sys, 0, all, 0, sys.Length); Buffer.BlockCopy(gfx, 0, all, sys.Length, gfx.Length);
            using (MemoryStream outs = new MemoryStream()) {
                outs.Write(head, 0, 12); outs.WriteByte(0x78); outs.WriteByte(0xDA);
                using (System.IO.Compression.DeflateStream ds = new System.IO.Compression.DeflateStream(outs, System.IO.Compression.CompressionLevel.Optimal, true)) ds.Write(all, 0, all.Length);
                return outs.ToArray();
            }
        }
        // test helper: builds a small texture file
        public static byte[] MakeTest(string[] names, int w, int h, int fmt, int levels) {
            int n = names.Length;
            int sysSize = 0x2000, gfxNeed = 0;
            Tex tt = new Tex(); tt.Width = w; tt.Height = h; tt.Format = fmt; tt.Levels = levels;
            int per = 0; for (int l = 0; l < levels; l++) per += LevelSize(tt, l);
            gfxNeed = per * n;
            int gb = 0; while ((0x7FF << (gb + 8)) < gfxNeed) gb++;
            int ga = (gfxNeed + (1 << (gb + 8)) - 1) >> (gb + 8);
            int gfxSize = ga << (gb + 8);
            byte[] s = new byte[sysSize]; byte[] gf = new byte[gfxSize];
            Action<int, uint> W = delegate(int at, uint v) { byte[] bb = BitConverter.GetBytes(v); Buffer.BlockCopy(bb, 0, s, at, 4); };
            W(20, (uint)n); W(24, 0x50000000u | 0x100u);
            for (int i = 0; i < n; i++) {
                int ti = 0x200 + i * 0x80, nm = 0x1000 + i * 0x80;
                W(0x100 + i * 4, 0x50000000u | (uint)ti);
                W(ti + 20, 0x50000000u | (uint)nm);
                byte[] nb = Encoding.ASCII.GetBytes("pack:/" + names[i] + ".dds"); Buffer.BlockCopy(nb, 0, s, nm, nb.Length);
                s[ti + 28] = (byte)w; s[ti + 29] = (byte)(w >> 8); s[ti + 30] = (byte)h; s[ti + 31] = (byte)(h >> 8);
                W(ti + 32, (uint)fmt); s[ti + 39] = (byte)levels;
                W(ti + 72, 0x60000000u | (uint)(i * per));
            }
            uint flags = 0xC0000000u | (uint)(sysSize >> 8) | (0u << 11) | ((uint)ga << 15) | ((uint)gb << 26);
            // sys: 0x2000 = 0x20 << 8
            flags = 0xC0000000u | 0x20u | ((uint)ga << 15) | ((uint)gb << 26);
            Wtd w2 = new Wtd(); w2.head = new byte[12];
            Buffer.BlockCopy(BitConverter.GetBytes(0x05435352u), 0, w2.head, 0, 4); Buffer.BlockCopy(BitConverter.GetBytes(8u), 0, w2.head, 4, 4); Buffer.BlockCopy(BitConverter.GetBytes(flags), 0, w2.head, 8, 4);
            w2.sys = s; w2.gfx = gf;
            return w2.Save();
        }
    }

    // Moving backgrounds: animated GIFs and videos (muted, looping) painted into a control's BackgroundImage.
    // One clip is shared by every control that uses the same file. Videos use Windows' own player (WPF MediaPlayer),
    // reached through reflection so this library doesn't need WPF to build.
    // ------------------------------------------------------------------
    //  Fast pictures for the video background: plain Windows (GDI) bitmaps, copied with BitBlt
    // ------------------------------------------------------------------
    public class Dib {
        public IntPtr H; public int W, Hgt;
        public Dib Dark;   // the same picture, darkened and at the video's own (small) size - for the dark panels behind text
        public int MapX, MapY, MapW, MapH;   // where the video sits on the page
    }
    public static class Gdi {
        [StructLayout(LayoutKind.Sequential)] public struct BITMAPINFOHEADER { public int biSize, biWidth, biHeight; public short biPlanes, biBitCount; public int biCompression, biSizeImage, biXPelsPerMeter, biYPelsPerMeter, biClrUsed, biClrImportant; }
        [DllImport("gdi32.dll")] public static extern IntPtr CreateCompatibleDC(IntPtr hdc);
        [DllImport("gdi32.dll")] public static extern bool DeleteDC(IntPtr hdc);
        [DllImport("gdi32.dll")] public static extern IntPtr SelectObject(IntPtr hdc, IntPtr obj);
        [DllImport("gdi32.dll")] public static extern bool DeleteObject(IntPtr obj);
        [DllImport("gdi32.dll")] public static extern bool BitBlt(IntPtr dst, int x, int y, int w, int h, IntPtr src, int sx, int sy, int rop);
        [DllImport("gdi32.dll")] public static extern bool PatBlt(IntPtr hdc, int x, int y, int w, int h, int rop);
        [DllImport("gdi32.dll")] public static extern int SetStretchBltMode(IntPtr hdc, int mode);
        [DllImport("gdi32.dll")] public static extern bool SetBrushOrgEx(IntPtr hdc, int x, int y, IntPtr prev);
        [DllImport("gdi32.dll")] public static extern int StretchDIBits(IntPtr hdc, int dx, int dy, int dw, int dh, int sx, int sy, int sw, int sh, byte[] bits, ref BITMAPINFOHEADER bmi, int usage, int rop);
        [DllImport("gdi32.dll")] public static extern IntPtr CreateDIBSection(IntPtr hdc, ref BITMAPINFOHEADER bmi, int usage, out IntPtr bits, IntPtr section, int offset);
        [DllImport("gdi32.dll")] public static extern bool GdiFlush();
        [DllImport("gdi32.dll")] public static extern bool StretchBlt(IntPtr dst, int x, int y, int w, int h, IntPtr src, int sx, int sy, int sw, int sh, int rop);
        [DllImport("gdi32.dll")] public static extern int SetDIBitsToDevice(IntPtr hdc, int x, int y, int w, int h, int sx, int sy, int start, int lines, byte[] bits, ref BITMAPINFOHEADER bmi, int usage);
        public const int SRCCOPY = 0x00CC0020, BLACKNESS = 0x00000042, HALFTONE = 4, COLORONCOLOR = 3;
        public static BITMAPINFOHEADER Header(int w, int h) {
            BITMAPINFOHEADER b = new BITMAPINFOHEADER();
            b.biSize = 40; b.biWidth = w; b.biHeight = -h; b.biPlanes = 1; b.biBitCount = 32; b.biCompression = 0;
            return b;
        }
        public static Dib NewDib(int w, int h) {
            BITMAPINFOHEADER b = Header(w, h);
            IntPtr bits;
            IntPtr hb = CreateDIBSection(IntPtr.Zero, ref b, 0, out bits, IntPtr.Zero, 0);
            if (hb == IntPtr.Zero) return null;
            Dib d = new Dib(); d.H = hb; d.W = w; d.Hgt = h; return d;
        }
        public static void Free(Dib d) { if (d == null) return; if (d.H != IntPtr.Zero) { DeleteObject(d.H); d.H = IntPtr.Zero; } if (d.Dark != null) { Free(d.Dark); d.Dark = null; } }
    }
    // dark panels behind text: over a video they show the darkened video picture (one quick copy)
    public static class Glass {
        static readonly Dictionary<Control, bool> all = new Dictionary<Control, bool>();
        static IntPtr dc;
        public static bool Has(Control c) { return all.ContainsKey(c); }
        public static void Attach(Control p) {
            if (p == null || all.ContainsKey(p)) return;
            all[p] = true;
            p.Paint += OnPaint;
            p.Disposed += delegate(object s, EventArgs e) { all.Remove((Control)s); };
        }
        static void OnPaint(object sender, PaintEventArgs e) {
            Control p = (Control)sender;
            VideoPanel vp = null;
            for (Control a = p.Parent; a != null; a = a.Parent) { vp = a as VideoPanel; if (vp != null) break; }
            if (vp == null || vp.Video == null || vp.Video.Dark == null || vp.Video.Dark.H == IntPtr.Zero) return;
            Dib d = vp.Video.Dark;
            Graphics g = e.Graphics;
            Rectangle r;
            try { r = Rectangle.Intersect(Rectangle.Ceiling(g.ClipBounds), p.ClientRectangle); } catch { r = p.ClientRectangle; }
            if (r.Width <= 0 || r.Height <= 0) return;
            float ox = 0, oy = 0;
            try { using (System.Drawing.Drawing2D.Matrix m = g.Transform) { ox = m.OffsetX; oy = m.OffsetY; } } catch { }
            Point o = vp.PointToClient(p.PointToScreen(Point.Empty));
            Dib v = vp.Video;
            if (v.MapW <= 0 || v.MapH <= 0) return;
            IntPtr hdc = g.GetHdc();
            try {
                if (dc == IntPtr.Zero) dc = Gdi.CreateCompatibleDC(IntPtr.Zero);
                IntPtr old = Gdi.SelectObject(dc, d.H);
                // page area -> the matching part of the small dark picture
                double kx = (double)d.W / v.MapW, ky = (double)d.Hgt / v.MapH;
                int px = r.X + o.X, py = r.Y + o.Y;
                double sx = (px - v.MapX) * kx, sy = (py - v.MapY) * ky, sw = r.Width * kx, sh = r.Height * ky;
                Gdi.SetStretchBltMode(hdc, Gdi.COLORONCOLOR);
                Gdi.StretchBlt(hdc, r.X + (int)ox, r.Y + (int)oy, r.Width, r.Height, dc, (int)Math.Floor(sx), (int)Math.Floor(sy), Math.Max(1, (int)Math.Round(sw)), Math.Max(1, (int)Math.Round(sh)), Gdi.SRCCOPY);
                Gdi.SelectObject(dc, old);
            } finally { g.ReleaseHdc(hdc); }
        }
    }
    // a page that can show the video background with one quick copy (also for the see-through parts on it)
    public class VideoPanel : Panel {
        public Dib Video;
        static IntPtr uiDC;
        public VideoPanel() { DoubleBuffered = true; }
        protected override void OnPaintBackground(PaintEventArgs e) {
            Dib d = Video;
            if (d == null || d.H == IntPtr.Zero) { base.OnPaintBackground(e); return; }
            Graphics g = e.Graphics;
            Rectangle r;
            try { RectangleF cb = g.ClipBounds; r = Rectangle.Intersect(Rectangle.Ceiling(cb), ClientRectangle); } catch { r = ClientRectangle; }
            if (r.Width <= 0 || r.Height <= 0) return;
            float ox = 0, oy = 0;
            try { using (System.Drawing.Drawing2D.Matrix m = g.Transform) { ox = m.OffsetX; oy = m.OffsetY; } } catch { }
            IntPtr hdc = g.GetHdc();
            try {
                if (uiDC == IntPtr.Zero) uiDC = Gdi.CreateCompatibleDC(IntPtr.Zero);
                IntPtr old = Gdi.SelectObject(uiDC, d.H);
                int x = r.X + (int)ox, y = r.Y + (int)oy;
                int cw = Math.Min(r.Width, Math.Max(0, d.W - r.X)), ch = Math.Min(r.Height, Math.Max(0, d.Hgt - r.Y));
                if (cw > 0 && ch > 0) Gdi.BitBlt(hdc, x, y, cw, ch, uiDC, r.X, r.Y, Gdi.SRCCOPY);
                if (cw < r.Width) Gdi.PatBlt(hdc, x + Math.Max(0, cw), y, r.Width - Math.Max(0, cw), r.Height, Gdi.BLACKNESS);
                if (ch < r.Height) Gdi.PatBlt(hdc, x, y + Math.Max(0, ch), r.Width, r.Height - Math.Max(0, ch), Gdi.BLACKNESS);
                Gdi.SelectObject(uiDC, old);
            } finally { g.ReleaseHdc(hdc); }
        }
    }

    public static class Motion {
        class Clip {
            public string Path; public int Dim; public bool Video;
            public List<Control> Targets = new List<Control>();
            public Bitmap Frame; public Timer Tick; public int Idle; public Bitmap Out; public string Fit = "Fill";
            // gif
            public Image Gif; public MemoryStream GifData; public int FrameCount, At; public int[] Delays; public int Wait;
            // video: decoded and drawn on its own thread; the window only swaps in the finished picture
            public object Player, Visual, Rtb; public byte[] Buf; public int W, H;
            public System.Threading.Thread Worker; public System.Windows.Threading.Dispatcher Disp;
            public readonly object Gate = new object();
            public Bitmap Placeholder; public bool NewFrame;
            public Dib DBack, DReady, DFront; public IntPtr WorkDC; public byte[] DimLut;
            public byte[] DarkBuf; public byte[][] DarkLut;
            public volatile int WantW = 1280, WantH = 720; public volatile bool Slow, Hidden, Alive;
            public long LastPos = -1; public int SlowCount;
            public int LastShow, MinGap = 33;   // the window keeps up: the video never takes more than ~40% of its time
        }
        static readonly Dictionary<string, Clip> byKey = new Dictionary<string, Clip>();
        static readonly Dictionary<string, Control> ctlOf = new Dictionary<string, Control>();
        static readonly List<Clip> clips = new List<Clip>();
        public static int MaxWidth = 854;
        public static int GlassAlpha = 205;   // how dark the panels behind text are over a video (0-255)
        // timing log (only when LogPath is set): how long each step takes
        public static string LogPath;
        static int logAt, nShown, nMade; static long paintMs, grabMs, composeMs; static int lastW, lastH;
        static void Stat() {
            if (LogPath == null) return;
            int now = Environment.TickCount;
            if (logAt == 0) { logAt = now; return; }
            if (unchecked(now - logAt) < 3000) return;
            double sec = unchecked(now - logAt) / 1000.0;
            try {
                File.AppendAllText(LogPath, DateTime.Now.ToString("HH:mm:ss") + string.Format("  shown {0:0.0}/s  made {1:0.0}/s  paint {2}ms  grab {3}ms  compose {4}ms  size {5}x{6}\r\n",
                    nShown / sec, nMade / sec, nShown > 0 ? paintMs / nShown : 0, nMade > 0 ? grabMs / nMade : 0, nMade > 0 ? composeMs / nMade : 0, lastW, lastH));
            } catch { }
            logAt = now; nShown = 0; nMade = 0; paintMs = 0; grabMs = 0; composeMs = 0;
        }
        public static string LastError = "";

        public static bool IsMoving(string path) {
            string ext = System.IO.Path.GetExtension(path).ToLowerInvariant();
            if (ext == ".mp4" || ext == ".wmv" || ext == ".avi" || ext == ".mov" || ext == ".m4v" || ext == ".mkv" || ext == ".webm") return true;
            if (ext == ".gif") {
                try { using (Image g = Image.FromStream(new MemoryStream(File.ReadAllBytes(path)))) return g.GetFrameCount(System.Drawing.Imaging.FrameDimension.Time) > 1; }
                catch { return false; }
            }
            return false;
        }
        // returns the picture the control shows (updated in place), or null if it couldn't start
        public static Bitmap Start(string key, Control target, string path, int dim) { return Start(key, target, path, dim, "Fill"); }
        public static Bitmap Start(string key, Control target, string path, int dim, string fit) {
            Stop(key);
            LastError = "";
            Clip c = null;
            foreach (Clip x in clips) if (x.Path == path && x.Dim == dim) { c = x; break; }
            if (c == null) {
                c = new Clip(); c.Path = path; c.Dim = dim; c.Fit = fit ?? "Fill";
                string ext = System.IO.Path.GetExtension(path).ToLowerInvariant();
                c.Video = ext != ".gif";
                try { if (c.Video) OpenVideo(c, target); else OpenGif(c); }
                catch (Exception e) { Exception i = e; while (i.InnerException != null) i = i.InnerException; LastError = i.Message; Dispose(c); return null; }
                c.Tick = new Timer(); c.Tick.Interval = c.Video ? 16 : 20;
                Clip cc = c; c.Tick.Tick += delegate { Step(cc); };
                clips.Add(c);
                c.Tick.Start();
            }
            c.Targets.Add(target);
            byKey[key] = c; ctlOf[key] = target;
            Smooth.ForVideo(target, true);
            if (c.Video) return c.Placeholder;
            return c.Out ?? c.Frame;
        }
        public static void Stop(string key) {
            Clip c;
            if (!byKey.TryGetValue(key, out c)) return;
            Control t = ctlOf[key];
            byKey.Remove(key); ctlOf.Remove(key);
            c.Targets.Remove(t);
            try { if (IsOurs(c, t.BackgroundImage)) t.BackgroundImage = null; } catch { }
            VideoPanel vp = t as VideoPanel; if (vp != null && c.Video) { vp.Video = null; vp.Invalidate(); }
            Smooth.ForVideo(t, false);
            if (c.Targets.Count == 0) { clips.Remove(c); Dispose(c); }
        }
        public static void StopAll() { foreach (Clip c in clips.ToArray()) Dispose(c); clips.Clear(); byKey.Clear(); ctlOf.Clear(); }
        public static void Forget(Control target) { foreach (Clip c in clips) c.Targets.Remove(target); }
        static bool IsOurs(Clip c, Image img) {
            if (img == null) return false;
            return img == c.Frame || img == c.Out || img == c.Placeholder;
        }

        static void Dispose(Clip c) {
            try { if (c.Tick != null) { c.Tick.Stop(); c.Tick.Dispose(); } } catch { }
            foreach (Control t in c.Targets) { try { if (IsOurs(c, t.BackgroundImage)) t.BackgroundImage = null; } catch { } }
            if (c.Video) {
                c.Alive = false;
                System.Windows.Threading.Dispatcher d = c.Disp;
                if (d != null) {
                    try { d.Invoke(new Action(delegate { try { if (c.Player != null) { Call(c.Player, "Stop"); Call(c.Player, "Close"); } } catch { } try { if (c.WorkDC != IntPtr.Zero) { Gdi.DeleteDC(c.WorkDC); c.WorkDC = IntPtr.Zero; } } catch { } })); } catch { }
                    try { d.BeginInvokeShutdown(System.Windows.Threading.DispatcherPriority.Send); } catch { }
                }
                try { if (c.Worker != null) c.Worker.Join(1500); } catch { }
            }
            try { if (c.Gif != null) c.Gif.Dispose(); if (c.GifData != null) c.GifData.Dispose(); } catch { }
            foreach (Control t in c.Targets) { VideoPanel vp = t as VideoPanel; if (vp != null && c.Video) vp.Video = null; }
            lock (c.Gate) {
                foreach (Bitmap b in new Bitmap[] { c.Frame, c.Out, c.Placeholder }) { try { if (b != null) b.Dispose(); } catch { } }
                c.Frame = null; c.Out = null; c.Placeholder = null;
                Gdi.Free(c.DFront); Gdi.Free(c.DReady); Gdi.Free(c.DBack); c.DFront = null; c.DReady = null; c.DBack = null;
            }
            c.Targets.Clear();
        }
        static bool AnyVisible(Clip c) {
            foreach (Control t in c.Targets) {
                if (t == null || t.IsDisposed || !t.Visible || !t.IsHandleCreated) continue;
                Form f = t.FindForm();
                if (f != null && f.WindowState == FormWindowState.Minimized) continue;
                return true;
            }
            return false;
        }
        static void Shade(Clip c) {
            if (c.Dim <= 0 || c.Frame == null) return;
            using (Graphics g = Graphics.FromImage(c.Frame))
            using (SolidBrush b = new SolidBrush(Color.FromArgb(255 * c.Dim / 100, 0, 0, 0))) g.FillRectangle(b, 0, 0, c.Frame.Width, c.Frame.Height);
        }
        // draws the frame at the given size (cover / fit / center / tile)
        static void Compose(Clip c, Bitmap dst) {
            int w = dst.Width, h = dst.Height;
            using (Graphics g = Graphics.FromImage(dst)) {
                g.CompositingMode = CompositingMode.SourceCopy;
                g.CompositingQuality = CompositingQuality.HighSpeed;
                g.InterpolationMode = InterpolationMode.Bilinear; g.PixelOffsetMode = PixelOffsetMode.Half;
                int sw = c.Frame.Width, sh = c.Frame.Height;
                if (c.Fit == "Fit" || c.Fit == "Center" || c.Fit == "Tile") g.Clear(Color.Black);
                if (c.Fit == "Tile") { g.CompositingMode = CompositingMode.SourceOver; using (TextureBrush tb = new TextureBrush(c.Frame)) g.FillRectangle(tb, 0, 0, w, h); }
                else if (c.Fit == "Center") g.DrawImage(c.Frame, (w - sw) / 2, (h - sh) / 2, sw, sh);
                else if (c.Fit == "Fit") { double k = Math.Min((double)w / sw, (double)h / sh); int dw = (int)(sw * k), dh = (int)(sh * k); g.DrawImage(c.Frame, (w - dw) / 2, (h - dh) / 2, dw, dh); }
                else { double k = Math.Max((double)w / sw, (double)h / sh); int dw = (int)Math.Ceiling(sw * k), dh = (int)Math.Ceiling(sh * k); g.DrawImage(c.Frame, (w - dw) / 2, (h - dh) / 2, dw, dh); }
            }
        }
        // redraw only the page and the see-through parts on it (solid lists, boxes and buttons don't change)
        static void SeeThrough(Control c) {
            c.Invalidate(false);
            foreach (Control k in c.Controls) {
                if (!k.Visible) continue;
                if (k.BackColor.A < 255 || Glass.Has(k)) SeeThrough(k);
            }
        }
        static Control FirstVisible(Clip c) {
            foreach (Control t in c.Targets) if (t != null && !t.IsDisposed && t.Visible) return t;
            return null;
        }
        // GIF: one picture made at the window's size per frame
        static void Show(Clip c) {
            Control first = FirstVisible(c);
            if (first != null && c.Frame != null) {
                int w = Math.Max(1, first.ClientSize.Width), h = Math.Max(1, first.ClientSize.Height);
                Bitmap old = null;
                if (c.Out == null || c.Out.Width != w || c.Out.Height != h) { old = c.Out; c.Out = new Bitmap(w, h, System.Drawing.Imaging.PixelFormat.Format32bppPArgb); }
                Compose(c, c.Out);
                foreach (Control t in c.Targets) {
                    if (t == null || t.IsDisposed) continue;
                    if (t.BackgroundImage != c.Out) { t.BackgroundImage = c.Out; t.BackgroundImageLayout = ImageLayout.None; }
                }
                if (old != null) old.Dispose();
            }
            foreach (Control t in c.Targets) {
                if (t == null || t.IsDisposed) continue;
                if (c.Out == null && t.BackgroundImage != c.Frame) t.BackgroundImage = c.Frame;
                if (t.Visible) t.Invalidate(true);
            }
        }
        static void Step(Clip c) {
            try {
                bool away = Form.ActiveForm == null;   // you're in another window (e.g. the game): update much less often
                if (c.Video) {
                    Control first = FirstVisible(c);
                    if (first != null) { c.WantW = Math.Max(1, first.ClientSize.Width); c.WantH = Math.Max(1, first.ClientSize.Height); }
                    c.Hidden = !AnyVisible(c);
                    c.Slow = away;
                    if (unchecked(Environment.TickCount - c.LastShow) < c.MinGap) return;
                    Dib show = null;
                    lock (c.Gate) {
                        if (c.NewFrame && c.DReady != null) { Dib t = c.DFront; c.DFront = c.DReady; c.DReady = t; c.NewFrame = false; show = c.DFront; }
                    }
                    if (show == null) return;
                    int started = Environment.TickCount;
                    System.Diagnostics.Stopwatch sw = System.Diagnostics.Stopwatch.StartNew();
                    foreach (Control t in c.Targets) {
                        VideoPanel vp = t as VideoPanel;
                        if (vp == null || vp.IsDisposed) continue;
                        vp.Video = show;
                        if (vp.Visible) { SeeThrough(vp); vp.Update(); }
                    }
                    int cost = (int)sw.ElapsedMilliseconds;
                    nShown++; paintMs += cost; lastW = show.W; lastH = show.Hgt; Stat();
                    c.MinGap = Math.Max(15, Math.Min(400, (int)(cost * 1.7)));
                    c.LastShow = started;
                    return;
                }
                if (away) { c.Idle++; if (c.Idle % 5 != 0) return; } else c.Idle = 0;
                if (c.Frame == null) return;
                c.Wait -= c.Tick.Interval;
                if (c.Wait > 0) return;
                c.At = (c.At + 1) % c.FrameCount;
                c.Wait = c.Delays[c.At];
                if (!AnyVisible(c)) return;
                if (unchecked(Environment.TickCount - c.LastShow) < c.MinGap) return;
                System.Diagnostics.Stopwatch gw = System.Diagnostics.Stopwatch.StartNew();
                DrawGif(c);
                Show(c);
                foreach (Control t in c.Targets) if (t != null && !t.IsDisposed && t.Visible) t.Update();
                c.MinGap = Math.Max(20, Math.Min(400, (int)(gw.ElapsedMilliseconds * 2.5)));
                c.LastShow = Environment.TickCount;
            } catch (Exception e) { LastError = e.Message; }
        }

        // ---- GIF ----
        static void OpenGif(Clip c) {
            c.GifData = new MemoryStream(File.ReadAllBytes(c.Path));
            c.Gif = Image.FromStream(c.GifData);
            System.Drawing.Imaging.FrameDimension fd = System.Drawing.Imaging.FrameDimension.Time;
            c.FrameCount = Math.Max(1, c.Gif.GetFrameCount(fd));
            c.Delays = new int[c.FrameCount];
            byte[] raw = null;
            try { raw = c.Gif.GetPropertyItem(0x5100).Value; } catch { }
            for (int i = 0; i < c.FrameCount; i++) {
                int d = (raw != null && raw.Length >= (i + 1) * 4) ? BitConverter.ToInt32(raw, i * 4) * 10 : 100;
                c.Delays[i] = Math.Max(20, d);
            }
            double scale = Math.Min(1.0, (double)MaxWidth / Math.Max(1, c.Gif.Width));
            c.Frame = new Bitmap(Math.Max(1, (int)(c.Gif.Width * scale)), Math.Max(1, (int)(c.Gif.Height * scale)), System.Drawing.Imaging.PixelFormat.Format32bppPArgb);
            c.At = 0; c.Wait = c.Delays[0];
            DrawGif(c);
        }
        static void DrawGif(Clip c) {
            c.Gif.SelectActiveFrame(System.Drawing.Imaging.FrameDimension.Time, c.At);
            using (Graphics g = Graphics.FromImage(c.Frame)) {
                g.Clear(Color.Black);
                g.InterpolationMode = InterpolationMode.Bilinear;
                g.DrawImage(c.Gif, 0, 0, c.Frame.Width, c.Frame.Height);
            }
            Shade(c);
        }

        // ---- video (WPF MediaPlayer through reflection, on its own thread) ----
        static Assembly core, wbase;
        static Type T(string name) {
            if (core == null) core = Assembly.Load("PresentationCore, Version=4.0.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35");
            if (wbase == null) wbase = Assembly.Load("WindowsBase, Version=4.0.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35");
            Type t = core.GetType(name); if (t == null) t = wbase.GetType(name);
            if (t == null) throw new InvalidOperationException("Windows video support is missing (" + name + ").");
            return t;
        }
        static object Call(object o, string m, params object[] a) {
            foreach (MethodInfo mi in o.GetType().GetMethods()) {
                if (mi.Name != m || mi.GetParameters().Length != a.Length || mi.IsGenericMethodDefinition) continue;
                return mi.Invoke(o, a);
            }
            throw new MissingMethodException(o.GetType().Name + "." + m);
        }
        static void Set(object o, string p, object v) { o.GetType().GetProperty(p).SetValue(o, v, null); }
        static object Get(object o, string p) { return o.GetType().GetProperty(p).GetValue(o, null); }
        static void OpenVideo(Clip c, Control target) {
            T("System.Windows.Media.MediaPlayer");   // fails here (on this thread) if Windows has no video support
            c.Placeholder = new Bitmap(16, 9, System.Drawing.Imaging.PixelFormat.Format32bppPArgb);   // black until the first picture arrives
            using (Graphics g = Graphics.FromImage(c.Placeholder)) g.Clear(Color.Black);
            if (target != null) { c.WantW = Math.Max(1, target.ClientSize.Width); c.WantH = Math.Max(1, target.ClientSize.Height); }
            c.Alive = true;
            System.Threading.ManualResetEvent ready = new System.Threading.ManualResetEvent(false);
            string err = null;
            Clip cc = c;
            c.Worker = new System.Threading.Thread(delegate() {
                try {
                    cc.Disp = System.Windows.Threading.Dispatcher.CurrentDispatcher;
                    object mp = Activator.CreateInstance(T("System.Windows.Media.MediaPlayer"));
                    cc.Player = mp;
                    Set(mp, "IsMuted", true); Set(mp, "Volume", 0.0);
                    EventInfo ended = mp.GetType().GetEvent("MediaEnded");
                    ended.AddEventHandler(mp, new EventHandler(delegate(object s, EventArgs e) { try { Set(cc.Player, "Position", TimeSpan.Zero); Call(cc.Player, "Play"); } catch { } }));
                    EventInfo failed = mp.GetType().GetEvent("MediaFailed");
                    if (failed != null) {
                        MethodInfo h = typeof(Motion).GetMethod("OnFailed", BindingFlags.NonPublic | BindingFlags.Static);
                        try { failed.AddEventHandler(mp, Delegate.CreateDelegate(failed.EventHandlerType, h)); } catch { }
                    }
                    Call(mp, "Open", new Uri(cc.Path));
                    Call(mp, "Play");
                    System.Windows.Threading.DispatcherTimer dt = new System.Windows.Threading.DispatcherTimer(System.Windows.Threading.DispatcherPriority.Render);
                    dt.Interval = TimeSpan.FromMilliseconds(16);
                    dt.Tick += delegate { WorkerTick(cc); };
                    dt.Start();
                } catch (Exception e) { Exception i = e; while (i.InnerException != null) i = i.InnerException; err = i.Message; }
                ready.Set();
                if (err == null) { try { System.Windows.Threading.Dispatcher.Run(); } catch { } }
            });
            c.Worker.IsBackground = true;
            c.Worker.SetApartmentState(System.Threading.ApartmentState.STA);
            c.Worker.Priority = System.Threading.ThreadPriority.BelowNormal;
            c.Worker.Start();
            ready.WaitOne(5000);
            if (err != null) throw new InvalidOperationException(err);
        }
        static void OnFailed(object s, EventArgs e) {
            try { object ex = e.GetType().GetProperty("ErrorException").GetValue(e, null); LastError = ex != null ? ((Exception)ex).Message : "The video can't be played."; } catch { LastError = "The video can't be played."; }
        }
        // on the video's own thread: take the newest video picture, make it window-sized, hand it over
        // draws the video on a w x h picture. Fill = cover (cut the overflow); Fit = the whole video in the middle,
        // the sides filled with a dark zoomed copy (no black bars); Center = its own size in the middle.
        static void Layout(Clip c, IntPtr dc, int w, int h, byte[] buf, byte[] darkBuf, int mode) {
            int sw = c.W, sh = c.H;
            Gdi.BITMAPINFOHEADER bi = Gdi.Header(sw, sh);
            double kc = Math.Max((double)w / sw, (double)h / sh);
            int cw = (int)Math.Ceiling(sw * kc), ch = (int)Math.Ceiling(sh * kc);
            if (c.Fit == "Fit" || c.Fit == "Center") {
                Gdi.SetStretchBltMode(dc, Gdi.COLORONCOLOR);
                Gdi.StretchDIBits(dc, (w - cw) / 2, (h - ch) / 2, cw, ch, 0, 0, sw, sh, darkBuf, ref bi, 0, Gdi.SRCCOPY);
                int fw, fh;
                if (c.Fit == "Center") { fw = Math.Min(sw, w); fh = Math.Min(sh, h); }
                else { double kf = Math.Min((double)w / sw, (double)h / sh); fw = (int)(sw * kf); fh = (int)(sh * kf); }
                Gdi.SetStretchBltMode(dc, mode); Gdi.SetBrushOrgEx(dc, 0, 0, IntPtr.Zero);
                Gdi.StretchDIBits(dc, (w - fw) / 2, (h - fh) / 2, fw, fh, 0, 0, sw, sh, buf, ref bi, 0, Gdi.SRCCOPY);
            } else {
                Gdi.SetStretchBltMode(dc, mode); Gdi.SetBrushOrgEx(dc, 0, 0, IntPtr.Zero);
                Gdi.StretchDIBits(dc, (w - cw) / 2, (h - ch) / 2, cw, ch, 0, 0, sw, sh, buf, ref bi, 0, Gdi.SRCCOPY);
            }
        }
        static void WorkerTick(Clip c) {
            if (!c.Alive || c.Hidden) return;
            if (c.Slow) { c.SlowCount++; if (c.SlowCount % 8 != 0) return; } else c.SlowCount = 0;
            try {
                object mp = c.Player;
                long pos = ((TimeSpan)Get(mp, "Position")).Ticks;
                int w = c.WantW, h = c.WantH;
                if (pos == c.LastPos && c.Buf != null && c.DBack != null && c.DBack.W == w && c.DBack.Hgt == h) return;   // same picture as last time
                System.Diagnostics.Stopwatch gs = System.Diagnostics.Stopwatch.StartNew();
                if (!GrabVideo(c)) return;
                long g1 = gs.ElapsedMilliseconds;
                c.LastPos = pos;
                if (c.DBack == null || c.DBack.W != w || c.DBack.Hgt != h) { Gdi.Free(c.DBack); c.DBack = Gdi.NewDib(w, h); if (c.DBack == null) return; }
                if (c.WorkDC == IntPtr.Zero) c.WorkDC = Gdi.CreateCompatibleDC(IntPtr.Zero);
                // the darkened copy of the video (sides of "Fit", and the dark panels behind text)
                if (c.DarkLut == null) {
                    c.DarkLut = new byte[3][]; int[] col = { 16, 13, 12 }; double a = GlassAlpha / 255.0;   // B, G, R
                    for (int ch = 0; ch < 3; ch++) { c.DarkLut[ch] = new byte[256]; for (int i = 0; i < 256; i++) c.DarkLut[ch][i] = (byte)Math.Min(255, (int)(i * (1 - a) + col[ch] * a)); }
                }
                if (c.DarkBuf == null || c.DarkBuf.Length != c.Buf.Length) c.DarkBuf = new byte[c.Buf.Length];
                { byte[] src = c.Buf, dst = c.DarkBuf; byte[] lb = c.DarkLut[0], lg = c.DarkLut[1], lr = c.DarkLut[2];
                  for (int i = 0; i < src.Length; i += 4) { dst[i] = lb[src[i]]; dst[i + 1] = lg[src[i + 1]]; dst[i + 2] = lr[src[i + 2]]; dst[i + 3] = 255; } }
                IntPtr old = Gdi.SelectObject(c.WorkDC, c.DBack.H);
                try {
                    // the page picture: sharp video + (Fit) dark zoomed copy on the sides
                    Layout(c, c.WorkDC, w, h, c.Buf, c.DarkBuf, Gdi.HALFTONE);
                    // small dark version of the same page picture, for the dark panels behind text
                    int smw = Math.Max(2, w / 3), smh = Math.Max(2, h / 3);
                    if (c.DBack.Dark == null || c.DBack.Dark.W != smw || c.DBack.Dark.Hgt != smh) { Gdi.Free(c.DBack.Dark); c.DBack.Dark = Gdi.NewDib(smw, smh); }
                    if (c.DBack.Dark != null) {
                        Gdi.SelectObject(c.WorkDC, c.DBack.Dark.H);
                        Layout(c, c.WorkDC, smw, smh, c.DarkBuf, c.DarkBuf, Gdi.HALFTONE);
                    }
                    c.DBack.MapX = 0; c.DBack.MapY = 0; c.DBack.MapW = w; c.DBack.MapH = h;
                    Gdi.GdiFlush();
                } finally { Gdi.SelectObject(c.WorkDC, old); }
                lock (c.Gate) { Dib t = c.DReady; c.DReady = c.DBack; c.DBack = t; c.NewFrame = true; }
                System.Threading.Interlocked.Increment(ref nMade); System.Threading.Interlocked.Add(ref grabMs, g1); System.Threading.Interlocked.Add(ref composeMs, gs.ElapsedMilliseconds - g1);
            } catch (Exception e) { LastError = e.Message; }
        }
        static bool GrabVideo(Clip c) {
            object mp = c.Player;
            if (c.Visual == null) {
                int nw = (int)Get(mp, "NaturalVideoWidth"), nh = (int)Get(mp, "NaturalVideoHeight");
                if (nw <= 0 || nh <= 0) return false;       // still opening
                double scale = Math.Min(1.0, (double)MaxWidth / nw);
                c.W = Math.Max(2, (int)(nw * scale)); c.H = Math.Max(2, (int)(nh * scale));
                object vd = Activator.CreateInstance(T("System.Windows.Media.VideoDrawing"));
                Set(vd, "Player", mp);
                Set(vd, "Rect", new System.Windows.Rect(0, 0, c.W, c.H));
                object dv = Activator.CreateInstance(T("System.Windows.Media.DrawingVisual"));
                object dc = Call(dv, "RenderOpen");
                Call(dc, "DrawDrawing", vd);
                Call(dc, "Close");
                c.Visual = dv;
                object fmt = T("System.Windows.Media.PixelFormats").GetProperty("Pbgra32").GetValue(null, null);
                c.Rtb = Activator.CreateInstance(T("System.Windows.Media.Imaging.RenderTargetBitmap"), new object[] { c.W, c.H, 96.0, 96.0, fmt });
                c.Buf = new byte[c.W * c.H * 4];
                if (c.Dim > 0) { c.DimLut = new byte[256]; for (int i = 0; i < 256; i++) c.DimLut[i] = (byte)(i * (100 - c.Dim) / 100); }
            }
            Call(c.Rtb, "Clear");
            Call(c.Rtb, "Render", c.Visual);
            Call(c.Rtb, "CopyPixels", c.Buf, c.W * 4, 0);
            byte[] lut = c.DimLut, b = c.Buf;
            if (lut != null) for (int i = 0; i < b.Length; i++) b[i] = lut[b[i]];   // darker picture = easier to read the text on it
            return true;
        }
    }


    // YouTube Music (API Server plugin) talked to on a background thread, so the window never waits for it
    public static class Ytm {
        static readonly object gate = new object();
        static readonly Queue<string[]> cmds = new Queue<string[]>();
        static readonly System.Threading.AutoResetEvent wake = new System.Threading.AutoResetEvent(false);
        static System.Threading.Thread worker;
        public static string BaseUrl = "http://127.0.0.1:26538";
        public static string Token = "";
        public static volatile bool Running;
        public static volatile string SongJson = "";
        public static volatile int LastCode = -2;      // -2 not asked yet, -1 not open, 0 ok, else HTTP code
        public static volatile int Version;            // goes up when anything changes
        public static volatile int AuthState;          // 0 none, 1 waiting for Allow, 2 done, 3 failed
        public static volatile string NewToken = "";
        public static int PollMs = 2500;

        public static void Start() {
            if (Running) return;
            Running = true;
            worker = new System.Threading.Thread(Loop); worker.IsBackground = true; worker.Name = "YouTube Music"; worker.Start();
        }
        public static void Stop() { Running = false; wake.Set(); }
        public static void Send(string method, string path, string body) {
            lock (gate) {
                if (path == "volume" && cmds.Count > 0) {   // only the last volume change matters
                    Queue<string[]> keep = new Queue<string[]>();
                    foreach (string[] x in cmds) if (x[1] != "volume") keep.Enqueue(x);
                    cmds.Clear(); foreach (string[] x in keep) cmds.Enqueue(x);
                }
                cmds.Enqueue(new string[] { method, path, body });
            }
            wake.Set();
        }
        public static void Refresh() { wake.Set(); }
        public static void Auth(string client) {
            AuthState = 1; NewToken = "";
            System.Threading.ThreadPool.QueueUserWorkItem(delegate {
                string t = null; int code;
                string r = Do("POST", BaseUrl + "/auth/" + client, null, 60000, false, out code);
                if (r != null) {
                    System.Text.RegularExpressions.Match m = System.Text.RegularExpressions.Regex.Match(r, "\"accessToken\"\\s*:\\s*\"([^\"]+)\"");
                    if (m.Success) t = m.Groups[1].Value;
                }
                if (t != null) { NewToken = t; Token = t; AuthState = 2; } else AuthState = 3;
                Version++; wake.Set();
            });
        }
        static void Loop() {
            while (Running) {
                while (true) {
                    string[] c = null;
                    lock (gate) { if (cmds.Count > 0) c = cmds.Dequeue(); }
                    if (c == null) break;
                    int code; Do(c[0], BaseUrl + "/api/v1/" + c[1], c[2], 3000, true, out code);
                    System.Threading.Thread.Sleep(150);
                }
                int sc;
                string s = Do("GET", BaseUrl + "/api/v1/song", null, 3000, true, out sc);
                if (s == null) s = "";
                if (s != SongJson || sc != LastCode) { SongJson = s; LastCode = sc; Version++; }
                wake.WaitOne(PollMs);
            }
        }
        static string Do(string method, string url, string body, int timeout, bool auth, out int code) {
            code = 0;
            try {
                System.Net.HttpWebRequest r = (System.Net.HttpWebRequest)System.Net.WebRequest.Create(url);
                r.Method = method; r.Timeout = timeout; r.ReadWriteTimeout = timeout;
                r.Proxy = null;                         // straight to this PC - no proxy lookup (that alone can take seconds)
                r.KeepAlive = true;
                if (auth && !String.IsNullOrEmpty(Token)) r.Headers["Authorization"] = "Bearer " + Token;
                if (body != null) {
                    byte[] b = Encoding.UTF8.GetBytes(body);
                    r.ContentType = "application/json"; r.ContentLength = b.Length;
                    using (Stream o = r.GetRequestStream()) o.Write(b, 0, b.Length);
                } else if (method == "POST") r.ContentLength = 0;
                using (System.Net.HttpWebResponse resp = (System.Net.HttpWebResponse)r.GetResponse())
                using (StreamReader rd = new StreamReader(resp.GetResponseStream(), Encoding.UTF8)) return rd.ReadToEnd();
            } catch (System.Net.WebException e) {
                System.Net.HttpWebResponse hr = e.Response as System.Net.HttpWebResponse;
                code = hr != null ? (int)hr.StatusCode : -1;
                return null;
            } catch { code = -1; return null; }
        }
    }

    // picture backgrounds made once at the window's size (fast to draw), made again when the size changes
    public static class Bg {
        class Info { public Image Src; public string Fit; public Bitmap Made; public Timer Later; }
        static readonly Dictionary<Control, Info> all = new Dictionary<Control, Info>();
        public static void Attach(Control c, Image src, string fit) {
            Detach(c);
            Info i = new Info(); i.Src = src; i.Fit = fit;
            i.Later = new Timer(); i.Later.Interval = 120;
            Control cc = c;
            i.Later.Tick += delegate { i.Later.Stop(); Make(cc); };
            all[c] = i;
            c.Resize += OnResize;
            Make(c);
        }
        public static void Detach(Control c) {
            Info i;
            if (!all.TryGetValue(c, out i)) return;
            c.Resize -= OnResize;
            all.Remove(c);
            i.Later.Stop(); i.Later.Dispose();
            if (c.BackgroundImage == i.Made) c.BackgroundImage = null;
            if (i.Made != null) i.Made.Dispose();
        }
        static void OnResize(object s, EventArgs e) { Info i; if (all.TryGetValue((Control)s, out i)) { i.Later.Stop(); i.Later.Start(); } }
        static void Make(Control c) {
            Info i; if (!all.TryGetValue(c, out i)) return;
            int w = Math.Max(1, c.ClientSize.Width), h = Math.Max(1, c.ClientSize.Height);
            Bitmap b = new Bitmap(w, h, System.Drawing.Imaging.PixelFormat.Format32bppPArgb);
            using (Graphics g = Graphics.FromImage(b)) {
                g.Clear(c.BackColor.A == 255 ? c.BackColor : Color.Black);
                g.InterpolationMode = InterpolationMode.HighQualityBicubic; g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                int sw = i.Src.Width, sh = i.Src.Height;
                if (i.Fit == "Tile") { using (TextureBrush tb = new TextureBrush(i.Src)) g.FillRectangle(tb, 0, 0, w, h); }
                else if (i.Fit == "Center") g.DrawImage(i.Src, (w - sw) / 2, (h - sh) / 2, sw, sh);
                else if (i.Fit == "Fit") { double k = Math.Min((double)w / sw, (double)h / sh); int dw = (int)(sw * k), dh = (int)(sh * k); g.DrawImage(i.Src, (w - dw) / 2, (h - dh) / 2, dw, dh); }
                else { // Fill: cover the whole area, cut the overflow evenly
                    double k = Math.Max((double)w / sw, (double)h / sh); int dw = (int)Math.Ceiling(sw * k), dh = (int)Math.Ceiling(sh * k);
                    g.DrawImage(i.Src, (w - dw) / 2, (h - dh) / 2, dw, dh);
                }
            }
            Bitmap old = i.Made;
            i.Made = b;
            c.BackgroundImageLayout = ImageLayout.None;
            c.BackgroundImage = b;
            if (old != null) old.Dispose();
            c.Invalidate(true);
        }
    }

    // a whole panel (and everything on it) painted off-screen first, then shown at once: no flicker over moving backgrounds
    public static class Smooth {
        [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
        [DllImport("user32.dll")] static extern int SetWindowLong(IntPtr h, int i, int v);
        const int GWL_EXSTYLE = -20, WS_EX_COMPOSITED = 0x02000000;
        public static void Composite(Control c) {
            if (c == null) return;
            Apply(c);
            c.HandleCreated += delegate(object s, EventArgs e) { Apply((Control)s); };
        }
        static void Apply(Control c) {
            try { if (!c.IsHandleCreated || Plain.ContainsKey(c)) return; int ex = GetWindowLong(c.Handle, GWL_EXSTYLE); if ((ex & WS_EX_COMPOSITED) == 0) SetWindowLong(c.Handle, GWL_EXSTYLE, ex | WS_EX_COMPOSITED); } catch { }
        }
        // a moving background: whole-page compositing would redraw every button and list for every video picture,
        // so it's switched off there and each part gets its own cheap double buffer instead
        static readonly Dictionary<Control, bool> Plain = new Dictionary<Control, bool>();
        static readonly MethodInfo setStyle = typeof(Control).GetMethod("SetStyle", BindingFlags.NonPublic | BindingFlags.Instance);
        public static void ForVideo(Control c, bool on) {
            if (c == null) return;
            try {
                if (on) {
                    Plain[c] = true;
                    if (c.IsHandleCreated) { int ex = GetWindowLong(c.Handle, GWL_EXSTYLE); if ((ex & WS_EX_COMPOSITED) != 0) SetWindowLong(c.Handle, GWL_EXSTYLE, ex & ~WS_EX_COMPOSITED); }
                    Buffer(c);
                } else if (Plain.Remove(c)) Apply(c);
            } catch { }
        }
        static void Buffer(Control c) {
            bool safe = c is Panel || c is Label || c is UserControl;   // only plain parts - lists, boxes and buttons draw themselves
            if (safe) { try { if (setStyle != null) setStyle.Invoke(c, new object[] { ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint, true }); } catch { } }
            foreach (Control k in c.Controls) Buffer(k);
        }
    }

    // Windows' own dark look: dark title bar, dark scrollbars, dark drop-down boxes (Windows 10 1809+ / 11)
    public static class Dark {
        [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr h, int attr, ref int val, int size);
        [DllImport("uxtheme.dll", CharSet = CharSet.Unicode)] static extern int SetWindowTheme(IntPtr h, string app, string idList);
        [DllImport("kernel32.dll", CharSet = CharSet.Ansi)] static extern IntPtr GetProcAddress(IntPtr mod, IntPtr ordinal);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern IntPtr LoadLibrary(string name);
        delegate int PreferredAppMode(int mode);
        delegate bool AllowDarkForWindow(IntPtr h, bool allow);
        static AllowDarkForWindow allowWin;
        static bool ready;
        public static int Caption = 0x00141211;   // 0x00BBGGRR - the app's background
        public static int Border = 0x00D8A46C;    // GTA IV HUD blue

        static void Init() {
            if (ready) return; ready = true;
            try {
                IntPtr ux = LoadLibrary("uxtheme.dll");
                IntPtr p135 = GetProcAddress(ux, new IntPtr(135));   // SetPreferredAppMode
                if (p135 != IntPtr.Zero) ((PreferredAppMode)Marshal.GetDelegateForFunctionPointer(p135, typeof(PreferredAppMode)))(1);   // allow dark
                IntPtr p133 = GetProcAddress(ux, new IntPtr(133));   // AllowDarkModeForWindow
                if (p133 != IntPtr.Zero) allowWin = (AllowDarkForWindow)Marshal.GetDelegateForFunctionPointer(p133, typeof(AllowDarkForWindow));
            } catch { }
        }
        // a window (the app or a pop-up): dark title bar, and all its controls dark
        public static void Window(Form f) {
            if (f == null) return;
            Init();
            f.HandleCreated += delegate(object s, EventArgs e) { Title((Form)s); };
            if (f.IsHandleCreated) Title(f);
            Controls(f);
        }
        static void Title(Form f) {
            try {
                int on = 1;
                if (DwmSetWindowAttribute(f.Handle, 20, ref on, 4) != 0) DwmSetWindowAttribute(f.Handle, 19, ref on, 4);   // dark title bar
                int cap = Caption, txt = 0x00FFFFFF, bor = Border;
                DwmSetWindowAttribute(f.Handle, 35, ref cap, 4);    // Windows 11: title bar color
                DwmSetWindowAttribute(f.Handle, 36, ref txt, 4);    // title text
                DwmSetWindowAttribute(f.Handle, 34, ref bor, 4);    // window border
            } catch { }
        }
        // every control, now and later: scrollbars and drop-downs in the dark style
        public static void Controls(Control c) {
            if (c == null) return;
            Init();
            Theme(c);
            c.HandleCreated += delegate(object s, EventArgs e) { Theme((Control)s); };
            c.ControlAdded += delegate(object s, ControlEventArgs e) { Controls(e.Control); };
            foreach (Control ch in c.Controls) Controls(ch);
        }
        static void Theme(Control c) {
            try {
                if (!c.IsHandleCreated) return;
                if (allowWin != null) allowWin(c.Handle, true);
                if (c is ComboBox) SetWindowTheme(c.Handle, "DarkMode_CFD", null);
                else if (c is ScrollableControl || c is ListView || c is TextBoxBase || c is ListBox || c is TreeView) SetWindowTheme(c.Handle, "DarkMode_Explorer", null);
            } catch { }
        }
    }
}
