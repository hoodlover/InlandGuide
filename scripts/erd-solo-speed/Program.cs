using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Automation;
using System.Windows.Forms;
using WindowsAccessBridgeInterop;
#if FLOATER
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
#endif

namespace ErdScreenBridge
{
    internal static class Program
    {
        [STAThread]
        private static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
#if FLOATER
            Application.Run(new ProbeForm(args.Any(x => string.Equals(x, "--floater", StringComparison.OrdinalIgnoreCase))));
#else
            Application.Run(new ProbeForm());
#endif
        }
    }

    internal sealed class WindowChoice
    {
        public IntPtr Handle { get; set; }
        public string Title { get; set; }
        public string ProcessName { get; set; }
        public int ProcessId { get; set; }
        public override string ToString() { return Title + "  ·  " + ProcessName; }
    }

    internal sealed class ProbeRow
    {
        public int Depth { get; set; }
        public string ControlType { get; set; }
        public string Name { get; set; }
        public string AutomationId { get; set; }
        public string ClassName { get; set; }
        public string Value { get; set; }
        public string Bounds { get; set; }
        public bool Enabled { get; set; }
    }

    internal sealed class GridCellRow
    {
        public int Row { get; set; }
        public int Column { get; set; }
        public string ColumnName { get; set; }
        public string Value { get; set; }
        public string Role { get; set; }
        public string Bounds { get; set; }
    }

    internal sealed class S8100Summary
    {
        public string BookingNumber { get; set; }
        public string ShipmentNumber { get; set; }
        public string StartLocode { get; set; }
        public string StartCity { get; set; }
        public string PolLocode { get; set; }
        public string PolCity { get; set; }
        public string MotService { get; set; }
        public string Voyage { get; set; }
        public string DpVoyage { get; set; }
        public string Vessel { get; set; }
        public string RelevantCutoffDate { get; set; }
        public string RelevantCutoffTime { get; set; }
        public string DepartureTerminal { get; set; }
        public string CustomerPlace { get; set; }
        public List<string> CustomerPlaces { get; set; }
        public string CanadianRail { get; set; }
        public string EquipmentType { get; set; }
        public bool IsReefer { get; set; }
        public bool IsCanceled { get; set; }
        public bool IsDangerousGoods { get; set; }
        public bool IsLgbRestricted { get; set; }
        public bool IsHapagl11 { get; set; }
        public List<EquipmentItem> Equipment { get; set; }
    }

    internal sealed class EquipmentItem
    {
        public string ContainerNumber { get; set; }
        public string PlannedType { get; set; }
    }

    internal sealed class ProbeForm : Form
    {
#if FLOATER
        protected override CreateParams CreateParams
        {
            get
            {
                var parameters = base.CreateParams;
                parameters.Style |= 0x00020000; // WS_MINIMIZEBOX: normal taskbar minimize/restore toggle.
                parameters.Style |= 0x00080000; // WS_SYSMENU: lets Windows manage the taskbar button normally.
                return parameters;
            }
        }
#endif
        private readonly ComboBox windows = new ComboBox();
        private readonly Button refresh = new Button();
        private readonly Button scan = new Button();
        private readonly Button scanJava = new Button();
        private readonly Button inspectPoint = new Button();
        private readonly Button readGrid = new Button();
        private readonly Button copyGrid = new Button();
        private readonly Button export = new Button();
        private readonly Label status = new Label();
        private readonly DataGridView results = new DataGridView();
        private List<ProbeRow> rows = new List<ProbeRow>();
        private List<GridCellRow> gridRows = new List<GridCellRow>();
        private bool showingGrid;
        private LocalErdServer erdServer;
        private AccessBridge erdAccessBridge;
        private string erdAccessBridgeJavaBin;
        private Task erdWarmupTask = Task.FromResult(0);
#if FLOATER
        private WebView2 floaterWeb;
        private Panel floaterTitleBar;
        private PictureBox floaterButton;
        private TextBox floaterQuickEntry;
        private System.Windows.Forms.Timer floaterSingleClickTimer;
        private bool floaterExpanded;
        private bool floaterReading;
        private bool floaterDragged;
        private bool floaterWebReady;
        private string floaterPendingScript;
        private bool floaterMoving;
        private Point floaterDragCursor;
        private Point floaterDragForm;
        private readonly string floaterPositionPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "IDT-ERD-Button", "floater-position.txt");
#endif

#if FLOATER
        public ProbeForm(bool useFloater)
#else
        public ProbeForm()
#endif
        {
#if FLOATER
            if (useFloater)
            {
                ConfigureFloater();
                return;
            }
#endif
            Text = "ERD Screen Bridge V5.8 · Background Service";
            Width = 1120;
            Height = 700;
            MinimumSize = new Size(760, 480);
            StartPosition = FormStartPosition.CenterScreen;
            WindowState = FormWindowState.Minimized;
            ShowInTaskbar = false;
            Opacity = 0;
            BackColor = Color.FromArgb(242, 246, 250);

            var heading = new Label {
                Text = "ERD SCREEN BRIDGE",
                Font = new Font("Arial", 15, FontStyle.Bold),
                ForeColor = Color.FromArgb(16, 48, 71),
                AutoSize = true,
                Location = new Point(18, 16)
            };
            var subtitle = new Label {
                Text = "Read-only experiment · select an open window and inspect what Windows exposes",
                Font = new Font("Arial", 9),
                ForeColor = Color.FromArgb(74, 99, 117),
                AutoSize = true,
                Location = new Point(20, 47)
            };

            windows.DropDownStyle = ComboBoxStyle.DropDownList;
            windows.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            windows.Location = new Point(20, 78);
            windows.Width = 400;

            ConfigureButton(refresh, "Refresh", 432, 76, 70);
            ConfigureButton(scan, "Windows", 508, 76, 70);
            ConfigureButton(scanJava, "Scan Java", 584, 76, 78);
            ConfigureButton(inspectPoint, "Inspect", 668, 76, 76);
            ConfigureButton(readGrid, "Read Grid", 750, 76, 88);
            ConfigureButton(copyGrid, "Copy", 844, 76, 68);
            ConfigureButton(export, "Export CSV", 918, 76, 156);
            refresh.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            scan.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            scanJava.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            inspectPoint.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            readGrid.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            copyGrid.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            export.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            export.Enabled = false;
            copyGrid.Enabled = false;

            status.Text = "Ready. No screen capture, typing, clicking, or network access is used.";
            status.AutoEllipsis = true;
            status.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            status.Location = new Point(20, 113);
            status.Width = 1054;
            status.Height = 24;
            status.ForeColor = Color.FromArgb(62, 91, 110);

            results.Location = new Point(20, 140);
            results.Size = new Size(1054, 500);
            results.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
            results.ReadOnly = true;
            results.AllowUserToAddRows = false;
            results.AllowUserToDeleteRows = false;
            results.AllowUserToOrderColumns = true;
            results.AutoGenerateColumns = true;
            results.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.DisplayedCells;
            results.BackgroundColor = Color.White;
            results.BorderStyle = BorderStyle.FixedSingle;

            Controls.AddRange(new Control[] { heading, subtitle, windows, refresh, scan, scanJava, inspectPoint, readGrid, copyGrid, export, status, results });
            refresh.Click += delegate { LoadWindows(); };
            scan.Click += async delegate { await ScanSelectedWindow(); };
            scanJava.Click += async delegate { await ScanSelectedJavaWindow(); };
            inspectPoint.Click += async delegate { await InspectSelectedJavaPoint(); };
            readGrid.Click += async delegate { await ReadSelectedJavaGrid(); };
            copyGrid.Click += delegate { CopyGrid(); };
            export.Click += delegate { ExportCsv(); };
            Shown += delegate {
                if (!JavaBridgeSetup.EnsureConfigured(this)) { Close(); return; }
                LoadWindows();
                StartErdServer();
                Hide();
            };
            FormClosed += delegate { DisposeErdAccessBridge(); if (erdServer != null) erdServer.Dispose(); };
        }

