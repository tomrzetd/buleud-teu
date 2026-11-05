# Buleud Teu Desktop - pemindaian WIA (Windows Image Acquisition) dengan Automatic Document Feeder.
# Memakai WIA Automation (wiaaut.dll) bawaan Windows 10/11 -> driver resmi Canon / Epson / Brother.
# Keluaran baris per baris (dibaca aplikasi):
#   DEV <tab> id <tab> nama <tab> feeder(0/1) <tab> duplex(0/1)
#   PAGE <tab> path            (satu lembar selesai)
#   WARN <tab> pesan
#   ERR <tab> pesan
#   DONE <tab> jumlah
param(
    [switch]$List,
    [string]$Device = "",
    [string]$Out = "",
    [int]$Dpi = 200,
    [string]$Source = "feeder",     # feeder | flatbed
    [switch]$Duplex,
    [switch]$Gray,
    [double]$WidthMm = 215,
    [double]$HeightMm = 330
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
function Emit([string]$line) { [Console]::Out.WriteLine($line); [Console]::Out.Flush() }

# konstanta WIA
$DOC_HANDLING_CAPS = 3086; $DOC_HANDLING_STATUS = 3087; $DOC_HANDLING_SELECT = 3088; $PAGES = 3096
$FEEDER = 1; $FLATBED = 2; $DUPLEX = 4; $FEED_READY = 1
$INTENT = 6146; $XRES = 6147; $YRES = 6148; $XPOS = 6149; $YPOS = 6150; $XEXT = 6151; $YEXT = 6152
$PAPER_EMPTY = 0x80210003; $PAPER_JAM = 0x80210002; $PAPER_PROBLEM = 0x80210004; $BUSY = 0x80210006; $OFFLINE = 0x80210005
$FMT_PNG = '{B96B3CAF-0728-11D3-9D7B-0000F81EF32E}'; $FMT_BMP = '{B96B3CAB-0728-11D3-9D7B-0000F81EF32E}'

function Prop($props, [int]$id) { foreach ($p in $props) { if ($p.PropertyID -eq $id) { return $p } }; return $null }
function Val($props, [int]$id, $def) { $p = Prop $props $id; if ($p -eq $null) { return $def }; try { return $p.Value } catch { return $def } }
function SetP($props, [int]$id, $v, [string]$what) {
    $p = Prop $props $id
    if ($p -eq $null) { return $false }
    try {
        if ($p.SubType -eq 1 -and $v -is [int]) { $v = [Math]::Max($p.SubTypeMin, [Math]::Min($p.SubTypeMax, $v)) }   # rentang
        $p.Value = $v; return $true
    } catch { if ($what) { Emit "WARN`t$what tidak didukung driver" }; return $false }
}
# kode galat WIA (0x8021xxxx) dari rantai exception COM; nilai Int32 bertanda, sama dengan literal hex PowerShell
function HResult($e) {
    $x = $e
    while ($x -ne $null) { if ((($x.HResult -shr 16) -band 0xFFFF) -eq 0x8021) { return $x.HResult }; $x = $x.InnerException }
    return 0
}
function PropOf($obj, [string]$name, $def) { try { $v = $obj.Properties.Item($name).Value; if ($v -eq $null) { return $def }; return $v } catch { return $def } }

try { $dm = New-Object -ComObject WIA.DeviceManager } catch { Emit "ERR`tLayanan WIA tidak tersedia di Windows ini."; exit 2 }

if ($List) {
    foreach ($d in $dm.DeviceInfos) {
        if ($d.Type -ne 1) { continue }           # 1 = scanner
        $name = PropOf $d 'Name' $d.DeviceID
        $caps = 0
        try { $dev = $d.Connect(); $caps = [int](Val $dev.Properties $DOC_HANDLING_CAPS 0) } catch {}
        Emit "DEV`t$($d.DeviceID)`t$name`t$([int](($caps -band $FEEDER) -ne 0))`t$([int](($caps -band $DUPLEX) -ne 0))"
    }
    exit 0
}

$info = $null
foreach ($d in $dm.DeviceInfos) { if ($d.Type -eq 1 -and ($Device -eq '' -or $d.DeviceID -eq $Device)) { $info = $d; break } }
if ($info -eq $null) { Emit "ERR`tScanner tidak ditemukan. Pastikan scanner menyala, kabel USB/jaringan terhubung, dan driver WIA terpasang."; exit 2 }
try { $dev = $info.Connect() } catch { Emit "ERR`tTidak bisa terhubung ke scanner (sedang dipakai aplikasi lain?)."; exit 2 }
if (-not (Test-Path $Out)) { New-Item -ItemType Directory -Path $Out | Out-Null }

$useFeeder = $Source -eq 'feeder'
if ($useFeeder) {
    $caps = [int](Val $dev.Properties $DOC_HANDLING_CAPS 0)
    if ($caps -ne 0 -and ($caps -band $FEEDER) -eq 0) { Emit "WARN`tScanner ini tidak melaporkan ADF; mencoba tetap memakai feeder." }
    $sel = $FEEDER; if ($Duplex) { $sel = $FEEDER -bor $DUPLEX }
    [void](SetP $dev.Properties $DOC_HANDLING_SELECT $sel "Pilihan feeder/duplex")
    [void](SetP $dev.Properties $PAGES 0 $null)      # 0 = semua lembar di feeder
    $st = [int](Val $dev.Properties $DOC_HANDLING_STATUS $FEED_READY)
    if (($st -band $FEED_READY) -eq 0) { Emit "ERR`tFeeder (ADF) kosong. Masukkan tumpukan LJK lalu ulangi."; exit 3 }
} else { [void](SetP $dev.Properties $DOC_HANDLING_SELECT $FLATBED $null) }

# item gambar: pilih item 'Feeder' bila driver WIA 2.0 memisahkannya
$item = $dev.Items.Item(1)
if ($useFeeder -and $dev.Items.Count -gt 1) {
    foreach ($it in $dev.Items) { $nm = [string](PropOf $it 'Item Name' ''); if ($nm -match 'Feeder|ADF|Document') { $item = $it; break } }
}
$ip = $item.Properties
[void](SetP $ip $INTENT ($(if ($Gray) { 2 } else { 1 })) "Mode warna")    # 1 warna, 2 abu-abu (atur DULU: mengubah resolusi bawaan)
[void](SetP $ip $XRES $Dpi "Resolusi $Dpi dpi"); [void](SetP $ip $YRES $Dpi $null)
[void](SetP $ip $XPOS 0 $null); [void](SetP $ip $YPOS 0 $null)
[void](SetP $ip $XEXT ([int][Math]::Round($WidthMm / 25.4 * $Dpi)) $null)
[void](SetP $ip $YEXT ([int][Math]::Round($HeightMm / 25.4 * $Dpi)) "Panjang kertas F4 (330 mm)")

$n = 0; $fmt = $FMT_PNG
while ($true) {
    $img = $null
    try { $img = $item.Transfer($fmt) }
    catch {
        $hr = HResult $_.Exception
        if ($hr -eq $PAPER_EMPTY) { if ($n -eq 0) { Emit "ERR`tFeeder (ADF) kosong. Masukkan tumpukan LJK lalu ulangi."; exit 3 }; break }
        if ($fmt -eq $FMT_PNG -and $n -eq 0 -and $hr -ne $PAPER_JAM) { $fmt = $FMT_BMP; continue }   # driver tanpa PNG -> BMP
        if ($hr -eq $PAPER_JAM) { Emit "ERR`tKertas macet di ADF setelah $n lembar. Rapikan kertas lalu lanjutkan scan."; exit 4 }
        if ($hr -eq $PAPER_PROBLEM) { Emit "ERR`tMasalah kertas di ADF setelah $n lembar."; exit 4 }
        if ($hr -eq $BUSY -or $hr -eq $OFFLINE) { Emit "ERR`tScanner sibuk / offline."; exit 4 }
        if ($n -gt 0) { break }                        # beberapa driver melempar galat umum saat feeder habis
        Emit "ERR`t$($_.Exception.Message)"; exit 4
    }
    $n++
    $ext = 'png'; try { if ($img.FileExtension) { $ext = $img.FileExtension } } catch {}
    $f = Join-Path $Out ('hal_{0:D4}.{1}' -f $n, $ext)
    if (Test-Path $f) { Remove-Item $f -Force }
    $img.SaveFile($f)
    Emit "PAGE`t$f"
    if (-not $useFeeder) { break }
    $st = [int](Val $dev.Properties $DOC_HANDLING_STATUS $FEED_READY)
    if (($st -band $FEED_READY) -eq 0) { break }
}
Emit "DONE`t$n"