#if FLOATER
        private void ConfigureFloater()
        {
            Text = "ERD Tool Floater Lab";
            var taskbarIconPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "ig-taskbar.png");
            if (File.Exists(taskbarIconPath))
            {
                using (var source = new Bitmap(taskbarIconPath))
                using (var sized = new Bitmap(source, new Size(64, 64)))
                    Icon = (Icon)Icon.FromHandle(sized.GetHicon()).Clone();
            }
            AutoScaleMode = AutoScaleMode.None;
            FormBorderStyle = FormBorderStyle.None;
            StartPosition = FormStartPosition.Manual;
            ShowInTaskbar = true;
            TopMost = false;
            BackColor = Color.FromArgb(12, 14, 18);
            LoadFloaterPosition();

            floaterTitleBar = new Panel { Dock = DockStyle.Top, Height = 24, BackColor = Color.Black, Cursor = Cursors.SizeAll };
            var title = new Label {
                Text = "  ERD Tool", Dock = DockStyle.Fill,
                ForeColor = Color.White, Font = new Font("Arial", 8.5f, FontStyle.Bold),
                TextAlign = ContentAlignment.MiddleLeft, Cursor = Cursors.SizeAll
            };
            var credit = new Label {
                Text = "Cobb's Sharpest Tool, Yet", Dock = DockStyle.Right, Width = 165,
                ForeColor = Color.FromArgb(225, 225, 225), Font = new Font("Arial", 7.5f, FontStyle.Bold),
                TextAlign = ContentAlignment.MiddleRight, Cursor = Cursors.SizeAll
            };
            var closeButton = new Button {
                Text = "×", Dock = DockStyle.Right, Width = 30,
                FlatStyle = FlatStyle.Flat, BackColor = Color.Black, ForeColor = Color.White,
                Font = new Font("Arial", 13f, FontStyle.Bold),
                TabStop = false, Cursor = Cursors.Default
            };
            closeButton.FlatAppearance.BorderSize = 0;
            closeButton.Click += delegate { CollapseFloater(); };
            var minimizeButton = new Button {
                Text = "—", Dock = DockStyle.Right, Width = 30,
                FlatStyle = FlatStyle.Flat, BackColor = Color.Black, ForeColor = Color.White,
                TabStop = false, Cursor = Cursors.Default
            };
            minimizeButton.FlatAppearance.BorderSize = 0;
            minimizeButton.Click += delegate { WindowState = FormWindowState.Minimized; };
            floaterTitleBar.Controls.Add(title);
            floaterTitleBar.Controls.Add(credit);
            floaterTitleBar.Controls.Add(closeButton);
            floaterTitleBar.Controls.Add(minimizeButton);
            floaterTitleBar.MouseDown += FloaterMouseDown;
            floaterTitleBar.MouseMove += FloaterMouseMove;
            floaterTitleBar.MouseUp += FloaterMouseUp;
            title.MouseDown += FloaterMouseDown;
            title.MouseMove += FloaterMouseMove;
            title.MouseUp += FloaterMouseUp;
            credit.MouseDown += FloaterMouseDown;
            credit.MouseMove += FloaterMouseMove;
            credit.MouseUp += FloaterMouseUp;

            floaterWeb = new WebView2 { Dock = DockStyle.Fill, BackColor = Color.FromArgb(12, 14, 18) };
            floaterButton = new PictureBox { Dock = DockStyle.Fill, BackColor = Color.Black, Cursor = Cursors.Hand, SizeMode = PictureBoxSizeMode.Zoom };
            var buttonPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "got-erd-button.png");
            if (File.Exists(buttonPath)) floaterButton.Image = Image.FromFile(buttonPath);
            floaterButton.MouseDown += FloaterMouseDown;
            floaterButton.MouseMove += FloaterMouseMove;
            floaterButton.MouseUp += FloaterButtonMouseUp;
            floaterButton.DoubleClick += delegate {
                floaterSingleClickTimer.Stop();
                HideQuickEntry();
                ExpandAndRun("window.prepareShipmentEntry?.()");
            };
            floaterQuickEntry = new TextBox {
                Visible = false, MaxLength = 8, BorderStyle = BorderStyle.FixedSingle,
                Font = new Font("Arial", 12f, FontStyle.Bold), TextAlign = HorizontalAlignment.Center
            };
            floaterQuickEntry.KeyPress += delegate(object sender, KeyPressEventArgs e) {
                if (!char.IsControl(e.KeyChar) && !char.IsDigit(e.KeyChar)) e.Handled = true;
            };
            floaterQuickEntry.KeyDown += delegate(object sender, KeyEventArgs e) {
                if (e.KeyCode == Keys.Escape) { e.SuppressKeyPress = true; HideQuickEntry(); return; }
                if (e.KeyCode != Keys.Enter) return;
                e.SuppressKeyPress = true;
                var booking = floaterQuickEntry.Text.Trim();
                if (!Regex.IsMatch(booking, @"^\d{8}$")) { System.Media.SystemSounds.Beep.Play(); return; }
                HideQuickEntry();
                ExpandAndRun("window.runQuickShipment?.('" + booking + "')");
            };
            floaterSingleClickTimer = new System.Windows.Forms.Timer { Interval = 180 };
            floaterSingleClickTimer.Tick += delegate {
                floaterSingleClickTimer.Stop();
                if (!floaterDragged && !floaterExpanded) ShowQuickEntry();
            };
            Controls.Add(floaterWeb);
            Controls.Add(floaterButton);
            Controls.Add(floaterQuickEntry);
            Controls.Add(floaterTitleBar);
            floaterTitleBar.BringToFront();

            var menu = new ContextMenuStrip();
            var tutorialItem = menu.Items.Add("Quick tutorial", null, delegate { ShowQuickTutorial(); });
            tutorialItem.ForeColor = Color.FromArgb(0, 59, 143);
            tutorialItem.Font = new Font("Arial", 9f, FontStyle.Bold);
            menu.Items.Add("Version & build history", null, delegate { ShowBuildHistory(); });
            menu.Items.Add("Managers", null, delegate {
                Process.Start(new ProcessStartInfo("https://inlandguide.hapagidt.com/#managers") { UseShellExecute = true });
            });
            menu.Items.Add("Refresh live master", null, async delegate {
                try
                {
                    if (floaterWebReady && floaterWeb.CoreWebView2 != null)
                    {
                        await floaterWeb.CoreWebView2.ExecuteScriptAsync("(async()=>{await window.refreshErdLiveMaster();return 'ok';})()");
                        MessageBox.Show(this, "The live master has been refreshed from Z:.", "ERD Tool", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    }
                }
                catch (Exception error)
                {
                    MessageBox.Show(this, "The live master could not be refreshed.\r\n\r\n" + error.Message, "ERD Tool", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                }
            });
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Read open booking", null, delegate { ExpandAndRun("document.querySelector('button[aria-label^=\\\"Read\\\"]')?.click()") ; });
            menu.Items.Add("Reopen last result", null, delegate { ExpandAndRun("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Reopen last result'))?.click()") ; });
            menu.Items.Add("Manual check", null, delegate { ExpandAndRun("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Manual check'))?.click()") ; });
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Minimize", null, delegate { WindowState = FormWindowState.Minimized; });
            menu.Items.Add("Reset position", null, delegate { Location = new Point(40, 80); SaveFloaterPosition(); });
            menu.Items.Add("Exit", null, delegate { Close(); });
            floaterTitleBar.ContextMenuStrip = menu;
            title.ContextMenuStrip = menu;
            credit.ContextMenuStrip = menu;
            floaterButton.ContextMenuStrip = menu;

            CollapseFloater();

            Shown += async delegate {
                if (!JavaBridgeSetup.EnsureConfigured(this)) { Close(); return; }
                StartErdServer();
                erdWarmupTask = WarmErdAccessBridgeAsync();
                await InitializeFloaterWebAsync();
                ExpandAndRun("window.prepareShipmentEntry?.()");
                Update();
                await Task.Delay(100);
                CollapseFloater();
                floaterButton.Invalidate();
                Update();
                try { await erdWarmupTask; } catch { /* The first request can retry setup. */ }
            };
            Move += delegate { if (WindowState == FormWindowState.Normal) SaveFloaterPosition(); };
            FormClosed += delegate { SaveFloaterPosition(); DisposeErdAccessBridge(); if (erdServer != null) erdServer.Dispose(); };
            Deactivate += delegate { if (floaterQuickEntry.Visible && !floaterReading) HideQuickEntry(); };
        }

        private void ShowQuickTutorial()
        {
            var tutorial = new Form {
                Text = "ERD Tool - Quick Tutorial",
                Size = new Size(500, 410),
                StartPosition = FormStartPosition.CenterScreen,
                FormBorderStyle = FormBorderStyle.FixedDialog,
                MaximizeBox = false,
                MinimizeBox = false,
                BackColor = Color.FromArgb(7, 12, 24),
                ForeColor = Color.White,
                TopMost = true,
                ShowInTaskbar = false
            };

            var header = new Label {
                Text = "GOT ERD?  HERE'S THE QUICK WAY",
                Dock = DockStyle.Top,
                Height = 58,
                BackColor = Color.FromArgb(0, 59, 143),
                ForeColor = Color.White,
                Font = new Font("Arial", 15f, FontStyle.Bold),
                TextAlign = ContentAlignment.MiddleCenter
            };

            var steps = new Label {
                Text = "1.  Make sure FIS is open.\r\n\r\n" +
                       "2.  Don't worry about opening the booking.\r\n\r\n" +
                       "3.  Double-click the ERD image.\r\n\r\n" +
                       "4.  Enter up to 10 bookings and let it do its thing.\r\n\r\n" +
                       "5.  All results will be copied to your clipboard.\r\n\r\n" +
                       "6.  Enjoy your day!",
                Font = new Font("Arial", 11.5f, FontStyle.Bold),
                ForeColor = Color.FromArgb(255, 128, 0),
                TextAlign = ContentAlignment.MiddleLeft
            };
            steps.SetBounds(38, 70, 424, 260);

            var okay = new Button {
                Text = "Got it",
                DialogResult = DialogResult.OK,
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.FromArgb(244, 122, 0),
                ForeColor = Color.White,
                Font = new Font("Arial", 10f, FontStyle.Bold)
            };
            okay.FlatAppearance.BorderSize = 0;
            okay.SetBounds(194, 332, 112, 34);

            tutorial.Controls.Add(header);
            tutorial.Controls.Add(steps);
            tutorial.Controls.Add(okay);
            tutorial.AcceptButton = okay;
            tutorial.ShowDialog(this);
            tutorial.Dispose();
        }

        private void ShowBuildHistory()
        {
            var history = new Form {
                Text = "ERD Tool - Version & Build History",
                Size = new Size(460, 390),
                StartPosition = FormStartPosition.CenterScreen,
                FormBorderStyle = FormBorderStyle.FixedDialog,
                MaximizeBox = false,
                MinimizeBox = false,
                BackColor = Color.FromArgb(7, 12, 24),
                ForeColor = Color.White,
                TopMost = true,
                ShowInTaskbar = false
            };

            var header = new Label {
                Text = "ERD TOOL FLOATER",
                Dock = DockStyle.Top,
                Height = 58,
                BackColor = Color.FromArgb(0, 59, 143),
                ForeColor = Color.White,
                Font = new Font("Arial", 16f, FontStyle.Bold),
                TextAlign = ContentAlignment.MiddleCenter
            };

            var version = new Label {
                Text = "Version 1.0.17 — SPEED TEST",
                Font = new Font("Arial", 15f, FontStyle.Bold),
                ForeColor = Color.FromArgb(255, 128, 0),
                TextAlign = ContentAlignment.MiddleCenter
            };
            version.SetBounds(25, 74, 400, 34);

            var stats = new Label {
                Text = "Isolated speed test  |  Updated September 8, 2026\r\nSingle booking stays open + faster readiness\r\nLive manager names + 20 ms paced typing",
                Font = new Font("Arial", 11f, FontStyle.Bold),
                ForeColor = Color.FromArgb(52, 211, 153),
                TextAlign = ContentAlignment.MiddleCenter
            };
            stats.SetBounds(20, 112, 410, 76);

            var detail = new Label {
                Text = "This identifies the current local test copy.\r\n\r\nThe shared Z: installer is not changed by this test build.",
                Font = new Font("Arial", 9.5f),
                ForeColor = Color.FromArgb(205, 216, 235),
                TextAlign = ContentAlignment.TopCenter
            };
            detail.SetBounds(34, 198, 382, 70);

            var credit = new Label {
                Text = "Cobb's Sharpest Tool, Yet",
                Font = new Font("Arial", 9f, FontStyle.Bold),
                ForeColor = Color.White,
                TextAlign = ContentAlignment.MiddleCenter
            };
            credit.SetBounds(25, 276, 400, 24);

            var okay = new Button {
                Text = "Close",
                DialogResult = DialogResult.OK,
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.FromArgb(244, 122, 0),
                ForeColor = Color.White,
                Font = new Font("Arial", 10f, FontStyle.Bold)
            };
            okay.FlatAppearance.BorderSize = 0;
            okay.SetBounds(174, 310, 112, 34);

            history.Controls.Add(header);
            history.Controls.Add(version);
            history.Controls.Add(stats);
            history.Controls.Add(detail);
            history.Controls.Add(credit);
            history.Controls.Add(okay);
            history.AcceptButton = okay;
            history.ShowDialog(this);
            history.Dispose();
        }

        private async Task InitializeFloaterWebAsync()
        {
            var dataFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "IDT-ERD-Button", "WebView2");
            Directory.CreateDirectory(dataFolder);
            var environment = await CoreWebView2Environment.CreateAsync(null, dataFolder);
            await floaterWeb.EnsureCoreWebView2Async(environment);
            floaterWeb.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            floaterWeb.CoreWebView2.Settings.AreDevToolsEnabled = false;
            floaterWeb.CoreWebView2.Settings.IsStatusBarEnabled = false;
            floaterWeb.CoreWebView2.PermissionRequested += delegate(object sender, CoreWebView2PermissionRequestedEventArgs e) {
                if (e.PermissionKind == CoreWebView2PermissionKind.ClipboardRead)
                {
                    e.State = CoreWebView2PermissionState.Allow;
                    e.Handled = true;
                }
            };
            floaterWeb.CoreWebView2.WebMessageReceived += async delegate(object sender, CoreWebView2WebMessageReceivedEventArgs e) {
                var message = e.TryGetWebMessageAsString();
                if (message == "reading:started")
                {
                    floaterReading = true;
                    WindowState = FormWindowState.Normal;
                    KeepFloaterOnScreen();
                    TopMost = true;
                    Show();
                    BringToFront();
                    Activate();
                    return;
                }
                if (message == "reading:finished")
                {
                    floaterReading = false;
                    WindowState = FormWindowState.Normal;
                    KeepFloaterOnScreen();
                    TopMost = true;
                    Show();
                    BringToFront();
                    Activate();
                    NativeWindows.SetForegroundWindow(Handle);
                    // Let Windows complete the foreground handoff before releasing
                    // temporary always-on-top behavior for the finished result.
                    await Task.Delay(350);
                    if (!floaterReading) TopMost = false;
                    return;
                }
                if ((message ?? "").StartsWith("clipboard:", StringComparison.Ordinal))
                {
                    try
                    {
                        var encoded = message.Substring("clipboard:".Length);
                        var json = Encoding.UTF8.GetString(Convert.FromBase64String(encoded));
                        var textMatch = Regex.Match(json, "\\\"text\\\"\\s*:\\s*\\\"((?:\\\\.|[^\\\"])*)\\\"");
                        var htmlMatch = Regex.Match(json, "\\\"html\\\"\\s*:\\s*\\\"((?:\\\\.|[^\\\"])*)\\\"");
                        var serializer = new System.Web.Script.Serialization.JavaScriptSerializer();
                        var values = serializer.Deserialize<Dictionary<string, string>>(json);
                        var clipboardData = new DataObject();
                        clipboardData.SetData(DataFormats.UnicodeText, values.ContainsKey("text") ? values["text"] : "");
                        clipboardData.SetData(DataFormats.Text, values.ContainsKey("text") ? values["text"] : "");
                        clipboardData.SetData(DataFormats.Html, BuildClipboardHtml(values.ContainsKey("html") ? values["html"] : ""));
                        Clipboard.SetDataObject(clipboardData, true);
                    }
                    catch { }
                    return;
                }
                var match = Regex.Match(message ?? "", @"^resize:(\d+):(\d+)$");
                if (!match.Success) return;
                var requestedWidth = int.Parse(match.Groups[1].Value);
                var requestedHeight = int.Parse(match.Groups[2].Value);
                if (requestedWidth <= 250 && requestedHeight <= 265 && floaterExpanded) { CollapseFloater(); return; }
                if (!floaterExpanded) return;
                var width = Math.Max(250, Math.Min(520, requestedWidth));
                var height = Math.Max(287, Math.Min(780, requestedHeight + 24));
                ClientSize = new Size(width, height);
                KeepFloaterOnScreen();
            };
            floaterWeb.NavigationCompleted += async delegate {
                floaterWebReady = true;
                if (!string.IsNullOrWhiteSpace(floaterPendingScript))
                {
                    var script = floaterPendingScript;
                    floaterPendingScript = null;
                    await floaterWeb.ExecuteScriptAsync(script);
                }
            };
            await Task.Delay(600);
            floaterWeb.Source = new Uri("http://127.0.0.1:47833/erd-button.html?v=" + DateTime.UtcNow.Ticks);
        }

        private static string BuildClipboardHtml(string fragment)
        {
            const string startMarker = "<!--StartFragment-->";
            const string endMarker = "<!--EndFragment-->";
            var body = "<html><body>" + startMarker + fragment + endMarker + "</body></html>";
            const string headerTemplate = "Version:0.9\r\nStartHTML:{0:D10}\r\nEndHTML:{1:D10}\r\nStartFragment:{2:D10}\r\nEndFragment:{3:D10}\r\n";
            var emptyHeader = string.Format(headerTemplate, 0, 0, 0, 0);
            var startHtml = Encoding.UTF8.GetByteCount(emptyHeader);
            var startFragment = startHtml + Encoding.UTF8.GetByteCount(body.Substring(0, body.IndexOf(startMarker, StringComparison.Ordinal) + startMarker.Length));
            var endFragment = startHtml + Encoding.UTF8.GetByteCount(body.Substring(0, body.IndexOf(endMarker, StringComparison.Ordinal)));
            var endHtml = startHtml + Encoding.UTF8.GetByteCount(body);
            return string.Format(headerTemplate, startHtml, endHtml, startFragment, endFragment) + body;
        }

        private void FloaterMouseDown(object sender, MouseEventArgs e)
        {
            if (e.Button != MouseButtons.Left) return;
            floaterMoving = true;
            floaterDragged = false;
            floaterDragCursor = Cursor.Position;
            floaterDragForm = Location;
        }

        private void FloaterMouseMove(object sender, MouseEventArgs e)
        {
            if (!floaterMoving) return;
            var delta = new Point(Cursor.Position.X - floaterDragCursor.X, Cursor.Position.Y - floaterDragCursor.Y);
            if (Math.Abs(delta.X) > 3 || Math.Abs(delta.Y) > 3) floaterDragged = true;
            Location = new Point(floaterDragForm.X + delta.X, floaterDragForm.Y + delta.Y);
        }

        private void FloaterButtonMouseUp(object sender, MouseEventArgs e)
        {
            FloaterMouseUp(sender, e);
            if (e.Button == MouseButtons.Left && !floaterDragged)
            {
                floaterSingleClickTimer.Stop();
                floaterSingleClickTimer.Start();
            }
        }

        private void ShowQuickEntry()
        {
            if (floaterExpanded || floaterButton.Image == null) return;
            var imageSize = floaterButton.Image.Size;
            var entryWidth = Math.Min(92, imageSize.Width);
            var entryHeight = 27;
            var entryX = (imageSize.Width - entryWidth) / 2;
            var entryY = imageSize.Height - 18;
            floaterButton.Dock = DockStyle.None;
            floaterButton.SetBounds(0, 0, imageSize.Width, imageSize.Height);
            floaterQuickEntry.SetBounds(entryX, entryY, entryWidth, entryHeight);
            floaterQuickEntry.Text = "";
            floaterQuickEntry.Visible = true;
            floaterQuickEntry.BringToFront();
            ClientSize = new Size(imageSize.Width, entryY + entryHeight);
            var shape = BuildImageRegion(floaterButton.Image, imageSize.Width, imageSize.Height);
            if (shape != null) shape.Union(new Rectangle(entryX, entryY, entryWidth, entryHeight));
            Region = shape;
            KeepFloaterOnScreen();
            floaterQuickEntry.Focus();
        }

        private void HideQuickEntry()
        {
            if (floaterQuickEntry == null) return;
            floaterQuickEntry.Visible = false;
            floaterQuickEntry.Text = "";
            if (!floaterExpanded) CollapseFloater();
        }

        private async void ExpandAndRun(string script)
        {
            if (floaterQuickEntry != null) floaterQuickEntry.Visible = false;
            floaterExpanded = true;
            Region = null;
            ClientSize = new Size(420, 354);
            floaterButton.Visible = false;
            floaterTitleBar.Visible = true;
            floaterWeb.Visible = true;
            floaterWeb.Focus();
            KeepFloaterOnScreen();
            if (floaterWebReady) await floaterWeb.ExecuteScriptAsync(script);
            else floaterPendingScript = script;
        }

        private void CollapseFloater()
        {
            if (floaterReading) return;
            TopMost = false;
            floaterExpanded = false;
            floaterWeb.Visible = false;
            floaterTitleBar.Visible = false;
            if (floaterQuickEntry != null) floaterQuickEntry.Visible = false;
            floaterButton.Dock = DockStyle.Fill;
            floaterButton.Visible = true;
            ClientSize = floaterButton.Image != null
                ? floaterButton.Image.Size
                : new Size(128, 128);
            Region = BuildImageRegion(floaterButton.Image, ClientSize.Width, ClientSize.Height);
            KeepFloaterOnScreen();
        }

        private static Region BuildImageRegion(Image image, int width, int height)
        {
            if (image == null) return null;
            using (var scaled = new Bitmap(width, height, System.Drawing.Imaging.PixelFormat.Format32bppArgb))
            {
                using (var graphics = Graphics.FromImage(scaled))
                {
                    graphics.Clear(Color.Transparent);
                    graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                    graphics.DrawImage(image, new Rectangle(0, 0, width, height));
                }
                var region = new Region();
                region.MakeEmpty();
                for (var y = 0; y < height; y++)
                {
                    var runStart = -1;
                    for (var x = 0; x <= width; x++)
                    {
                        var visible = x < width && scaled.GetPixel(x, y).A > 20;
                        if (visible && runStart < 0) runStart = x;
                        if (!visible && runStart >= 0)
                        {
                            region.Union(new Rectangle(runStart, y, x - runStart, 1));
                            runStart = -1;
                        }
                    }
                }
                return region;
            }
        }

        private void FloaterMouseUp(object sender, MouseEventArgs e)
        {
            floaterMoving = false;
            KeepFloaterOnScreen();
            SaveFloaterPosition();
        }

        private void LoadFloaterPosition()
        {
            try
            {
                var parts = File.ReadAllText(floaterPositionPath).Split(',');
                Location = new Point(int.Parse(parts[0]), int.Parse(parts[1]));
                KeepFloaterOnScreen();
            }
            catch { Location = new Point(40, 80); }
        }

        private void SaveFloaterPosition()
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(floaterPositionPath));
                File.WriteAllText(floaterPositionPath, Location.X + "," + Location.Y);
            }
            catch { }
        }

        private void KeepFloaterOnScreen()
        {
            var area = Screen.FromControl(this).WorkingArea;
            Left = Math.Max(area.Left, Math.Min(Left, area.Right - Width));
            Top = Math.Max(area.Top, Math.Min(Top, area.Bottom - Height));
        }
#endif

        private void StartErdServer()
        {
            try
            {
                erdServer = new LocalErdServer(47835, ReadS8100ForWebAsync, WriteClipboardForWebAsync, MapFisControlsForWebAsync, OpenBookingForWebAsync, CloseBookingForWebAsync, CloseAllFisWindowsForWebAsync, ReadSoloS8100ForWebAsync);
                erdServer.Start();
                status.Text = "Ready · ERD web bridge listening locally on 127.0.0.1:47835.";
            }
            catch (Exception error) { status.Text = "ERD web bridge unavailable: " + error.Message; }
        }

        private Task<S8100Summary> ReadS8100ForWebAsync(bool readEquipment)
        {
            if (!InvokeRequired) return ReadS8100OnUiThreadAsync(readEquipment);
            var completion = new TaskCompletionSource<S8100Summary>();
            BeginInvoke(new Action(async delegate {
                try { completion.SetResult(await ReadS8100OnUiThreadAsync(readEquipment)); }
                catch (Exception error) { completion.SetException(error); }
            }));
            return completion.Task;
        }

        private Task<S8100Summary> ReadSoloS8100ForWebAsync(bool readEquipment)
        {
            if (!InvokeRequired) return ReadS8100OnUiThreadAsync(readEquipment, true);
            var completion = new TaskCompletionSource<S8100Summary>();
            BeginInvoke(new Action(async delegate {
                try { completion.SetResult(await ReadS8100OnUiThreadAsync(readEquipment, true)); }
                catch (Exception error) { completion.SetException(error); }
            }));
            return completion.Task;
        }

        private async Task<S8100Summary> ReadS8100OnUiThreadAsync(bool readEquipment, bool soloScreen = false)
        {
            try { await erdWarmupTask; } catch { /* Normal setup below will retry. */ }
            var choice = NativeWindows.ListVisibleWindows().FirstOrDefault(x =>
                x.Title.IndexOf("HL FIS", StringComparison.OrdinalIgnoreCase) >= 0);
            if (choice == null) throw new ApplicationException("Open FIS with an S8100 booking first.");
            var javaBin = NativeWindows.GetProcessFolder(choice.ProcessId);
            if (string.IsNullOrEmpty(javaBin)) throw new ApplicationException("Could not locate the FIS Java runtime.");
            await EnsureErdAccessBridgeAsync(javaBin);
            // Clicking the floater temporarily removes focus from FIS. Restore
            // FIS before querying Java so its active S8100 frame is exposed and
            // we do not fall back to a full application-tree scan.
            if (NativeWindows.RestoreWindow(choice.Handle)) await Task.Delay(100);
            NativeWindows.SetForegroundWindow(choice.Handle);
            await Task.Delay(150);
            Exception firstFailure = null;
            try
            {
                return JavaGridProbe.ReadS8100Summary(erdAccessBridge, choice.Handle, readEquipment, soloScreen);
            }
            catch (Exception error)
            {
                firstFailure = error;
            }
            // FIS can replace its Java window while remaining visibly open. Reconnect once.
            DisposeErdAccessBridge();
            await EnsureErdAccessBridgeAsync(javaBin);
            try { return JavaGridProbe.ReadS8100Summary(erdAccessBridge, choice.Handle, readEquipment, soloScreen); }
            catch { throw firstFailure; }
        }

        private async Task WarmErdAccessBridgeAsync()
        {
            var choice = NativeWindows.ListVisibleWindows().FirstOrDefault(x =>
                x.Title.IndexOf("HL FIS", StringComparison.OrdinalIgnoreCase) >= 0);
            if (choice == null) return;
            var javaBin = NativeWindows.GetProcessFolder(choice.ProcessId);
            if (!string.IsNullOrEmpty(javaBin)) await EnsureErdAccessBridgeAsync(javaBin);
        }

        private async Task EnsureErdAccessBridgeAsync(string javaBin)
        {
            if (erdAccessBridge != null && string.Equals(erdAccessBridgeJavaBin, javaBin, StringComparison.OrdinalIgnoreCase)) return;
            DisposeErdAccessBridge();
            NativeWindows.SetDllDirectory(javaBin);
            erdAccessBridge = new AccessBridge {
                CollectionSizeLimit = 15000,
                TextBufferLengthLimit = 4096
            };
            erdAccessBridge.Initialize();
            erdAccessBridgeJavaBin = javaBin;
            await Task.Delay(1200);
        }

        private void DisposeErdAccessBridge()
        {
            if (erdAccessBridge != null)
            {
                try { erdAccessBridge.Dispose(); } catch { }
                erdAccessBridge = null;
            }
            erdAccessBridgeJavaBin = null;
        }

        private Task WriteClipboardForWebAsync(string text)
        {
            if (!InvokeRequired)
            {
                Clipboard.SetText(text ?? "");
                return Task.FromResult(true);
            }
            var completion = new TaskCompletionSource<bool>();
            BeginInvoke(new Action(delegate {
                try { Clipboard.SetText(text ?? ""); completion.SetResult(true); }
                catch (Exception error) { completion.SetException(error); }
            }));
            return completion.Task;
        }

        private Task<List<ProbeRow>> MapFisControlsForWebAsync()
        {
            if (!InvokeRequired) return MapFisControlsOnUiThreadAsync();
            var completion = new TaskCompletionSource<List<ProbeRow>>();
            BeginInvoke(new Action(async delegate {
                try { completion.SetResult(await MapFisControlsOnUiThreadAsync()); }
                catch (Exception error) { completion.SetException(error); }
            }));
            return completion.Task;
        }

        private async Task<List<ProbeRow>> MapFisControlsOnUiThreadAsync()
        {
            var choice = NativeWindows.ListVisibleWindows().FirstOrDefault(x => x.Title.IndexOf("HL FIS", StringComparison.OrdinalIgnoreCase) >= 0);
            if (choice == null) throw new ApplicationException("FIS window not found.");
            var javaBin = NativeWindows.GetProcessFolder(choice.ProcessId);
            await EnsureErdAccessBridgeAsync(javaBin);
            return JavaAutomationProbe.Scan(erdAccessBridge, choice.Handle, 12000, 28)
                .Where(row => Regex.IsMatch(row.ControlType ?? "", "text|field|button|combo|menu", RegexOptions.IgnoreCase)
                    || Regex.IsMatch((row.Name ?? "") + " " + (row.Value ?? ""), "booking|shipment|search|find|open|error|not found", RegexOptions.IgnoreCase))
                .ToList();
        }

        private Task<string> OpenBookingForWebAsync(string booking)
        {
            if (!InvokeRequired) return OpenBookingOnUiThreadAsync(booking);
            var completion = new TaskCompletionSource<string>();
            BeginInvoke(new Action(async delegate {
                try { completion.SetResult(await OpenBookingOnUiThreadAsync(booking)); }
                catch (Exception error) { completion.SetException(error); }
            }));
            return completion.Task;
        }

        private async Task<string> OpenBookingOnUiThreadAsync(string booking)
        {
            try { await erdWarmupTask; } catch { /* Normal setup below will retry. */ }
            if (!Regex.IsMatch(booking ?? "", "^[0-9]{6,12}$")) throw new ApplicationException("The booking number format was not valid.");
            var choice = NativeWindows.ListVisibleWindows().FirstOrDefault(x => x.Title.IndexOf("HL FIS", StringComparison.OrdinalIgnoreCase) >= 0);
            if (choice == null) throw new ApplicationException("FIS window not found.");
            var javaBin = NativeWindows.GetProcessFolder(choice.ProcessId);
            await EnsureErdAccessBridgeAsync(javaBin);
            if (NativeWindows.RestoreWindow(choice.Handle)) await Task.Delay(250);
            // Only retry before typing. Never regain focus in the middle of input.
            var focusTimer = Stopwatch.StartNew();
            var focusReady = false;
            do
            {
                NativeWindows.SetForegroundWindow(choice.Handle);
                await Task.Delay(100);
                if (NativeWindows.ForegroundBelongsToProcess(choice.ProcessId))
                {
                    await Task.Delay(100);
                    if (NativeWindows.ForegroundBelongsToProcess(choice.ProcessId)) { focusReady = true; break; }
                }
            } while (focusTimer.ElapsedMilliseconds < 2000);
            try
            {
                var logFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "GOT-ERD-Logs");
                Directory.CreateDirectory(logFolder);
                File.AppendAllText(Path.Combine(logFolder, "focus.log"), DateTime.UtcNow.ToString("o")
                    + " stage=before-typing targetPid=" + choice.ProcessId + " ready=" + focusReady
                    + " elapsedMs=" + focusTimer.ElapsedMilliseconds + Environment.NewLine);
            }
            catch { /* Diagnostics must not prevent a booking check. */ }
            if (!focusReady)
                throw new ApplicationException("HANDS_OFF: ERD could not bring FIS to the front. Nothing was typed. Click the FIS window, then retry.");
            var expertJumpField = await JavaAutomationProbe.FocusExpertJumpAsync(erdAccessBridge, choice.Handle);
            {
                if (!NativeWindows.ForegroundBelongsToProcess(choice.ProcessId)
                    || !JavaAutomationProbe.HasInputFocus(erdAccessBridge, choice.Handle, expertJumpField))
                    throw new ApplicationException("HANDS_OFF: FIS input focus changed. Nothing was typed. Resume when ready.");
                SendKeys.SendWait("^a");
                await Task.Delay(90);
                // FIS's Java text field can drop repeated digits when an entire
                // shipment is injected in one burst. Pace every character so
                // the field processes each key event before the next arrives.
                foreach (var character in "S8100 " + booking)
                {
                    if (!NativeWindows.ForegroundBelongsToProcess(choice.ProcessId))
                        throw new ApplicationException("HANDS_OFF: FIS lost focus during typing. The shipment was not submitted.");
                    SendKeys.SendWait(character.ToString());
                    await Task.Delay(20);
                }
                await Task.Delay(220);
                if (!NativeWindows.ForegroundBelongsToProcess(choice.ProcessId)
                    || !JavaAutomationProbe.HasInputFocus(erdAccessBridge, choice.Handle, expertJumpField))
                    throw new ApplicationException("HANDS_OFF: FIS input focus changed. The shipment was not submitted.");
                SendKeys.SendWait("{ENTER}");
                await Task.Delay(130);
                if (!NativeWindows.ForegroundBelongsToProcess(choice.ProcessId))
                {
                    if (NativeWindows.ForegroundIsWebBrowser())
                        throw new ApplicationException("Booking has split. Please contact Customer Service at usa@service.hlag.com.");
                    throw new ApplicationException("HANDS_OFF: FIS lost focus while the shipment was being opened. The run was paused before the next shipment.");
                }

                // The web layer now begins its verified read promptly. It retries
                // until the shipment read from FIS matches the requested number.
            }
            return booking;
        }

        private Task<string> CloseBookingForWebAsync(string shipment)
        {
            if (!InvokeRequired) return CloseBookingOnUiThreadAsync(shipment);
            var completion = new TaskCompletionSource<string>();
            BeginInvoke(new Action(async delegate {
                try { completion.SetResult(await CloseBookingOnUiThreadAsync(shipment)); }
                catch (Exception error) { completion.SetException(error); }
            }));
            return completion.Task;
        }

        private Task<string> CloseAllFisWindowsForWebAsync()
        {
            if (!InvokeRequired) return CloseAllFisWindowsOnUiThreadAsync();
            var completion = new TaskCompletionSource<string>();
            BeginInvoke(new Action(async delegate {
                try { completion.SetResult(await CloseAllFisWindowsOnUiThreadAsync()); }
                catch (Exception error) { completion.SetException(error); }
            }));
            return completion.Task;
        }

        private async Task<string> CloseAllFisWindowsOnUiThreadAsync()
        {
            var choice = NativeWindows.ListVisibleWindows().FirstOrDefault(x =>
                x.Title.IndexOf("HL FIS", StringComparison.OrdinalIgnoreCase) >= 0);
            if (choice == null) throw new ApplicationException("FIS window not found.");
            NativeWindows.RestoreWindow(choice.Handle);
            await Task.Delay(150);
            NativeWindows.SetForegroundWindow(choice.Handle);
            await Task.Delay(120);
            if (!NativeWindows.ForegroundBelongsToProcess(choice.ProcessId))
                throw new ApplicationException("FIS could not be brought to the foreground. No windows were closed.");
            SendKeys.SendWait("%w");
            await Task.Delay(180);
            SendKeys.SendWait("{DOWN 3}{ENTER}");
            await Task.Delay(500);
            return "closed-all";
        }

        private async Task<string> CloseBookingOnUiThreadAsync(string shipment)
        {
            if (!Regex.IsMatch(shipment ?? "", "^[0-9]{6,12}$")) throw new ApplicationException("The shipment number format was not valid.");
            var choice = NativeWindows.ListVisibleWindows().FirstOrDefault(x => x.Title.IndexOf("HL FIS", StringComparison.OrdinalIgnoreCase) >= 0);
            if (choice == null) throw new ApplicationException("FIS window not found.");
            var javaBin = NativeWindows.GetProcessFolder(choice.ProcessId);
            await EnsureErdAccessBridgeAsync(javaBin);
            NativeWindows.RestoreWindow(choice.Handle);
            await Task.Delay(150);

            for (var attempt = 1; attempt <= 3; attempt++)
            {
                if (!JavaGridProbe.IsS8100BookingOpen(erdAccessBridge, choice.Handle, shipment))
                    return shipment;

                var activeShipment = JavaGridProbe.ActiveS8100BookingNumber(erdAccessBridge, choice.Handle);
                if (!string.Equals(activeShipment, shipment, StringComparison.OrdinalIgnoreCase))
                {
                    if (!JavaGridProbe.ActivateS8100Booking(erdAccessBridge, choice.Handle, shipment))
                        throw new ApplicationException("The requested FIS shipment could not be selected. Nothing else was closed.");
                    await Task.Delay(180);
                    activeShipment = JavaGridProbe.ActiveS8100BookingNumber(erdAccessBridge, choice.Handle);
                    if (!string.Equals(activeShipment, shipment, StringComparison.OrdinalIgnoreCase))
                        throw new ApplicationException("The requested FIS shipment did not become active. Nothing else was closed.");
                }

                NativeWindows.SetForegroundWindow(choice.Handle);
                await Task.Delay(110);
                if (!NativeWindows.ForegroundBelongsToProcess(choice.ProcessId))
                    throw new ApplicationException("FIS could not be brought to the foreground. Nothing was closed.");
                SendKeys.SendWait("^{F4}");
                await Task.Delay(300 + (attempt * 150));
            }

            if (JavaGridProbe.IsS8100BookingOpen(erdAccessBridge, choice.Handle, shipment))
                throw new ApplicationException("FIS did not close shipment " + shipment + " after three verified attempts.");
            return shipment;
        }

        private static void ConfigureButton(Button button, string text, int x, int y, int width)
        {
            button.Text = text;
            button.Location = new Point(x, y);
            button.Size = new Size(width, 29);
            button.FlatStyle = FlatStyle.System;
        }

        private void LoadWindows()
        {
            var found = NativeWindows.ListVisibleWindows();
            windows.BeginUpdate();
            windows.Items.Clear();
            foreach (var item in found) windows.Items.Add(item);
            windows.EndUpdate();
            if (windows.Items.Count > 0)
            {
                var fisIndex = -1;
                for (var index = 0; index < windows.Items.Count; index++)
                {
                    var choice = windows.Items[index] as WindowChoice;
                    if (choice != null && choice.Title.IndexOf("HL FIS 2", StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        fisIndex = index;
                        break;
                    }
                }
                windows.SelectedIndex = fisIndex >= 0 ? fisIndex : 0;
            }
            status.Text = found.Count + " visible application windows found.";
        }

        private async Task ScanSelectedWindow()
        {
            var choice = windows.SelectedItem as WindowChoice;
            if (choice == null) return;
            scan.Enabled = false;
            refresh.Enabled = false;
            export.Enabled = false;
            status.Text = "Scanning “" + choice.Title + "”… the target remains untouched.";
            try
            {
                rows = await Task.Run(() => AutomationProbe.Scan(choice.Handle, 2500, 16));
                showingGrid = false;
                gridRows.Clear();
                results.DataSource = null;
                results.DataSource = rows;
                if (results.Columns["Name"] != null) results.Columns["Name"].AutoSizeMode = DataGridViewAutoSizeColumnMode.Fill;
                status.Text = rows.Count + " accessible elements found. Review the table or export it for mapping.";
                export.Enabled = rows.Count > 0;
            }
            catch (Exception error)
            {
                status.Text = "Scan failed: " + error.Message;
            }
            finally
            {
                scan.Enabled = true;
                refresh.Enabled = true;
            }
        }

        private async Task ScanSelectedJavaWindow()
        {
            var choice = windows.SelectedItem as WindowChoice;
            if (choice == null) return;
            scan.Enabled = scanJava.Enabled = inspectPoint.Enabled = refresh.Enabled = export.Enabled = false;
            status.Text = "Connecting to the Java Access Bridge for “" + choice.Title + "”…";
            try
            {
                var javaBin = NativeWindows.GetProcessFolder(choice.ProcessId);
                if (string.IsNullOrEmpty(javaBin)) throw new ApplicationException("Could not locate the selected application's Java runtime.");
                NativeWindows.SetDllDirectory(javaBin);
                using (var bridge = new AccessBridge())
                {
                    bridge.CollectionSizeLimit = 2500;
                    bridge.TextBufferLengthLimit = 4096;
                    bridge.Initialize();
                    await Task.Delay(1200);
                rows = JavaAutomationProbe.Scan(bridge, choice.Handle, 2500, 24);
                    showingGrid = false;
                    gridRows.Clear();
                }
                results.DataSource = null;
                results.DataSource = rows;
                if (results.Columns["Name"] != null) results.Columns["Name"].AutoSizeMode = DataGridViewAutoSizeColumnMode.Fill;
                status.Text = rows.Count + " Java elements found. Tabs, fields, and tables will appear when FIS exposes them.";
                export.Enabled = rows.Count > 0;
            }
            catch (Exception error)
            {
                status.Text = "Java scan failed: " + error.Message;
            }
            finally
            {
                scan.Enabled = scanJava.Enabled = inspectPoint.Enabled = refresh.Enabled = true;
            }
        }

        private async Task InspectSelectedJavaPoint()
        {
            var choice = windows.SelectedItem as WindowChoice;
            if (choice == null) return;
            scan.Enabled = scanJava.Enabled = inspectPoint.Enabled = refresh.Enabled = export.Enabled = false;
            try
            {
                for (var seconds = 4; seconds > 0; seconds--)
                {
                    status.Text = "Move the pointer over a routing-grid cell — inspecting in " + seconds + "…";
                    await Task.Delay(1000);
                }
                var point = Cursor.Position;
                status.Text = "Inspecting Java object at " + point.X + ", " + point.Y + "…";
                var javaBin = NativeWindows.GetProcessFolder(choice.ProcessId);
                if (string.IsNullOrEmpty(javaBin)) throw new ApplicationException("Could not locate the selected application's Java runtime.");
                NativeWindows.SetDllDirectory(javaBin);
                using (var bridge = new AccessBridge())
                {
                    bridge.CollectionSizeLimit = 2500;
                    bridge.TextBufferLengthLimit = 4096;
                    bridge.Initialize();
                    await Task.Delay(1200);
                    var root = bridge.CreateAccessibleWindow(choice.Handle);
                    if (root == null) throw new ApplicationException("FIS did not register with Java Access Bridge.");
                    var path = root.GetNodePathAtUsingAccessBridge(point);
                    if (path == null || path.Count == 0) throw new ApplicationException("No Java object was exposed at that point.");
                    rows = new List<ProbeRow>();
                    var depth = 0;
                    foreach (var node in path) rows.Add(JavaAutomationProbe.DescribeNode(node, bridge, depth++));
                    showingGrid = false;
                    gridRows.Clear();
                }
                results.DataSource = null;
                results.DataSource = rows;
                if (results.Columns["Name"] != null) results.Columns["Name"].AutoSizeMode = DataGridViewAutoSizeColumnMode.Fill;
                status.Text = "Found a " + rows[rows.Count - 1].ControlType + " at the pointer. The table shows its full Java ancestry.";
                export.Enabled = true;
            }
            catch (Exception error)
            {
                status.Text = "Point inspection failed: " + error.Message;
            }
            finally
            {
                scan.Enabled = scanJava.Enabled = inspectPoint.Enabled = refresh.Enabled = true;
            }
        }

        private async Task ReadSelectedJavaGrid()
        {
            var choice = windows.SelectedItem as WindowChoice;
            if (choice == null) return;
            SetBusy(true);
            try
            {
                for (var seconds = 4; seconds > 0; seconds--)
                {
                    status.Text = "Move the pointer over any grid cell — reading in " + seconds + "…";
                    await Task.Delay(1000);
                }
                var point = Cursor.Position;
                status.Text = "Finding the Java table at " + point.X + ", " + point.Y + "…";
                var javaBin = NativeWindows.GetProcessFolder(choice.ProcessId);
                if (string.IsNullOrEmpty(javaBin)) throw new ApplicationException("Could not locate the selected application's Java runtime.");
                NativeWindows.SetDllDirectory(javaBin);
                using (var bridge = new AccessBridge())
                {
                    bridge.CollectionSizeLimit = 10000;
                    bridge.TextBufferLengthLimit = 4096;
                    bridge.Initialize();
                    await Task.Delay(1200);
                    gridRows = JavaGridProbe.ReadAtPoint(bridge, choice.Handle, point, 10000);
                }
                showingGrid = true;
                results.DataSource = null;
                results.DataSource = gridRows;
                if (results.Columns["Value"] != null) results.Columns["Value"].AutoSizeMode = DataGridViewAutoSizeColumnMode.Fill;
                copyGrid.Enabled = export.Enabled = gridRows.Count > 0;
                var rowCount = gridRows.Count == 0 ? 0 : gridRows.Max(x => x.Row);
                var columnCount = gridRows.Count == 0 ? 0 : gridRows.Max(x => x.Column);
                status.Text = "Grid read complete: " + rowCount + " rows × " + columnCount + " columns (" + gridRows.Count + " cells).";
            }
            catch (Exception error)
            {
                status.Text = "Grid read failed: " + error.Message;
            }
            finally { SetBusy(false); }
        }

        private void SetBusy(bool busy)
        {
            scan.Enabled = scanJava.Enabled = inspectPoint.Enabled = readGrid.Enabled = refresh.Enabled = !busy;
            if (busy) export.Enabled = copyGrid.Enabled = false;
        }

        private void CopyGrid()
        {
            if (!showingGrid || gridRows.Count == 0) return;
            Clipboard.SetText(JavaGridProbe.ToTsv(gridRows));
            status.Text = "Copied the complete grid to the clipboard. You can paste it into Excel or the ERD tool.";
        }

        private void ExportCsv()
        {
            using (var dialog = new SaveFileDialog())
            {
                dialog.Title = "Export UI Automation map";
                dialog.Filter = "CSV files (*.csv)|*.csv";
                dialog.FileName = "erd-ui-map-" + DateTime.Now.ToString("yyyyMMdd-HHmmss") + ".csv";
                if (dialog.ShowDialog(this) != DialogResult.OK) return;
                var csv = new StringBuilder();
                if (showingGrid)
                {
                    csv.Append("Row,Column,ColumnName,Value,Role,Bounds\r\n");
                    foreach (var cell in gridRows)
                        csv.Append(cell.Row).Append(',').Append(cell.Column).Append(',').Append(Csv(cell.ColumnName)).Append(',')
                            .Append(Csv(cell.Value)).Append(',').Append(Csv(cell.Role)).Append(',').Append(Csv(cell.Bounds)).Append("\r\n");
                }
                else
                {
                    csv.Append("Depth,ControlType,Name,AutomationId,ClassName,Value,Bounds,Enabled\r\n");
                    foreach (var row in rows)
                        csv.Append(row.Depth).Append(',').Append(Csv(row.ControlType)).Append(',')
                            .Append(Csv(row.Name)).Append(',').Append(Csv(row.AutomationId)).Append(',')
                            .Append(Csv(row.ClassName)).Append(',').Append(Csv(row.Value)).Append(',')
                            .Append(Csv(row.Bounds)).Append(',').Append(row.Enabled).Append("\r\n");
                }
                File.WriteAllText(dialog.FileName, csv.ToString(), new UTF8Encoding(true));
                status.Text = "Exported " + (showingGrid ? gridRows.Count : rows.Count) + " records to " + dialog.FileName;
            }
        }

        private static string Csv(string value)
        {
            value = value ?? string.Empty;
            return "\"" + value.Replace("\"", "\"\"") + "\"";
        }
    }

    internal static class JavaBridgeSetup
    {
        private const string BridgeClass = "com.sun.java.accessibility.AccessBridge";

        public static bool EnsureConfigured(Form owner)
        {
            var path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".accessibility.properties");
            if (IsConfigured(path)) return true;

            owner.WindowState = FormWindowState.Normal;
            owner.ShowInTaskbar = true;
            owner.Opacity = 1;
            owner.Activate();
            var answer = MessageBox.Show(owner,
                "FIRST-TIME SETUP\r\n\r\n"
                + "ERD Screen Bridge needs Windows' Java accessibility connection to read FIS. "
                + "This is a current-user setting and does not require administrator rights.\r\n\r\n"
                + "1. Save your work and close every FIS window.\r\n"
                + "2. Choose Yes to enable the connection.\r\n"
                + "3. Reopen FIS and your S8100 booking.\r\n"
                + "4. Start the ERD Team Tool again.\r\n\r\n"
                + "Enable Java Access Bridge now?",
                "ERD Team Tool · First-Time Setup", MessageBoxButtons.YesNo, MessageBoxIcon.Information);
            if (answer != DialogResult.Yes) return false;

            try
            {
                var lines = File.Exists(path) ? File.ReadAllLines(path).ToList() : new List<string>();
                if (File.Exists(path))
                {
                    var backup = path + ".erd-screen-bridge-backup";
                    if (!File.Exists(backup)) File.Copy(path, backup);
                }
                var propertyIndex = lines.FindIndex(line => line.TrimStart().StartsWith("assistive_technologies=", StringComparison.OrdinalIgnoreCase));
                if (propertyIndex >= 0)
                {
                    var current = lines[propertyIndex];
                    var separator = current.IndexOf('=');
                    var values = separator >= 0 ? current.Substring(separator + 1).Split(',').Select(x => x.Trim()).Where(x => x.Length > 0).ToList() : new List<string>();
                    if (!values.Any(x => x.Equals(BridgeClass, StringComparison.OrdinalIgnoreCase))) values.Add(BridgeClass);
                    lines[propertyIndex] = "assistive_technologies=" + string.Join(",", values);
                }
                else lines.Add("assistive_technologies=" + BridgeClass);
                File.WriteAllLines(path, lines.ToArray(), new UTF8Encoding(false));
                MessageBox.Show(owner,
                    "Setup is complete.\r\n\r\nClose this message, reopen FIS, open the S8100 Routing tab, then run Start ERD Tool again. "
                    + "Future launches will start minimized and will not repeat this setup.",
                    "ERD Team Tool · Restart FIS", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception error)
            {
                MessageBox.Show(owner, "Setup could not update the current-user Java accessibility setting:\r\n\r\n" + error.Message,
                    "ERD Team Tool · Setup Problem", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            return false;
        }

        private static bool IsConfigured(string path)
        {
            try
            {
                return File.Exists(path) && File.ReadAllLines(path).Any(line =>
                    line.TrimStart().StartsWith("assistive_technologies=", StringComparison.OrdinalIgnoreCase)
                    && line.IndexOf(BridgeClass, StringComparison.OrdinalIgnoreCase) >= 0);
            }
            catch { return false; }
        }
    }

    internal static class AutomationProbe
    {
        public static List<ProbeRow> Scan(IntPtr handle, int maxElements, int maxDepth)
        {
            var rows = new List<ProbeRow>();
            var root = AutomationElement.FromHandle(handle);
            Walk(root, TreeWalker.RawViewWalker, 0, rows, maxElements, maxDepth);
            return rows;
        }

        private static void Walk(AutomationElement element, TreeWalker walker, int depth, List<ProbeRow> rows, int maxElements, int maxDepth)
        {
            if (element == null || rows.Count >= maxElements || depth > maxDepth) return;
            try
            {
                var current = element.Current;
                var value = string.Empty;
                object pattern;
                if (element.TryGetCurrentPattern(ValuePattern.Pattern, out pattern))
                    value = ((ValuePattern)pattern).Current.Value;
                var bounds = current.BoundingRectangle;
                rows.Add(new ProbeRow {
                    Depth = depth,
                    ControlType = current.ControlType.ProgrammaticName.Replace("ControlType.", ""),
                    Name = current.Name,
                    AutomationId = current.AutomationId,
                    ClassName = current.ClassName,
                    Value = value,
                    Bounds = string.Format(CultureInfo.InvariantCulture, "{0:0},{1:0} {2:0}x{3:0}", bounds.X, bounds.Y, bounds.Width, bounds.Height),
                    Enabled = current.IsEnabled
                });

                var child = walker.GetFirstChild(element);
                while (child != null && rows.Count < maxElements)
                {
                    Walk(child, walker, depth + 1, rows, maxElements, maxDepth);
                    child = walker.GetNextSibling(child);
                }
            }
            catch (ElementNotAvailableException) { }
            catch (COMException) { }
        }
    }

    internal static class JavaAutomationProbe
    {
        public static List<ProbeRow> Scan(AccessBridge bridge, IntPtr handle, int maxElements, int maxDepth)
        {
            var root = bridge.CreateAccessibleWindow(handle);
            if (root == null) throw new ApplicationException("The selected window did not register with Java Access Bridge. Restart FIS after enabling the bridge.");
            var rows = new List<ProbeRow>();
            Walk(root, bridge, 0, rows, maxElements, maxDepth);
            return rows;
        }

        private static void Walk(AccessibleNode node, AccessBridge bridge, int depth, List<ProbeRow> rows, int maxElements, int maxDepth)
        {
            if (node == null || rows.Count >= maxElements || depth > maxDepth) return;
            try
            {
                rows.Add(DescribeNode(node, bridge, depth));
                foreach (var child in node.GetChildren())
                {
                    if (rows.Count >= maxElements) break;
                    Walk(child, bridge, depth + 1, rows, maxElements, maxDepth);
                }
            }
            catch (Exception error)
            {
                rows.Add(new ProbeRow { Depth = depth, ControlType = "JavaError", Name = error.Message, ClassName = "JavaAccessBridge", Enabled = false });
            }
        }

        public static ProbeRow DescribeNode(AccessibleNode node, AccessBridge bridge, int depth)
        {
                var context = node as AccessibleContextNode;
                var name = node.GetTitle();
                var role = "JavaNode";
                var description = string.Empty;
                var actionsText = string.Empty;
                var boundsText = string.Empty;
                var enabled = true;
                if (context != null)
                {
                    var info = context.GetInfo();
                    name = info.name;
                    role = info.role;
                    description = info.description;
                    enabled = info.states == null || info.states.IndexOf("enabled", StringComparison.OrdinalIgnoreCase) >= 0;
                    boundsText = string.Format(CultureInfo.InvariantCulture, "{0},{1} {2}x{3}", info.x, info.y, info.width, info.height);
                    var value = new StringBuilder(4096);
                    if (bridge.Functions.GetCurrentAccessibleValueFromContext(context.JvmId, context.AccessibleContextHandle, value, (short)value.Capacity) && value.Length > 0)
                        description = value.ToString();
                    else if (info.accessibleText != 0)
                    {
                        AccessibleTextInfo textInfo;
                        if (bridge.Functions.GetAccessibleTextInfo(context.JvmId, context.AccessibleContextHandle, out textInfo, info.x, info.y) && textInfo.charCount > 0)
                        {
                            var count = Math.Min(textInfo.charCount, 4095);
                            var buffer = new char[count + 1];
                            if (bridge.Functions.GetAccessibleTextRange(context.JvmId, context.AccessibleContextHandle, 0, count - 1, buffer, (short)buffer.Length))
                                description = new string(buffer).TrimEnd('\0');
                        }
                    }
                    if (Regex.IsMatch(role ?? "", "text|field|button|combo", RegexOptions.IgnoreCase))
                    {
                        AccessibleActions actions;
                        if (bridge.Functions.GetAccessibleActions(context.JvmId, context.AccessibleContextHandle, out actions) && actions != null)
                            actionsText = string.Join(", ", actions.actionInfo.Take(actions.actionsCount).Select(action => action.name).Where(action => !string.IsNullOrWhiteSpace(action)));
                    }
                }
                return new ProbeRow { Depth = depth, ControlType = role, Name = name, AutomationId = actionsText, ClassName = "JavaAccessBridge", Value = description, Bounds = boundsText, Enabled = enabled };
        }

        [DllImport("WindowsAccessBridge-64.dll", EntryPoint = "requestFocus", CallingConvention = CallingConvention.Cdecl)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool RequestJavaFocus(int vmId, long accessibleContext);

        public static async Task<AccessibleContextNode> FocusExpertJumpAsync(AccessBridge bridge, IntPtr handle)
        {
            var root = bridge.CreateAccessibleWindow(handle);
            if (root == null) throw new ApplicationException("FIS did not register with Java Access Bridge.");
            var visited = 0;
            var field = FindExpertJumpField(root, bridge, 0, ref visited);
            if (field == null) throw new ApplicationException("The FIS Expert Jump field was not found.");
            // Focus the actual Java control; screen pixels and Windows DPI are
            // intentionally not involved in selecting the input field.
            if (!RequestJavaFocus(field.JvmId, field.AccessibleContextHandle.Handle.Value))
                throw new ApplicationException("HANDS_OFF: FIS could not focus its Expert Jump input. Nothing was typed. Resume when ready.");
            var watch = Stopwatch.StartNew();
            do
            {
                if (HasInputFocus(bridge, handle, field)) return field;
                await Task.Delay(25);
            } while (watch.ElapsedMilliseconds < 1000);
            throw new ApplicationException("HANDS_OFF: FIS did not confirm focus on its Expert Jump input. Nothing was typed. Resume when ready.");
        }

        public static bool HasInputFocus(AccessBridge bridge, IntPtr window, AccessibleContextNode field)
        {
            int vmId;
            JavaObjectHandle focused;
            if (!bridge.Functions.GetAccessibleContextWithFocus(window, out vmId, out focused)) return false;
            using (focused)
                return vmId == field.JvmId && focused != null && !focused.IsNull
                    && bridge.Functions.IsSameObject(vmId, focused, field.AccessibleContextHandle);
        }

        private static AccessibleContextNode FindExpertJumpField(AccessibleNode node, AccessBridge bridge, int depth, ref int visited)
        {
            if (node == null || depth > 28 || visited++ >= 12000) return null;
            var context = node as AccessibleContextNode;
            try
            {
                if (context != null)
                {
                    var info = context.GetInfo();
                    if (string.Equals(info.role, "text", StringComparison.OrdinalIgnoreCase))
                    {
                        var value = new StringBuilder(512);
                        bridge.Functions.GetCurrentAccessibleValueFromContext(context.JvmId, context.AccessibleContextHandle, value, (short)value.Capacity);
                        if ((info.description ?? "").IndexOf(".ExpertJumpComboBox", StringComparison.OrdinalIgnoreCase) >= 0
                            || value.ToString().IndexOf(".ExpertJumpComboBox", StringComparison.OrdinalIgnoreCase) >= 0) return context;
                    }
                }
                foreach (var child in node.GetChildren())
                {
                    var found = FindExpertJumpField(child, bridge, depth + 1, ref visited);
                    if (found != null) return found;
                }
            }
            catch { }
            return null;
        }
    }

    internal static class JavaGridProbe
    {
        private static string cachedBookingNumber;
        private static S8100Summary cachedSummary;
        private static AccessibleContextNode cachedBookingWindow;

        public static List<GridCellRow> ReadAtPoint(AccessBridge bridge, IntPtr handle, Point point, int maxCells)
        {
            var root = bridge.CreateAccessibleWindow(handle);
            if (root == null) throw new ApplicationException("FIS did not register with Java Access Bridge.");

            AccessibleContextNode table = null;
            var path = root.GetNodePathAtUsingAccessBridge(point);
            if (path != null)
            {
                foreach (var node in path)
                {
                    var context = node as AccessibleContextNode;
                    if (context != null && IsTable(context)) table = context;
                }
            }

            AccessibleTableInfo tableInfo = null;
            var mapped = table != null && bridge.Functions.GetAccessibleTableInfo(table.JvmId, table.AccessibleContextHandle, out tableInfo);
            if (!mapped)
                table = FindNearestReadableTable(root, point, bridge, out tableInfo);
            if (table == null)
                throw new ApplicationException("No readable Java table was found in this FIS screen. Try Scan Java once so we can see how this screen exposes its grid.");
            return ReadTableGroup(root, table, tableInfo, point, bridge, maxCells);
        }

        private static List<GridCellRow> ReadTableGroup(AccessibleNode root, AccessibleContextNode table, AccessibleTableInfo tableInfo, Point point, AccessBridge bridge, int maxCells)
        {
            if (tableInfo.rowCount <= 0 || tableInfo.columnCount <= 0)
                throw new ApplicationException("The grid reported no readable rows or columns.");

            var relatedTables = FindRelatedTables(root, table, tableInfo, point, bridge);
            var total = relatedTables.Sum(x => (long)x.Info.rowCount * x.Info.columnCount);
            if (total > maxCells)
                throw new ApplicationException("The grid contains " + total + " cells; the read-only safety limit is " + maxCells + ".");

            var cells = new List<GridCellRow>();
            var columnOffset = 0;
            foreach (var related in relatedTables)
            {
                var columnNames = GetColumnNames(bridge, related.Node, related.Info, columnOffset);
                for (var row = 0; row < related.Info.rowCount; row++)
                {
                    for (var column = 0; column < related.Info.columnCount; column++)
                    {
                        var outputColumn = columnOffset + column + 1;
                        AccessibleTableCellInfo cellInfo;
                        if (!bridge.Functions.GetAccessibleTableCellInfo(related.Info.accessibleTable.JvmId, related.Info.accessibleTable, row, column, out cellInfo))
                        {
                            cells.Add(new GridCellRow { Row = row + 1, Column = outputColumn, ColumnName = columnNames[column], Value = "", Role = "unavailable", Bounds = "" });
                            continue;
                        }
                        var cellNode = new AccessibleContextNode(bridge, cellInfo.accessibleContext);
                        var detail = JavaAutomationProbe.DescribeNode(cellNode, bridge, 0);
                        var value = detail.Value;
                        if (string.IsNullOrWhiteSpace(value)) value = detail.Name;
                        cells.Add(new GridCellRow {
                            Row = row + 1,
                            Column = outputColumn,
                            ColumnName = columnNames[column],
                            Value = value ?? "",
                            Role = detail.ControlType,
                            Bounds = detail.Bounds
                        });
                    }
                }
                columnOffset += related.Info.columnCount;
            }
            TrimBlankEdgeColumns(cells);
            ApplyKnownRoutingHeaders(cells);
            return cells;
        }

        public static string ActiveS8100BookingNumber(AccessBridge bridge, IntPtr handle)
        {
            var root = bridge.CreateAccessibleWindow(handle);
            var selectedFrame = SelectedS8100Frame(bridge, root);
            if (selectedFrame != null) {
                var actualShipment = FindNamedTextValue(selectedFrame, bridge, "Shipment", 0, new int[] { 0 });
                if (!string.IsNullOrWhiteSpace(actualShipment)) return actualShipment;
            }
            var active = ActiveBookingWindow(bridge, root) ?? SelectedBookingFromCachedAncestors(bridge);
            if (active != null) return active.BookingNumber;
            var matches = new List<S8100WindowCandidate>();
            FindS8100Windows(bridge, root, 0, 32, new int[] { 0 }, matches);
            var preferred = PreferredBookingWindow(matches);
            if (preferred == null) throw new ApplicationException("No open S8100 booking was found in FIS.");
            return preferred.BookingNumber;
        }

        public static bool IsS8100BookingOpen(AccessBridge bridge, IntPtr handle, string booking)
        {
            var root = bridge.CreateAccessibleWindow(handle);
            if (root == null) return false;
            var selectedFrame = SelectedS8100Frame(bridge, root);
            if (selectedFrame != null && FindNamedTextValue(selectedFrame, bridge, "Shipment", 0, new int[] { 0 }) == booking) return true;
            var matches = new List<S8100WindowCandidate>();
            FindS8100Windows(bridge, root, 0, 32, new int[] { 0 }, matches);
            return matches.Any(x => string.Equals(x.BookingNumber, booking, StringComparison.OrdinalIgnoreCase));
        }

        public static bool ActivateS8100Booking(AccessBridge bridge, IntPtr handle, string booking)
        {
            var root = bridge.CreateAccessibleWindow(handle);
            if (root == null) return false;
            var matches = new List<S8100WindowCandidate>();
            FindS8100Windows(bridge, root, 0, 32, new int[] { 0 }, matches);
            var target = matches
                .Where(x => string.Equals(x.BookingNumber, booking, StringComparison.OrdinalIgnoreCase))
                .OrderByDescending(x => x.ActiveScore)
                .FirstOrDefault();
            return target != null && ActivateBookingWindow(bridge, target.Node);
        }

        public static S8100Summary ReadS8100Summary(AccessBridge bridge, IntPtr handle, bool readEquipment = true, bool soloScreen = false)
        {
            var root = bridge.CreateAccessibleWindow(handle);
            if (root == null) throw new ApplicationException("FIS did not register with Java Access Bridge.");
            // A failed Expert Jump can leave the previous S8100 window open.
            // Prefer the current FIS error/browser outcome over that stale window.
            // Only the selected S8100 frame may determine an error. Older blank
            // windows must never override a currently loaded booking.
            var selectedFrame = SelectedS8100Frame(bridge, root);
            // A solo check already owns the selected booking. Resolve it once
            // instead of repeatedly walking Java's active-descendant ancestry.
            S8100WindowCandidate soloWindow = null;
            var selectedContext = selectedFrame as AccessibleContextNode;
            if (soloScreen && selectedContext != null)
            {
                var selectedMatch = Regex.Match(selectedContext.GetInfo().name ?? "",
                    @"^S8100\s+Booking\s+Detail\s*-\s*(\d+)\b", RegexOptions.IgnoreCase);
                if (selectedMatch.Success)
                    soloWindow = new S8100WindowCandidate { Node = selectedFrame,
                        BookingNumber = selectedMatch.Groups[1].Value, ActiveScore = 1000 };
            }
            var emptyShipment = selectedFrame == null ? "" : FindEmptyBooking(bridge, selectedFrame, 0, new int[] { 0 });
            if (!string.IsNullOrEmpty(emptyShipment)) throw new ApplicationException("FIS_EMPTY_BOOKING:" + emptyShipment);
            if (soloWindow == null && ActiveS8100ShipmentIsBlank(bridge, root))
                throw new ApplicationException("Booking has split. Please contact Customer Service at usa@service.hlag.com.");
            if (NativeWindows.ForegroundIsWebBrowser())
                throw new ApplicationException("Booking has split. Please contact Customer Service at usa@service.hlag.com.");
            if (!soloScreen && cachedSummary != null && cachedBookingWindow != null && CachedWindowStillActive(bridge))
                return cachedSummary;
            var activeWindow = soloScreen ? soloWindow : ActiveBookingWindow(bridge, root) ?? SelectedBookingFromCachedAncestors(bridge);
            var activeBooking = activeWindow == null ? "" : activeWindow.BookingNumber;
            if (!soloScreen && activeWindow != null && cachedSummary != null
                && string.Equals(activeBooking, cachedBookingNumber, StringComparison.OrdinalIgnoreCase))
                return cachedSummary;
            var bookingWindows = new List<S8100WindowCandidate>();
            var bookingWindow = activeWindow;
            // Most FIS layouts expose the focused booking through Java Access
            // Bridge. Only walk the full application tree when they do not.
            if (bookingWindow == null)
            {
                FindS8100Windows(bridge, root, 0, 32, new int[] { 0 }, bookingWindows, null, soloScreen);
                bookingWindow = PreferredBookingWindow(bookingWindows);
            }
            if (bookingWindow == null)
            {
                throw new ApplicationException("No open S8100 booking was found in FIS.");
            }
            var booking = bookingWindow.BookingNumber;

            // Internal S8100 frames overlap. Selecting a candidate by title is
            // not enough: coordinate-based grid reads would otherwise hit the
            // older frame underneath and combine two different bookings.
            // When Java Access Bridge positively identifies this exact booking as
            // the active descendant, its node is already the correct foreground
            // frame. Avoid selecting it again, waiting, and walking the full FIS
            // tree a second time. Keep the original activation/rescan fallback for
            // layouts where FIS does not expose a reliable active descendant.
            if (!soloScreen && !string.Equals(activeBooking, booking, StringComparison.OrdinalIgnoreCase))
            {
                ActivateBookingWindow(bridge, bookingWindow.Node);
                Thread.Sleep(250);
                root = bridge.CreateAccessibleWindow(handle);
                bookingWindows = new List<S8100WindowCandidate>();
                FindS8100Windows(bridge, root, 0, 32, new int[] { 0 }, bookingWindows);
                bookingWindow = bookingWindows.LastOrDefault(x => x.BookingNumber == booking) ?? bookingWindows.FirstOrDefault();
                if (bookingWindow == null) throw new ApplicationException("The selected S8100 booking was no longer available.");
            }

            var bookingTitle = bookingWindow.Node.GetTitle() ?? "";
            var isLgbRestricted = Regex.IsMatch(bookingTitle, @"\bHAPAGL\s+11\b", RegexOptions.IgnoreCase);
            if (IsStatusChecked(bookingWindow.Node, "CANCEL(?:ED|LED)?"))
                throw new ApplicationException("Canceled booking.");

            var visited = 0;
            AccessibleTableInfo routingInfo = null;
            var routingNode = FindRoutingTypeTable(bookingWindow.Node, bridge, 0, 32, ref visited, out routingInfo);

            // Reuse an already-visible Routing grid. Only perform the slower
            // tab search when the booking is currently showing another page.
            if (routingNode == null && SelectBookingTab(bridge, handle, booking, "Routing"))
            {
                Thread.Sleep(350);
                root = bridge.CreateAccessibleWindow(handle);
                bookingWindows = new List<S8100WindowCandidate>();
                FindS8100Windows(bridge, root, 0, 32, new int[] { 0 }, bookingWindows);
                bookingWindow = bookingWindows.LastOrDefault(x => x.BookingNumber == booking) ?? bookingWindows.LastOrDefault();
                if (bookingWindow == null) throw new ApplicationException("The S8100 booking was no longer available after opening Routing.");
                visited = 0;
                routingNode = FindRoutingTypeTable(bookingWindow.Node, bridge, 0, 32, ref visited, out routingInfo);
            }

            var routingType = routingNode == null ? null : new TableCandidate { Node = routingNode };
            if (routingType == null) throw new ApplicationException("Open the Routing tab in S8100, then press ERD? again.");
            var infoNode = routingType.Node.GetInfo();
            var point = new Point(infoNode.x + Math.Max(1, infoNode.width / 2), infoNode.y + Math.Max(1, infoNode.height / 2));
            var cells = ReadTableGroup(bookingWindow.Node, routingType.Node, routingInfo, point, bridge, 10000);
            var typeColumn = FindColumn(cells, "Type");
            var locodeColumn = FindColumn(cells, "Locode");
            var locationColumn = FindColumn(cells, "Location Name");
            var motColumn = FindColumn(cells, "MoT");
            var voyageColumn = FindColumn(cells, "Schedule Voyage");
            var serviceColumn = FindColumn(cells, "MoT Service");
            var vesselColumn = FindColumn(cells, "Vessel");
            var cutoffDateColumn = FindColumn(cells, "Relevant Cut Off Date");
            var cutoffTimeColumn = FindColumn(cells, "Relevant Cut Off Time");
            var customerPlaceColumn = FindColumn(cells, "Customer Place");
            var departureTerminalColumn = FindColumn(cells, "Departure Terminal");
            var requiredColumns = new[] {
                new { Name = "Type", Column = typeColumn }, new { Name = "Locode", Column = locodeColumn },
                new { Name = "Location Name", Column = locationColumn }, new { Name = "MoT", Column = motColumn },
                new { Name = "Schedule", Column = voyageColumn }, new { Name = "MoT Service", Column = serviceColumn },
                new { Name = "Vessel", Column = vesselColumn }, new { Name = "Relevant Cut Off Date", Column = cutoffDateColumn },
                new { Name = "Relevant Cut Off Time", Column = cutoffTimeColumn },
                new { Name = "Departure Terminal", Column = departureTerminalColumn }
            };
            var missingColumns = requiredColumns.Where(x => x.Column == 0).Select(x => x.Name).ToArray();
            if (missingColumns.Length > 0)
                throw new ApplicationException("FIS routing columns missing: " + string.Join(", ", missingColumns)
                    + ". Exposed: " + string.Join(", ", cells.Select(x => x.ColumnName).Where(x => !string.IsNullOrWhiteSpace(x)).Distinct()));
            var polRow = cells.Where(x => x.Column == typeColumn && string.Equals(x.Value, "POL", StringComparison.OrdinalIgnoreCase)).Select(x => x.Row).FirstOrDefault();
            var startRow = cells.Where(x => x.Column == typeColumn && string.Equals(x.Value, "SRT", StringComparison.OrdinalIgnoreCase)).Select(x => x.Row).FirstOrDefault();
            if (polRow == 0 && startRow == 0)
                throw new ApplicationException("Booking not found. Please check the booking number and submit again.");
            if (polRow == 0 || startRow == 0)
                throw new ApplicationException("Not a rail move, please reach out to Customer Service at usa@service.hlag.com.");
            var railRow = cells
                .Where(x => x.Column == motColumn && x.Row < polRow && IsRailMot(x.Value))
                .Select(x => x.Row)
                .OrderBy(x => x)
                .FirstOrDefault();
            if (railRow == 0)
                throw new ApplicationException("Not a rail move, please reach out to Customer Service at usa@service.hlag.com.");
            startRow = railRow;
            var customerPlaces = customerPlaceColumn == 0 ? new List<string>() : cells
                .Where(cell => cell.Column == customerPlaceColumn && !string.IsNullOrWhiteSpace(cell.Value))
                .OrderBy(cell => cell.Row)
                .Select(cell => cell.Value.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
            var customerPlace = customerPlaceColumn == 0 ? "" : new[] { railRow, startRow, polRow }
                .Where(row => row != 0)
                .Select(row => Cell(cells, row, customerPlaceColumn))
                .FirstOrDefault(value => !string.IsNullOrWhiteSpace(value)) ?? "";
            var summary = new S8100Summary {
                BookingNumber = booking,
                ShipmentNumber = FindNamedTextValue(bookingWindow.Node, bridge, "Shipment", 0, new int[] { 0 }),
                StartLocode = Cell(cells, startRow, locodeColumn),
                StartCity = Cell(cells, startRow, locationColumn),
                PolLocode = Cell(cells, polRow, locodeColumn),
                PolCity = Cell(cells, polRow, locationColumn),
                Voyage = Cell(cells, polRow, voyageColumn),
                DpVoyage = Cell(cells, polRow, FindColumn(cells, "DP Voyage")),
                MotService = Cell(cells, polRow, serviceColumn),
                Vessel = Cell(cells, polRow, vesselColumn),
                RelevantCutoffDate = Cell(cells, polRow, cutoffDateColumn),
                RelevantCutoffTime = Cell(cells, polRow, cutoffTimeColumn),
                DepartureTerminal = Cell(cells, polRow, departureTerminalColumn),
                CustomerPlace = customerPlace,
                CustomerPlaces = customerPlaces,
                CanadianRail = CanadianRailFromCustomerPlace(customerPlace),
                EquipmentType = "",
                IsReefer = IsTemperatureStatusChecked(bookingWindow.Node),
                IsCanceled = IsStatusChecked(bookingWindow.Node, "CANCEL(?:ED|LED)?"),
                IsDangerousGoods = IsStatusChecked(bookingWindow.Node, "DG"),
                IsLgbRestricted = isLgbRestricted,
                IsHapagl11 = isLgbRestricted,
                Equipment = new List<EquipmentItem>()
            };
            if (Regex.IsMatch(summary.StartLocode ?? "", @"^US(?:LGB|LAX)$", RegexOptions.IgnoreCase))
                summary.IsLgbRestricted = true;
            if (summary.IsReefer) summary.EquipmentType = "Reefer";
            var scannedEquipment = false;
            try
            {
                // Canadian CP/CN schedule matching does not use equipment type.
                // Avoiding that tab scan makes the frequent Canada lookup much faster.
                if (readEquipment && !summary.PolLocode.StartsWith("CA", StringComparison.OrdinalIgnoreCase))
                {
                    scannedEquipment = true;
                    summary.Equipment = ReadEquipment(bridge, handle, booking);
                    summary.EquipmentType = string.Join(", ", summary.Equipment.Select(x => x.PlannedType).Where(x => !string.IsNullOrWhiteSpace(x)).Distinct());
                    summary.IsReefer = summary.Equipment.Any(x => IsReeferEquipmentType(x.PlannedType));
                }
            }
            catch
            {
                // Equipment detection is additive. If FIS does not expose the
                // tab or its table, preserve the existing dry calculation.
            }
            finally
            {
                try { if (scannedEquipment) SelectBookingTab(bridge, handle, booking, "Routing"); }
                catch { }
            }
            if (!soloScreen)
            {
                cachedBookingNumber = booking;
                cachedSummary = summary;
                cachedBookingWindow = bookingWindow.Node as AccessibleContextNode;
            }
            return summary;
        }

        private static string FindNamedTextValue(AccessibleNode node, AccessBridge bridge, string wantedName, int depth, int[] visited)
        {
            if (node == null || depth > 28 || visited[0]++ >= 4000) return "";
            var context = node as AccessibleContextNode;
            try
            {
                if (context != null)
                {
                    var info = context.GetInfo();
                    if (string.Equals((info.name ?? "").Trim(), wantedName, StringComparison.OrdinalIgnoreCase))
                    {
                        var value = new StringBuilder(256);
                        if (bridge.Functions.GetCurrentAccessibleValueFromContext(context.JvmId, context.AccessibleContextHandle, value, (short)value.Capacity)
                            && value.Length > 0) return value.ToString().Trim();
                        if (info.accessibleText != 0)
                        {
                            AccessibleTextInfo textInfo;
                            if (bridge.Functions.GetAccessibleTextInfo(context.JvmId, context.AccessibleContextHandle, out textInfo, info.x, info.y) && textInfo.charCount > 0)
                            {
                                var count = Math.Min(textInfo.charCount, 255);
                                var buffer = new char[count + 1];
                                if (bridge.Functions.GetAccessibleTextRange(context.JvmId, context.AccessibleContextHandle, 0, count - 1, buffer, (short)buffer.Length))
                                    return new string(buffer).TrimEnd('\0').Trim();
                            }
                        }
                    }
                }
                foreach (var child in node.GetChildren())
                {
                    var value = FindNamedTextValue(child, bridge, wantedName, depth + 1, visited);
                    if (!string.IsNullOrWhiteSpace(value)) return value;
                }
            }
            catch { }
            return "";
        }

        private static AccessibleNode SelectedS8100Frame(AccessBridge bridge, AccessibleContextNode root)
        {
            try {
                var handle = bridge.Functions.GetActiveDescendent(root.JvmId, root.AccessibleContextHandle);
                AccessibleNode node = handle.IsNull ? null : new AccessibleContextNode(bridge, handle);
                for (var depth = 0; node != null && depth < 40; depth++, node = node.GetParent()) {
                    var context = node as AccessibleContextNode;
                    if (context == null) continue;
                    var info = context.GetInfo();
                    if (NormalizeHeader(info.role) == "INTERNALFRAME" && Regex.IsMatch(info.name ?? "", @"^S8100\s+Booking\s+Detail\b", RegexOptions.IgnoreCase)) return node;
                }
                var selected = new List<AccessibleNode>();
                FindSelectedS8100Frames(root, 0, new int[] { 0 }, selected);
                return selected.Count == 1 ? selected[0] : null;
            } catch { return null; }
        }

        private static void FindSelectedS8100Frames(AccessibleNode node, int depth, int[] visited, List<AccessibleNode> selected)
        {
            if (node == null || depth > 32 || visited[0]++ > 6000) return;
            try {
                var context = node as AccessibleContextNode;
                if (context != null) {
                    var info = context.GetInfo();
                    if (NormalizeHeader(info.role) == "INTERNALFRAME") {
                        var states = (info.states_en_US ?? info.states ?? "").Split(',').Select(x => x.Trim().ToUpperInvariant());
                        if (Regex.IsMatch(info.name ?? "", @"^S8100\s+Booking\s+Detail\b", RegexOptions.IgnoreCase)
                            && (states.Contains("ACTIVE") || states.Contains("SELECTED"))) selected.Add(node);
                        return;
                    }
                }
                foreach (var child in node.GetChildren()) FindSelectedS8100Frames(child, depth + 1, visited, selected);
            } catch { }
        }

        private static string FindEmptyBooking(AccessBridge bridge, AccessibleNode node, int depth, int[] visited)
        {
            if (node == null || depth > 32 || visited[0]++ > 6000) return "";
            try {
                var frameContext = node as AccessibleContextNode;
                var frameInfo = frameContext == null ? null : frameContext.GetInfo();
                if (frameInfo != null && NormalizeHeader(frameInfo.role) == "INTERNALFRAME"
                    && Regex.IsMatch(frameInfo.name ?? "", @"^S8100\s+Booking\s+Detail\s*$", RegexOptions.IgnoreCase)) {
                    var shipment = FindNamedTextValue(node, bridge, "Shipment", 0, new int[] { 0 });
                    if (Regex.IsMatch(shipment, @"^\d{6,12}$")
                        && string.IsNullOrWhiteSpace(FindNamedTextValue(node, bridge, "Type", 0, new int[] { 0 }))
                        && string.IsNullOrWhiteSpace(FindNamedTextValue(node, bridge, "Routing", 0, new int[] { 0 }))
                        && HasEmptyTable(bridge, node, 0, new int[] { 0 })) return shipment;
                    return "";
                }
                foreach (var child in node.GetChildren()) {
                    var found = FindEmptyBooking(bridge, child, depth + 1, visited);
                    if (found.Length > 0) return found;
                }
            } catch { }
            return "";
        }

        private static bool HasEmptyTable(AccessBridge bridge, AccessibleNode node, int depth, int[] visited)
        {
            if (node == null || depth > 28 || visited[0]++ > 3000) return false;
            try {
                var context = node as AccessibleContextNode;
                if (context != null && NormalizeHeader(context.GetInfo().role) == "TABLE") {
                    AccessibleTableInfo table;
                    if (bridge.Functions.GetAccessibleTableInfo(context.JvmId, context.AccessibleContextHandle, out table)
                        && table.columnCount >= 3 && table.rowCount == 0) return true;
                }
                foreach (var child in node.GetChildren()) if (HasEmptyTable(bridge, child, depth + 1, visited)) return true;
            } catch { }
            return false;
        }

        private static bool HasShipmentNotFound(AccessBridge bridge, AccessibleContextNode root)
        {
            const string pattern = @"\bShipment\s+not\s+found\b";
            if (NodeContainsText(root, bridge, pattern, 0, new int[] { 0 })) return true;
            // FIS collapses the actual error text behind its status-bar popup.
            // Only invoke the exact, observed togglePopup action on See errors...
            var bar = FindErrorBar(root, 0, new int[] { 0 });
            if (bar == null) return false;
            AccessibleActions actions;
            if (!bridge.Functions.GetAccessibleActions(bar.JvmId, bar.AccessibleContextHandle, out actions) || actions == null) return false;
            var action = actions.actionInfo.Take(actions.actionsCount).FirstOrDefault(x => x.name == "togglePopup");
            if (action.name != "togglePopup") return false;
            var todo = new AccessibleActionsToDo { actionsCount = 1, actions = new AccessibleActionInfo[32] };
            todo.actions[0] = action;
            int failure;
            if (!bridge.Functions.DoAccessibleActions(bar.JvmId, bar.AccessibleContextHandle, ref todo, out failure) || failure != -1) return false;
            try {
                Thread.Sleep(180);
                return NodeContainsText(root, bridge, pattern, 0, new int[] { 0 });
            } finally {
                bridge.Functions.DoAccessibleActions(bar.JvmId, bar.AccessibleContextHandle, ref todo, out failure);
            }
        }

        private static AccessibleContextNode FindErrorBar(AccessibleNode node, int depth, int[] visited)
        {
            if (node == null || depth > 10 || visited[0]++ > 2500) return null;
            try {
                var context = node as AccessibleContextNode;
                if (context != null) {
                    var info = context.GetInfo();
                    if ((info.name ?? "").Trim() == "See errors..." && NormalizeHeader(info.role) == "COMBOBOX") return context;
                }
                foreach (var child in node.GetChildren()) {
                    var found = FindErrorBar(child, depth + 1, visited);
                    if (found != null) return found;
                }
            } catch { }
            return null;
        }

        private static bool NodeContainsText(AccessibleNode node, AccessBridge bridge, string pattern, int depth, int[] visited)
        {
            if (node == null || depth > 28 || visited[0]++ >= 5000) return false;
            try
            {
                var described = JavaAutomationProbe.DescribeNode(node, bridge, depth);
                if (Regex.IsMatch((described.Name ?? "").Trim(), pattern, RegexOptions.IgnoreCase)
                    || Regex.IsMatch((described.Value ?? "").Trim(), pattern, RegexOptions.IgnoreCase)) return true;
                foreach (var child in node.GetChildren())
                    if (NodeContainsText(child, bridge, pattern, depth + 1, visited)) return true;
            }
            catch { }
            return false;
        }

        private static bool CachedWindowStillActive(AccessBridge bridge)
        {
            try
            {
                var title = cachedBookingWindow.GetTitle() ?? "";
                if (title.IndexOf(cachedBookingNumber, StringComparison.OrdinalIgnoreCase) < 0) return false;
                var info = cachedBookingWindow.GetInfo();
                var states = (info.states_en_US ?? info.states ?? "").ToUpperInvariant();
                return states.Contains("ACTIVE") || states.Contains("FOCUSED") || states.Contains("SELECTED")
                    || SelectedByParent(bridge, cachedBookingWindow, cachedBookingNumber);
            }
            catch { return false; }
        }

        private static S8100WindowCandidate SelectedBookingFromCachedAncestors(AccessBridge bridge)
        {
            if (cachedBookingWindow == null) return null;
            try
            {
                AccessibleNode ancestor = cachedBookingWindow;
                for (var level = 0; ancestor != null && level < 12; level++)
                {
                    var context = ancestor as AccessibleContextNode;
                    if (context != null)
                    {
                        var count = bridge.Functions.GetAccessibleSelectionCountFromContext(context.JvmId, context.AccessibleContextHandle);
                        for (var index = 0; index < count; index++)
                        {
                            var handle = bridge.Functions.GetAccessibleSelectionFromContext(context.JvmId, context.AccessibleContextHandle, index);
                            if (handle.IsNull) continue;
                            AccessibleNode selected = new AccessibleContextNode(bridge, handle);
                            for (var depth = 0; selected != null && depth < 40; depth++)
                            {
                                var match = Regex.Match(selected.GetTitle() ?? "", @"S8100\s+Booking\s+Detail\s*-\s*(\d+)", RegexOptions.IgnoreCase);
                                if (match.Success)
                                    return new S8100WindowCandidate { Node = selected, BookingNumber = match.Groups[1].Value, ActiveScore = 1000 };
                                selected = selected.GetParent();
                            }
                        }
                    }
                    ancestor = ancestor.GetParent();
                }
            }
            catch { }
            return null;
        }

        private static AccessibleContextNode FindRoutingTypeTable(AccessibleNode node, AccessBridge bridge, int depth, int maxDepth, ref int visited, out AccessibleTableInfo matchedInfo)
        {
            matchedInfo = null;
            if (node == null || depth > maxDepth || visited++ >= 6000) return null;
            var context = node as AccessibleContextNode;
            try
            {
                AccessibleTableInfo info;
                if (context != null && string.Equals(context.GetInfo().role, "table", StringComparison.OrdinalIgnoreCase)
                    && bridge.Functions.GetAccessibleTableInfo(context.JvmId, context.AccessibleContextHandle, out info)
                    && info.rowCount >= 2 && info.rowCount <= 20 && info.columnCount >= 1 && info.columnCount <= 4)
                {
                    var values = new List<string>();
                    for (var row = 0; row < info.rowCount; row++)
                        for (var column = 0; column < info.columnCount; column++)
                            values.Add(ReadCellValue(bridge, info, row, column).ToUpperInvariant());
                    if (values.Contains("POL") && (values.Contains("SRT") || values.Contains("POD")))
                    {
                        matchedInfo = info;
                        return context;
                    }
                }
            }
            catch { }
            IEnumerable<AccessibleNode> children;
            try { children = node.GetChildren().ToList(); }
            catch { return null; }
            foreach (var child in children)
            {
                var found = FindRoutingTypeTable(child, bridge, depth + 1, maxDepth, ref visited, out matchedInfo);
                if (found != null) return found;
            }
            return null;
        }

        private static string CanadianRailFromCustomerPlace(string customerPlace)
        {
            var value = (customerPlace ?? "").Trim().ToUpperInvariant();
            if (value.StartsWith("CN", StringComparison.Ordinal)) return "CN Rail";
            if (value.StartsWith("CP", StringComparison.Ordinal)
                || value.StartsWith("SOOLIN", StringComparison.Ordinal)
                || value.StartsWith("IOWAIN", StringComparison.Ordinal)) return "CP Rail";
            return "";
        }

        private static List<EquipmentItem> ReadEquipment(AccessBridge bridge, IntPtr handle, string booking)
        {
            var monitoringItems = ReadMonitoringEquipment(bridge, handle, booking);
            if (monitoringItems.Count > 0) return monitoringItems;

            var items = new List<EquipmentItem>();
            if (!SelectBookingTab(bridge, handle, booking, "Equipment")) return items;
            Thread.Sleep(350);

            var root = bridge.CreateAccessibleWindow(handle);
            if (root == null) return items;
            var bookingWindows = new List<S8100WindowCandidate>();
            FindS8100Windows(bridge, root, 0, 32, new int[] { 0 }, bookingWindows);
            var bookingWindow = bookingWindows.LastOrDefault(x => x.BookingNumber == booking) ?? bookingWindows.LastOrDefault();
            if (bookingWindow == null) return items;

            var tables = new List<TableCandidate>();
            var visited = 0;
            CollectTables(bookingWindow.Node, Point.Empty, 0, 32, 15000, ref visited, tables);
            foreach (var candidate in tables.OrderBy(x => x.Area))
            {
                try
                {
                    AccessibleTableInfo info;
                    if (!bridge.Functions.GetAccessibleTableInfo(candidate.Node.JvmId, candidate.Node.AccessibleContextHandle, out info)
                        || info.rowCount < 1 || info.columnCount < 1 || info.columnCount > 30) continue;
                    var headers = GetColumnNames(bridge, candidate.Node, info, 0);
                    var plannedType = headers.FindIndex(name => NormalizeHeader(name) == "PLANNEDTYPE");
                    if (plannedType < 0) continue;
                    var containerNumber = headers.FindIndex(name => NormalizeHeader(name) == "CONTAINERNO");
                    for (var row = 0; row < info.rowCount; row++)
                    {
                        var type = ReadCellValue(bridge, info, row, plannedType).Trim();
                        var number = containerNumber >= 0 ? ReadCellValue(bridge, info, row, containerNumber).Trim() : "";
                        if (NormalizeHeader(type) == "PLANNEDTYPE" || NormalizeHeader(number) == "CONTAINERNO") continue;
                        if (string.IsNullOrWhiteSpace(type) && string.IsNullOrWhiteSpace(number)) continue;
                        items.Add(new EquipmentItem { ContainerNumber = number, PlannedType = type });
                    }
                }
                catch { }
            }
            return items
                .GroupBy(item => NormalizeHeader(item.ContainerNumber) + "|" + NormalizeHeader(item.PlannedType))
                .Select(group => group.First())
                .ToList();
        }

        private static List<EquipmentItem> ReadMonitoringEquipment(AccessBridge bridge, IntPtr handle, string booking)
        {
            var items = new List<EquipmentItem>();
            var root = bridge.CreateAccessibleWindow(handle);
            if (root == null) return items;
            var windows = new List<AccessibleNode>();
            FindTitledWindows(root, @"S8010\s+Shipment\s+Monitoring\s+List", 0, 32, new int[] { 0 }, windows);
            foreach (var window in windows.AsEnumerable().Reverse())
            {
                var tables = new List<TableCandidate>();
                var visited = 0;
                CollectTables(window, Point.Empty, 0, 32, 30000, ref visited, tables);
                foreach (var candidate in tables.OrderByDescending(x => x.Area))
                {
                    try
                    {
                        AccessibleTableInfo info;
                        if (!bridge.Functions.GetAccessibleTableInfo(candidate.Node.JvmId, candidate.Node.AccessibleContextHandle, out info)
                            || info.rowCount < 1 || info.columnCount < 3 || info.columnCount > 60) continue;
                        var headers = GetColumnNames(bridge, candidate.Node, info, 0);
                        var shipmentColumn = headers.FindIndex(name => NormalizeHeader(name) == "SHIPMENT");
                        var typeColumn = headers.FindIndex(name => NormalizeHeader(name) == "TYPE");
                        var containerColumn = headers.FindIndex(name => NormalizeHeader(name) == "CONTAINERNUMBER");
                        if (shipmentColumn < 0 || typeColumn < 0 || containerColumn < 0) continue;
                        for (var row = 0; row < info.rowCount; row++)
                        {
                            var shipment = NormalizeHeader(ReadCellValue(bridge, info, row, shipmentColumn));
                            if (shipment != NormalizeHeader(booking)) continue;
                            var type = ReadCellValue(bridge, info, row, typeColumn).Trim();
                            var number = ReadCellValue(bridge, info, row, containerColumn).Trim();
                            if (!string.IsNullOrWhiteSpace(type) || !string.IsNullOrWhiteSpace(number))
                                items.Add(new EquipmentItem { ContainerNumber = number, PlannedType = type });
                        }
                    }
                    catch { }
                }
                if (items.Count > 0) break;
            }
            return items
                .GroupBy(item => NormalizeHeader(item.ContainerNumber) + "|" + NormalizeHeader(item.PlannedType))
                .Select(group => group.First())
                .ToList();
        }

        private static void FindTitledWindows(AccessibleNode node, string titlePattern, int depth, int maxDepth, int[] visited, List<AccessibleNode> matches)
        {
            if (node == null || depth > maxDepth || visited[0]++ > 30000) return;
            try
            {
                if (Regex.IsMatch(node.GetTitle() ?? "", titlePattern, RegexOptions.IgnoreCase)) matches.Add(node);
                foreach (var child in node.GetChildren())
                    FindTitledWindows(child, titlePattern, depth + 1, maxDepth, visited, matches);
            }
            catch { }
        }

        private static bool SelectBookingTab(AccessBridge bridge, IntPtr handle, string booking, string tabName)
        {
            var root = bridge.CreateAccessibleWindow(handle);
            if (root == null) return false;
            var bookingWindows = new List<S8100WindowCandidate>();
            FindS8100Windows(bridge, root, 0, 32, new int[] { 0 }, bookingWindows);
            var bookingWindow = bookingWindows.LastOrDefault(x => x.BookingNumber == booking) ?? bookingWindows.LastOrDefault();
            if (bookingWindow == null) return false;
            var tab = FindNamedNode(bookingWindow.Node, tabName, 0, 32, new int[] { 0 });
            if (tab == null) return false;

            // Prefer JTabbedPane's selection interface. Some FIS tabs report a
            // successful generic action without actually changing pages.
            var parent = tab.GetParent() as AccessibleContextNode;
            if (parent != null)
            {
                var children = parent.GetChildren().ToList();
                for (var index = 0; index < children.Count; index++)
                {
                    var child = children[index] as AccessibleContextNode;
                    if (child == null) continue;
                    var info = child.GetInfo();
                    var role = NormalizeHeader(info.role);
                    if (!string.Equals((info.name ?? "").Trim(), tabName, StringComparison.OrdinalIgnoreCase)
                        || (!role.Contains("PAGETAB") && role != "TAB")) continue;
                    bridge.Functions.ClearAccessibleSelectionFromContext(parent.JvmId, parent.AccessibleContextHandle);
                    bridge.Functions.AddAccessibleSelectionFromContext(parent.JvmId, parent.AccessibleContextHandle, index);
                    return true;
                }
            }

            AccessibleActions actions;
            if (bridge.Functions.GetAccessibleActions(tab.JvmId, tab.AccessibleContextHandle, out actions)
                && actions != null && actions.actionsCount > 0)
            {
                var available = actions.actionInfo.Take(actions.actionsCount).Where(x => !string.IsNullOrWhiteSpace(x.name)).ToList();
                var selected = available.FirstOrDefault(x => Regex.IsMatch(x.name, "click|press|select", RegexOptions.IgnoreCase));
                if (string.IsNullOrWhiteSpace(selected.name)) selected = available.FirstOrDefault();
                if (!string.IsNullOrWhiteSpace(selected.name))
                {
                    var todo = new AccessibleActionsToDo { actionsCount = 1, actions = new AccessibleActionInfo[32] };
                    todo.actions[0] = selected;
                    int failure;
                    if (bridge.Functions.DoAccessibleActions(tab.JvmId, tab.AccessibleContextHandle, ref todo, out failure) && failure == -1)
                        return true;
                }
            }

            return false;
        }

        private static AccessibleContextNode FindNamedNode(AccessibleNode node, string wanted, int depth, int maxDepth, int[] visited)
        {
            if (node == null || depth > maxDepth || visited[0]++ > 15000) return null;
            try
            {
                var context = node as AccessibleContextNode;
                if (context != null)
                {
                    var info = context.GetInfo();
                    var role = NormalizeHeader(info.role);
                    if (string.Equals((info.name ?? "").Trim(), wanted, StringComparison.OrdinalIgnoreCase)
                        && (role.Contains("PAGETAB") || role == "TAB")) return context;
                }
                foreach (var child in node.GetChildren())
                {
                    var match = FindNamedNode(child, wanted, depth + 1, maxDepth, visited);
                    if (match != null) return match;
                }
            }
            catch { }
            return null;
        }

        private static bool IsReeferEquipmentType(string value)
        {
            return Regex.IsMatch(NormalizeHeader(value), @"^\d{2}R");
        }

        // S8100 exposes a checked "Temp" status checkbox in the booking header
        // for temperature-controlled bookings. Reading it is much faster than
        // opening and scanning the Equipment tab, so the one-click tool can
        // detect reefers automatically without slowing every dry booking.
        private static bool IsTemperatureStatusChecked(AccessibleNode node)
        {
            return IsTemperatureStatusChecked(node, 0, new int[] { 0 });
        }

        private static bool IsStatusChecked(AccessibleNode node, string namePattern)
        {
            return IsStatusChecked(node, namePattern, 0, new int[] { 0 });
        }

        private static bool IsStatusChecked(AccessibleNode node, string namePattern, int depth, int[] visited)
        {
            if (node == null || depth > 18 || visited[0]++ > 1800) return false;
            try
            {
                var context = node as AccessibleContextNode;
                if (context != null)
                {
                    var info = context.GetInfo();
                    var role = (info.role_en_US ?? info.role ?? "").Trim();
                    var name = (info.name ?? node.GetTitle() ?? "").Trim();
                    var states = (info.states_en_US ?? info.states ?? "").ToUpperInvariant();
                    if (role.IndexOf("CHECK", StringComparison.OrdinalIgnoreCase) >= 0
                        && Regex.IsMatch(name, "^" + namePattern + "$", RegexOptions.IgnoreCase)
                        && Regex.IsMatch(states, @"(?:^|[^A-Z])CHECKED(?:$|[^A-Z])"))
                        return true;
                }
                foreach (var child in node.GetChildren())
                    if (IsStatusChecked(child, namePattern, depth + 1, visited)) return true;
            }
            catch { }
            return false;
        }

        private static bool IsTemperatureStatusChecked(AccessibleNode node, int depth, int[] visited)
        {
            if (node == null || depth > 18 || visited[0]++ > 1800) return false;
            try
            {
                var context = node as AccessibleContextNode;
                if (context != null)
                {
                    var info = context.GetInfo();
                    var role = (info.role_en_US ?? info.role ?? "").Trim();
                    var name = (info.name ?? node.GetTitle() ?? "").Trim();
                    var states = (info.states_en_US ?? info.states ?? "").ToUpperInvariant();
                    if (role.IndexOf("CHECK", StringComparison.OrdinalIgnoreCase) >= 0
                        && Regex.IsMatch(name, @"^TEMP(?:ERATURE)?$", RegexOptions.IgnoreCase)
                        && (states.Contains("CHECKED") || states.Contains("SELECTED")))
                        return true;
                }
                foreach (var child in node.GetChildren())
                    if (IsTemperatureStatusChecked(child, depth + 1, visited)) return true;
            }
            catch { }
            return false;
        }

        private static bool IsRailMot(string value)
        {
            var mot = NormalizeHeader(value);
            return mot == "RA" || mot == "RAIL";
        }

        private static int FindColumn(List<GridCellRow> cells, string title)
        {
            var wanted = NormalizeHeader(title);
            return cells.Where(x => NormalizeHeader(x.ColumnName) == wanted).Select(x => x.Column).FirstOrDefault();
        }

        private static string NormalizeHeader(string value)
        {
            return Regex.Replace(value ?? "", "[^A-Za-z0-9]", "").ToUpperInvariant();
        }

        private sealed class S8100WindowCandidate
        {
            public AccessibleNode Node;
            public string BookingNumber;
            public int ActiveScore;
        }

        private static S8100WindowCandidate PreferredBookingWindow(List<S8100WindowCandidate> matches)
        {
            return matches.OrderByDescending(x => x.ActiveScore).FirstOrDefault();
        }

        private static S8100WindowCandidate ActiveBookingWindow(AccessBridge bridge, AccessibleContextNode root)
        {
            try
            {
                var handle = bridge.Functions.GetActiveDescendent(root.JvmId, root.AccessibleContextHandle);
                if (handle.IsNull) return null;
                AccessibleNode node = new AccessibleContextNode(bridge, handle);
                for (var depth = 0; node != null && depth < 40; depth++)
                {
                    var match = Regex.Match(node.GetTitle() ?? "", @"S8100\s+Booking\s+Detail\s*-\s*(\d+)", RegexOptions.IgnoreCase);
                    if (match.Success)
                        return new S8100WindowCandidate { Node = node, BookingNumber = match.Groups[1].Value, ActiveScore = 1000 };
                    node = node.GetParent();
                }
            }
            catch { }
            return null;
        }

        private static bool ActiveS8100ShipmentIsBlank(AccessBridge bridge, AccessibleContextNode root)
        {
            try
            {
                var handle = bridge.Functions.GetActiveDescendent(root.JvmId, root.AccessibleContextHandle);
                if (handle.IsNull) return false;
                AccessibleNode node = new AccessibleContextNode(bridge, handle);
                for (var depth = 0; node != null && depth < 40; depth++)
                {
                    var title = node.GetTitle() ?? "";
                    if (Regex.IsMatch(title, @"^S8100\s+Booking\s+Detail(?:\s*-\s*)?$", RegexOptions.IgnoreCase))
                        return string.IsNullOrWhiteSpace(FindNamedTextValue(node, bridge, "Shipment", 0, new int[] { 0 }));
                    node = node.GetParent();
                }
            }
            catch { }
            return false;
        }

        private static void FindS8100Windows(AccessBridge bridge, AccessibleNode node, int depth, int maxDepth, int[] visited, List<S8100WindowCandidate> matches, AccessibleContextNode knownParent = null, bool soloScreen = false)
        {
            if (node == null || depth > maxDepth || visited[0]++ > 15000) return;
            try
            {
                if (soloScreen)
                {
                    var scanContext = node as AccessibleContextNode;
                    if (scanContext != null)
                    {
                        var scanInfo = scanContext.GetInfo();
                        var scanRole = NormalizeHeader(scanInfo.role_en_US ?? scanInfo.role);
                        // Window-menu entries repeat booking titles. Only actual
                        // frames can supply this screen's data; unrelated screens
                        // and menu/tree contents do not need a booking scan.
                        if (scanRole == "MENUBAR" || scanRole == "MENU" || scanRole == "TREE" || scanRole == "TABLE") return;
                        if (scanRole == "INTERNALFRAME" && !Regex.IsMatch(scanInfo.name ?? "",
                            @"^S8100\s+Booking\s+Detail\s*-\s*\d+", RegexOptions.IgnoreCase)) return;
                    }
                }
                var match = Regex.Match(node.GetTitle() ?? "", @"S8100\s+Booking\s+Detail\s*-\s*(\d+)", RegexOptions.IgnoreCase);
                if (match.Success)
                {
                    var states = "";
                    var context = node as AccessibleContextNode;
                    if (context != null) states = (context.GetInfo().states_en_US ?? context.GetInfo().states ?? "").ToUpperInvariant();
                    var score = 0;
                    if (states.Contains("ACTIVE")) score += 100;
                    if (states.Contains("FOCUSED")) score += 80;
                    if (states.Contains("SELECTED")) score += 60;
                    if (states.Contains("SHOWING")) score += 10;
                    if (states.Contains("VISIBLE")) score += 5;
                    if (SelectedByParent(bridge, context, match.Groups[1].Value, soloScreen ? knownParent : null)) score += 250;
                    matches.Add(new S8100WindowCandidate { Node = node, BookingNumber = match.Groups[1].Value, ActiveScore = score });
                    return;
                }
                foreach (var child in node.GetChildren())
                    FindS8100Windows(bridge, child, depth + 1, maxDepth, visited, matches, node as AccessibleContextNode, soloScreen);
            }
            catch { }
        }

        private static bool SelectedByParent(AccessBridge bridge, AccessibleContextNode node, string booking, AccessibleContextNode knownParent = null)
        {
            if (node == null) return false;
            try
            {
                var parent = knownParent ?? node.GetParent() as AccessibleContextNode;
                if (parent == null) return false;
                var count = bridge.Functions.GetAccessibleSelectionCountFromContext(parent.JvmId, parent.AccessibleContextHandle);
                for (var index = 0; index < count; index++)
                {
                    var handle = bridge.Functions.GetAccessibleSelectionFromContext(parent.JvmId, parent.AccessibleContextHandle, index);
                    if (handle.IsNull) continue;
                    var selected = new AccessibleContextNode(bridge, handle);
                    var title = selected.GetTitle() ?? "";
                    if (Regex.IsMatch(title, @"S8100\s+Booking\s+Detail\s*-\s*" + Regex.Escape(booking) + @"\b", RegexOptions.IgnoreCase)) return true;
                    if (selected.GetInfo().indexInParent == node.GetInfo().indexInParent) return true;
                }
            }
            catch { }
            return false;
        }

        private static bool ActivateBookingWindow(AccessBridge bridge, AccessibleNode node)
        {
            try
            {
                var context = node as AccessibleContextNode;
                var parent = context == null ? null : context.GetParent() as AccessibleContextNode;
                if (context == null || parent == null) return false;
                var index = context.GetInfo().indexInParent;
                bridge.Functions.ClearAccessibleSelectionFromContext(parent.JvmId, parent.AccessibleContextHandle);
                bridge.Functions.AddAccessibleSelectionFromContext(parent.JvmId, parent.AccessibleContextHandle, index);
                return true;
            }
            catch { return false; }
        }

        private static string ReadCellValue(AccessBridge bridge, AccessibleTableInfo info, int row, int column)
        {
            AccessibleTableCellInfo cellInfo;
            if (!bridge.Functions.GetAccessibleTableCellInfo(info.accessibleTable.JvmId, info.accessibleTable, row, column, out cellInfo)) return "";
            var detail = JavaAutomationProbe.DescribeNode(new AccessibleContextNode(bridge, cellInfo.accessibleContext), bridge, 0);
            return (!string.IsNullOrWhiteSpace(detail.Value) ? detail.Value : detail.Name ?? "").Trim();
        }

        private static string Cell(List<GridCellRow> cells, int row, int column)
        {
            var cell = cells.FirstOrDefault(x => x.Row == row && x.Column == column);
            return cell == null ? "" : cell.Value;
        }

        private static void TrimBlankEdgeColumns(List<GridCellRow> cells)
        {
            if (cells.Count == 0) return;
            var populated = cells.Where(x => !string.IsNullOrWhiteSpace(x.Value)).Select(x => x.Column).ToList();
            if (populated.Count == 0) return;
            var first = populated.Min();
            var last = populated.Max();
            cells.RemoveAll(x => x.Column < first || x.Column > last);
            foreach (var cell in cells) cell.Column -= first - 1;
        }

        private static void ApplyKnownRoutingHeaders(List<GridCellRow> cells)
        {
            var columnCount = cells.Count == 0 ? 0 : cells.Max(x => x.Column);
            if (columnCount != 21) return;
            var firstColumnValues = cells.Where(x => x.Column == 1).Select(x => (x.Value ?? "").ToUpperInvariant()).ToList();
            if (!firstColumnValues.Contains("SRT") || !firstColumnValues.Contains("POL")) return;
            var routingHeaders = new[] {
                "Type", "St", "Locode", "Location Name", "MoT", "DP Voyage", "MoT Service", "Vessel", "Schedule",
                "Relevant Cut Off Date", "Relevant Cut Off Time", "Planned Depart. Date", "Customer Place", "Departure Terminal",
                "Planned Arrival Date", "Arrival Terminal", "Std Locode", "Std Location", "Relevant Pick Up Date",
                "Relevant Pick Up Time", "SMC"
            };
            foreach (var cell in cells)
            {
                if (cell.Column >= 1 && cell.Column <= routingHeaders.Length
                    && (string.IsNullOrWhiteSpace(cell.ColumnName) || cell.ColumnName.StartsWith("Column ", StringComparison.Ordinal)))
                    cell.ColumnName = routingHeaders[cell.Column - 1];
            }
        }

        private sealed class ReadableTable
        {
            public AccessibleContextNode Node;
            public AccessibleTableInfo Info;
            public Rectangle Bounds;
        }

        private static List<ReadableTable> FindRelatedTables(AccessibleNode root, AccessibleContextNode anchor, AccessibleTableInfo anchorInfo, Point point, AccessBridge bridge)
        {
            var candidates = new List<TableCandidate>();
            var visited = 0;
            // Routing tables occur near the top of an S8100 booking subtree.
            // A bounded scan avoids walking thousands of unrelated controls.
            CollectTables(root, point, 0, 32, 5000, ref visited, candidates);
            var anchorNodeInfo = anchor.GetInfo();
            var anchorBounds = new Rectangle(anchorNodeInfo.x, anchorNodeInfo.y, Math.Max(0, anchorNodeInfo.width), Math.Max(0, anchorNodeInfo.height));
            var related = new List<ReadableTable>();
            var routingBodies = new List<ReadableTable>();
            var routingTypes = new List<ReadableTable>();
            var bookingContext = root as AccessibleContextNode;
            var isBookingRoot = bookingContext != null && Regex.IsMatch(bookingContext.GetInfo().name ?? "",
                @"^S8100\s+Booking\s+Detail\b", RegexOptions.IgnoreCase);
            foreach (var candidate in candidates)
            {
                try
                {
                    AccessibleTableInfo info;
                    if (!bridge.Functions.GetAccessibleTableInfo(candidate.Node.JvmId, candidate.Node.AccessibleContextHandle, out info)) continue;
                    var nodeInfo = candidate.Node.GetInfo();
                    var bounds = new Rectangle(nodeInfo.x, nodeInfo.y, Math.Max(0, nodeInfo.width), Math.Max(0, nodeInfo.height));
                    if (info.rowCount != anchorInfo.rowCount || info.columnCount <= 0) continue;
                    // Swing can retain the Routing data while its tab is hidden,
                    // exposing headers and cells but no screen bounds. Join only
                    // uniquely identified Routing sections from this booking.
                    if (isBookingRoot && (anchorBounds.Width <= 0 || anchorBounds.Height <= 0
                        || bounds.Width <= 0 || bounds.Height <= 0))
                    {
                        var headers = GetColumnNames(bridge, candidate.Node, info, 0).Select(NormalizeHeader).ToList();
                        var readable = new ReadableTable { Node = candidate.Node, Info = info, Bounds = bounds };
                        if (info.columnCount == 1 && headers[0] == "TYPE") routingTypes.Add(readable);
                        if (headers.Contains("LOCODE") && headers.Contains("MOT")
                            && headers.Contains("RELEVANTCUTOFFDATE") && headers.Contains("DEPARTURETERMINAL"))
                            routingBodies.Add(readable);
                    }
                    var verticalOverlap = Math.Min(anchorBounds.Bottom, bounds.Bottom) - Math.Max(anchorBounds.Top, bounds.Top);
                    var enoughOverlap = verticalOverlap > 0 && verticalOverlap >= Math.Min(anchorBounds.Height, bounds.Height) / 2;
                    var horizontalGap = bounds.Right < anchorBounds.Left ? anchorBounds.Left - bounds.Right
                        : (anchorBounds.Right < bounds.Left ? bounds.Left - anchorBounds.Right : 0);
                    if (enoughOverlap && horizontalGap <= 100)
                        related.Add(new ReadableTable { Node = candidate.Node, Info = info, Bounds = bounds });
                }
                catch { }
            }
            if (routingTypes.Count == 1 && routingBodies.Count == 1)
                return new List<ReadableTable> { routingTypes[0], routingBodies[0] };
            if (related.Count == 0)
                related.Add(new ReadableTable { Node = anchor, Info = anchorInfo, Bounds = anchorBounds });
            return related.GroupBy(x => x.Bounds.X + ":" + x.Bounds.Y + ":" + x.Info.columnCount)
                .Select(x => x.First()).OrderBy(x => x.Bounds.Left).ToList();
        }

        private static List<string> GetColumnNames(AccessBridge bridge, AccessibleContextNode table, AccessibleTableInfo tableInfo, int columnOffset)
        {
            var names = Enumerable.Range(0, tableInfo.columnCount).Select(column => "Column " + (columnOffset + column + 1)).ToList();
            try
            {
                AccessibleTableInfo headerInfo;
                if (bridge.Functions.GetAccessibleTableColumnHeader(table.JvmId, table.AccessibleContextHandle, out headerInfo)
                    && headerInfo.rowCount > 0 && headerInfo.columnCount > 0)
                {
                    var count = Math.Min(tableInfo.columnCount, headerInfo.columnCount);
                    for (var column = 0; column < count; column++)
                    {
                        var header = ReadCellValue(bridge, headerInfo, 0, column);
                        if (!string.IsNullOrWhiteSpace(header)) names[column] = header.Trim();
                    }
                }
            }
            catch { }
            for (var column = 0; column < names.Count; column++)
            {
                if (!names[column].StartsWith("Column ", StringComparison.Ordinal)) continue;
                names[column] = GetColumnDescription(bridge, table, column, columnOffset + column + 1);
            }
            return names;
        }

        private static string GetColumnDescription(AccessBridge bridge, AccessibleContextNode table, int column, int outputColumn)
        {
            try
            {
                var handle = bridge.Functions.GetAccessibleTableColumnDescription(table.JvmId, table.AccessibleContextHandle, column);
                if (handle != null && !handle.IsNull)
                {
                    var descriptionNode = new AccessibleContextNode(bridge, handle);
                    var detail = JavaAutomationProbe.DescribeNode(descriptionNode, bridge, 0);
                    var name = !string.IsNullOrWhiteSpace(detail.Value) ? detail.Value : detail.Name;
                    if (!string.IsNullOrWhiteSpace(name)) return name.Trim();
                }
            }
            catch { }
            return "Column " + outputColumn;
        }

        private static bool IsTable(AccessibleContextNode node)
        {
            try { return string.Equals(node.GetInfo().role, "table", StringComparison.OrdinalIgnoreCase); }
            catch { return false; }
        }

        private sealed class TableCandidate
        {
            public AccessibleContextNode Node;
            public bool Contains;
            public long Distance;
            public long Area;
        }

        private static AccessibleContextNode FindNearestReadableTable(AccessibleNode root, Point point, AccessBridge bridge, out AccessibleTableInfo tableInfo)
        {
            var candidates = new List<TableCandidate>();
            var visited = 0;
            CollectTables(root, point, 0, 32, 15000, ref visited, candidates);
            foreach (var candidate in candidates.OrderByDescending(x => x.Contains).ThenBy(x => x.Distance).ThenBy(x => x.Area))
            {
                AccessibleTableInfo info;
                try
                {
                    if (bridge.Functions.GetAccessibleTableInfo(candidate.Node.JvmId, candidate.Node.AccessibleContextHandle, out info)
                        && info.rowCount > 0 && info.columnCount > 0)
                    {
                        tableInfo = info;
                        return candidate.Node;
                    }
                }
                catch { }
            }
            tableInfo = null;
            return null;
        }

        private static void CollectTables(AccessibleNode node, Point point, int depth, int maxDepth, int maxNodes, ref int visited, List<TableCandidate> candidates)
        {
            if (node == null || depth > maxDepth || visited >= maxNodes) return;
            visited++;
            var context = node as AccessibleContextNode;
            try
            {
                if (context != null)
                {
                    var info = context.GetInfo();
                    if (string.Equals(info.role, "table", StringComparison.OrdinalIgnoreCase))
                    {
                        var rect = new Rectangle(info.x, info.y, Math.Max(0, info.width), Math.Max(0, info.height));
                        var dx = point.X < rect.Left ? rect.Left - point.X : (point.X > rect.Right ? point.X - rect.Right : 0);
                        var dy = point.Y < rect.Top ? rect.Top - point.Y : (point.Y > rect.Bottom ? point.Y - rect.Bottom : 0);
                        candidates.Add(new TableCandidate {
                            Node = context,
                            Contains = rect.Width > 0 && rect.Height > 0 && rect.Contains(point),
                            Distance = (long)dx * dx + (long)dy * dy,
                            Area = (long)rect.Width * rect.Height
                        });
                    }
                }
            }
            catch { }
            IEnumerable<AccessibleNode> children;
            try { children = node.GetChildren().ToList(); }
            catch { return; }
            foreach (var child in children)
            {
                if (visited >= maxNodes) break;
                try
                {
                    CollectTables(child, point, depth + 1, maxDepth, maxNodes, ref visited, candidates);
                }
                catch { }
            }
        }

        public static string ToTsv(List<GridCellRow> cells)
        {
            if (cells == null || cells.Count == 0) return "";
            var columns = cells.Select(x => x.Column).Distinct().OrderBy(x => x).ToList();
            var header = columns.Select(column => {
                var name = cells.Where(x => x.Column == column).Select(x => x.ColumnName).FirstOrDefault(x => !string.IsNullOrWhiteSpace(x));
                return Clean(name ?? ("Column " + column));
            });
            var text = new StringBuilder();
            text.AppendLine(string.Join("\t", header));
            foreach (var row in cells.Select(x => x.Row).Distinct().OrderBy(x => x))
            {
                var values = columns.Select(column => {
                    var cell = cells.FirstOrDefault(x => x.Row == row && x.Column == column);
                    return Clean(cell == null ? "" : cell.Value);
                });
                text.AppendLine(string.Join("\t", values));
            }
            return text.ToString();
        }

        private static string Clean(string value)
        {
            return (value ?? "").Replace("\r", " ").Replace("\n", " ").Replace("\t", " ").Trim();
        }
    }

    internal sealed class LocalErdServer : IDisposable
    {
        private readonly int port;
        private readonly Func<bool, Task<S8100Summary>> reader;
        private readonly Func<bool, Task<S8100Summary>> soloReader;
        private readonly Func<string, Task> clipboardWriter;
        private readonly Func<Task<List<ProbeRow>>> controlMapper;
        private readonly Func<string, Task<string>> bookingOpener;
        private readonly Func<string, Task<string>> bookingCloser;
        private readonly Func<Task<string>> allWindowsCloser;
        private TcpListener listener;
        private Thread worker;
        private volatile bool running;

        public LocalErdServer(int port, Func<bool, Task<S8100Summary>> reader, Func<string, Task> clipboardWriter, Func<Task<List<ProbeRow>>> controlMapper, Func<string, Task<string>> bookingOpener, Func<string, Task<string>> bookingCloser, Func<Task<string>> allWindowsCloser, Func<bool, Task<S8100Summary>> soloReader = null)
        {
            this.port = port;
            this.reader = reader;
            this.soloReader = soloReader;
            this.clipboardWriter = clipboardWriter;
            this.controlMapper = controlMapper;
            this.bookingOpener = bookingOpener;
            this.bookingCloser = bookingCloser;
            this.allWindowsCloser = allWindowsCloser;
        }

        public void Start()
        {
            listener = new TcpListener(IPAddress.Loopback, port);
            listener.Start();
            running = true;
            worker = new Thread(Listen) { IsBackground = true, Name = "ERD Local Web Bridge" };
            worker.Start();
        }

        private void Listen()
        {
            while (running)
            {
                try
                {
                    using (var client = listener.AcceptTcpClient()) Handle(client);
                }
                catch { if (!running) return; }
            }
        }

        private void Handle(TcpClient client)
        {
            var stream = client.GetStream();
            var buffer = new byte[8192];
            var count = stream.Read(buffer, 0, buffer.Length);
            var request = count > 0 ? Encoding.UTF8.GetString(buffer, 0, count) : "";
            var firstLine = request.Split(new[] { "\r\n" }, StringSplitOptions.None).FirstOrDefault() ?? "";
            var isOptions = firstLine.StartsWith("OPTIONS ", StringComparison.OrdinalIgnoreCase);
            if (isOptions) { WriteResponse(stream, 204, ""); return; }
            if (firstLine.StartsWith("POST /erd-clipboard", StringComparison.OrdinalIgnoreCase))
            {
                var origin = Header(request, "Origin");
                if (!AllowedOrigin(origin))
                {
                    WriteResponse(stream, 403, "{\"ok\":false,\"error\":\"Clipboard request origin was not allowed.\"}");
                    return;
                }
                var divider = request.IndexOf("\r\n\r\n", StringComparison.Ordinal);
                var body = divider >= 0 ? request.Substring(divider + 4) : "";
                if (body.Length == 0 || body.Length > 10000)
                {
                    WriteResponse(stream, 422, "{\"ok\":false,\"error\":\"Clipboard text was empty or too large.\"}");
                    return;
                }
                try
                {
                    clipboardWriter(body).GetAwaiter().GetResult();
                    WriteResponse(stream, 200, "{\"ok\":true}");
                }
                catch (Exception error) { WriteResponse(stream, 422, "{\"ok\":false,\"error\":" + Q(error.Message) + "}"); }
                return;
            }
            if (firstLine.StartsWith("GET /fis-control-map", StringComparison.OrdinalIgnoreCase))
            {
                try
                {
                    var rows = controlMapper().GetAwaiter().GetResult();
                    var serializer = new System.Web.Script.Serialization.JavaScriptSerializer { MaxJsonLength = int.MaxValue };
                    WriteResponse(stream, 200, serializer.Serialize(rows));
                }
                catch (Exception error) { WriteResponse(stream, 422, "{\"ok\":false,\"error\":" + Q(error.Message) + "}"); }
                return;
            }
            if (firstLine.StartsWith("GET /fis-open-booking", StringComparison.OrdinalIgnoreCase))
            {
                try
                {
                    var match = Regex.Match(firstLine, @"[?&]booking=(\d{6,12})", RegexOptions.IgnoreCase);
                    if (!match.Success) throw new ApplicationException("A booking number is required.");
                    var booking = bookingOpener(match.Groups[1].Value).GetAwaiter().GetResult();
                    WriteResponse(stream, 200, "{\"ok\":true,\"booking\":" + Q(booking) + "}");
                }
                catch (Exception error) { WriteResponse(stream, 422, "{\"ok\":false,\"error\":" + Q(error.Message) + "}"); }
                return;
            }
            if (firstLine.StartsWith("GET /fis-close-booking", StringComparison.OrdinalIgnoreCase))
            {
                try
                {
                    var match = Regex.Match(firstLine, @"[?&]shipment=(\d{6,12})", RegexOptions.IgnoreCase);
                    if (!match.Success) throw new ApplicationException("A shipment number is required.");
                    var shipment = bookingCloser(match.Groups[1].Value).GetAwaiter().GetResult();
                    WriteResponse(stream, 200, "{\"ok\":true,\"shipment\":" + Q(shipment) + "}");
                }
                catch (Exception error) { WriteResponse(stream, 422, "{\"ok\":false,\"error\":" + Q(error.Message) + "}"); }
                return;
            }
            if (firstLine.StartsWith("GET /fis-close-all", StringComparison.OrdinalIgnoreCase))
            {
                try
                {
                    var result = allWindowsCloser().GetAwaiter().GetResult();
                    WriteResponse(stream, 200, "{\"ok\":true,\"result\":" + Q(result) + "}");
                }
                catch (Exception error) { WriteResponse(stream, 422, "{\"ok\":false,\"error\":" + Q(error.Message) + "}"); }
                return;
            }
            if (!firstLine.StartsWith("GET /s8100-summary", StringComparison.OrdinalIgnoreCase))
            {
                WriteResponse(stream, 404, "{\"ok\":false,\"error\":\"Unknown local bridge route.\"}");
                return;
            }
            try
            {
                var readEquipment = firstLine.IndexOf("equipment=skip", StringComparison.OrdinalIgnoreCase) < 0;
                var useSoloReader = firstLine.IndexOf("solo=1", StringComparison.OrdinalIgnoreCase) >= 0 && soloReader != null;
                var data = (useSoloReader ? soloReader : reader)(readEquipment).GetAwaiter().GetResult();
                var json = "{\"ok\":true,\"bookingNumber\":" + Q(data.BookingNumber)
                    + ",\"shipmentNumber\":" + Q(data.ShipmentNumber)
                    + ",\"startLocode\":" + Q(data.StartLocode) + ",\"startCity\":" + Q(data.StartCity)
                    + ",\"polLocode\":" + Q(data.PolLocode) + ",\"polCity\":" + Q(data.PolCity)
                    + ",\"motService\":" + Q(data.MotService) + ",\"voyage\":" + Q(data.Voyage) + ",\"dpVoyage\":" + Q(data.DpVoyage) + ",\"vessel\":" + Q(data.Vessel)
                    + ",\"relevantCutoffDate\":" + Q(data.RelevantCutoffDate)
                    + ",\"relevantCutoffTime\":" + Q(data.RelevantCutoffTime)
                    + ",\"departureTerminal\":" + Q(data.DepartureTerminal)
                    + ",\"customerPlace\":" + Q(data.CustomerPlace)
                    + ",\"customerPlaces\":[" + string.Join(",", (data.CustomerPlaces ?? new List<string>()).Select(Q)) + "]"
                    + ",\"canadianRail\":" + Q(data.CanadianRail)
                    + ",\"equipmentType\":" + Q(data.EquipmentType)
                    + ",\"isReefer\":" + (data.IsReefer ? "true" : "false")
                    + ",\"isCanceled\":" + (data.IsCanceled ? "true" : "false")
                    + ",\"isDangerousGoods\":" + (data.IsDangerousGoods ? "true" : "false")
                    + ",\"isLgbRestricted\":" + (data.IsLgbRestricted ? "true" : "false")
                    + ",\"isHapagl11\":" + (data.IsHapagl11 ? "true" : "false")
                    + ",\"equipment\":[" + string.Join(",", (data.Equipment ?? new List<EquipmentItem>()).Select(item =>
                        "{\"containerNumber\":" + Q(item.ContainerNumber) + ",\"plannedType\":" + Q(item.PlannedType) + "}")) + "]}";
                WriteResponse(stream, 200, json);
            }
            catch (Exception error)
            {
                WriteResponse(stream, 422, "{\"ok\":false,\"error\":" + Q(error.Message) + "}");
            }
        }

        private static string Header(string request, string name)
        {
            foreach (var line in request.Split(new[] { "\r\n" }, StringSplitOptions.None))
                if (line.StartsWith(name + ":", StringComparison.OrdinalIgnoreCase)) return line.Substring(name.Length + 1).Trim();
            return "";
        }

        private static bool AllowedOrigin(string origin)
        {
            if (string.IsNullOrEmpty(origin) || origin.Equals("null", StringComparison.OrdinalIgnoreCase)) return true;
            Uri uri;
            if (!Uri.TryCreate(origin, UriKind.Absolute, out uri)) return false;
            return uri.Host.Equals("127.0.0.1", StringComparison.OrdinalIgnoreCase)
                || uri.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase)
                || uri.Host.Equals("webguide.hapagidt.com", StringComparison.OrdinalIgnoreCase)
                || uri.Host.Equals("hapagidt.com", StringComparison.OrdinalIgnoreCase);
        }

        private static string Q(string value)
        {
            var escaped = (value ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"")
                .Replace("\r", "\\r").Replace("\n", "\\n");
            return "\"" + escaped + "\"";
        }

        private static void WriteResponse(NetworkStream stream, int code, string body)
        {
            var bytes = Encoding.UTF8.GetBytes(body ?? "");
            var reason = code == 200 ? "OK" : (code == 204 ? "No Content" : (code == 403 ? "Forbidden" : (code == 404 ? "Not Found" : "Unprocessable Entity")));
            var header = "HTTP/1.1 " + code + " " + reason + "\r\n"
                + "Content-Type: application/json; charset=utf-8\r\n"
                + "Access-Control-Allow-Origin: *\r\n"
                + "Access-Control-Allow-Methods: GET, OPTIONS\r\n"
                + "Access-Control-Allow-Headers: Content-Type\r\n"
                + "Access-Control-Allow-Private-Network: true\r\n"
                + "Cache-Control: no-store\r\nConnection: close\r\nContent-Length: " + bytes.Length + "\r\n\r\n";
            var headerBytes = Encoding.ASCII.GetBytes(header);
            stream.Write(headerBytes, 0, headerBytes.Length);
            if (bytes.Length > 0) stream.Write(bytes, 0, bytes.Length);
        }

        public void Dispose()
        {
            running = false;
            try { listener.Stop(); } catch { }
        }
    }

    internal static class NativeWindows
    {
        private delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);
        [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
        [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hwnd);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int count);
        [DllImport("user32.dll")] private static extern int GetWindowTextLength(IntPtr hwnd);
        [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] public static extern bool SetDllDirectory(string path);
        [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
        [DllImport("user32.dll")] private static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);
        [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr hwnd);
        [DllImport("user32.dll")] private static extern bool ShowWindowAsync(IntPtr hwnd, int command);
        [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();

        public static void LeftClick()
        {
            mouse_event(0x0002, 0, 0, 0, UIntPtr.Zero);
            mouse_event(0x0004, 0, 0, 0, UIntPtr.Zero);
        }

        public static bool RestoreWindow(IntPtr hwnd)
        {
            if (!IsIconic(hwnd)) return false;
            ShowWindowAsync(hwnd, 9); // SW_RESTORE
            return true;
        }

        public static bool ForegroundBelongsToProcess(int expectedProcessId)
        {
            uint actualProcessId;
            GetWindowThreadProcessId(GetForegroundWindow(), out actualProcessId);
            return actualProcessId == (uint)expectedProcessId;
        }

        public static bool ForegroundIsWebBrowser()
        {
            try
            {
                uint processId;
                GetWindowThreadProcessId(GetForegroundWindow(), out processId);
                var name = Process.GetProcessById((int)processId).ProcessName ?? "";
                return Regex.IsMatch(name, "^(?:msedge|chrome|firefox|iexplore)$", RegexOptions.IgnoreCase);
            }
            catch { return false; }
        }

        public static string GetProcessFolder(int processId)
        {
            try { return Path.GetDirectoryName(Process.GetProcessById(processId).MainModule.FileName); }
            catch { return string.Empty; }
        }

        public static List<WindowChoice> ListVisibleWindows()
        {
            var windows = new List<WindowChoice>();
            EnumWindows(delegate(IntPtr hwnd, IntPtr ignored) {
                if (!IsWindowVisible(hwnd)) return true;
                var length = GetWindowTextLength(hwnd);
                if (length == 0) return true;
                var title = new StringBuilder(length + 1);
                GetWindowText(hwnd, title, title.Capacity);
                uint processId;
                GetWindowThreadProcessId(hwnd, out processId);
                var processName = "unknown";
                try { processName = Process.GetProcessById((int)processId).ProcessName; } catch { }
                windows.Add(new WindowChoice { Handle = hwnd, Title = title.ToString(), ProcessName = processName, ProcessId = (int)processId });
                return true;
            }, IntPtr.Zero);
            windows.Sort((a, b) => string.Compare(a.Title, b.Title, StringComparison.CurrentCultureIgnoreCase));
            return windows;
        }
    }
}
