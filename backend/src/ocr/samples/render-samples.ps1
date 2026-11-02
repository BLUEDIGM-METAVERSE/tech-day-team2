# Renders samples.json into fake receipt JPGs. Windows PowerShell only (System.Drawing). ASCII only: PS 5.1 reads BOM-less scripts as ANSI.
Add-Type -AssemblyName System.Drawing
$dir = $PSScriptRoot
$samples = Get-Content -Raw -Encoding UTF8 (Join-Path $dir 'samples.json') | ConvertFrom-Json
$jpeg = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$quality = New-Object System.Drawing.Imaging.EncoderParameters 1
$quality.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality, [long]85)

function Field($obj, $name) { if ($obj.PSObject.Properties[$name]) { $obj.$name } else { $null } }

foreach ($s in $samples) {
  $fx = $s.effects
  $random = New-Object System.Random ([int]$s.id) # fixed seed: same output every run
  $base = if (Field $s 'size') { [int]$s.size } else { 20 }
  $pad = 36; $width = 560
  $height = $pad * 2
  foreach ($l in $s.lines) { $size = if (Field $l 's') { [int]$l.s } else { $base }; $height += [int]($size * 1.65) }

  $paper = New-Object System.Drawing.Bitmap $width, $height
  $g = [System.Drawing.Graphics]::FromImage($paper)
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
  $faded = Field $fx 'faded'
  $screen = Field $fx 'screen' # app capture: pure white, no table around it
  $g.Clear($(if ($screen) { [System.Drawing.Color]::White } elseif ($faded) { [System.Drawing.Color]::FromArgb(226, 218, 200) } else { [System.Drawing.Color]::FromArgb(250, 248, 242) }))
  $ink = if ($faded) { [System.Drawing.Color]::FromArgb(128, 122, 112) } else { [System.Drawing.Color]::FromArgb(28, 28, 28) }
  $brush = New-Object System.Drawing.SolidBrush $ink
  $pen = New-Object System.Drawing.Pen $ink, 1
  $left = New-Object System.Drawing.StringFormat
  $center = New-Object System.Drawing.StringFormat; $center.Alignment = [System.Drawing.StringAlignment]::Center
  $right = New-Object System.Drawing.StringFormat; $right.Alignment = [System.Drawing.StringAlignment]::Far

  $y = $pad
  foreach ($l in $s.lines) {
    $size = if (Field $l 's') { [int]$l.s } else { $base }
    $step = [int]($size * 1.65)
    if (Field $l 'hr') {
      $pen.DashStyle = [System.Drawing.Drawing2D.DashStyle]::Dash
      $g.DrawLine($pen, $pad, $y + [int]($step / 2), $width - $pad, $y + [int]($step / 2))
    } else {
      $style = if (Field $l 'b') { [System.Drawing.FontStyle]::Bold } else { [System.Drawing.FontStyle]::Regular }
      $font = New-Object System.Drawing.Font ([string]$s.font), ([single]$size), $style, ([System.Drawing.GraphicsUnit]::Pixel)
      $text = Field $l 't'
      if ($null -ne $text) {
        switch (Field $l 'a') {
          'left'  { $g.DrawString($text, $font, $brush, [single]$pad, [single]$y, $left) }
          'right' { $g.DrawString($text, $font, $brush, [single]($width - $pad), [single]$y, $right) }
          default { $g.DrawString($text, $font, $brush, [single]($width / 2), [single]$y, $center) }
        }
      } else {
        $g.DrawString($l.l, $font, $brush, [single]$pad, [single]$y, $left)
        $g.DrawString($l.r, $font, $brush, [single]($width - $pad), [single]$y, $right)
      }
      $font.Dispose()
    }
    $y += $step
  }

  $noise = Field $fx 'noise'
  if ($noise) {
    for ($i = 0; $i -lt [int]$noise; $i++) {
      $shade = $random.Next(90, 200)
      $dot = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb($random.Next(60, 180), $shade, $shade, $shade))
      $g.FillRectangle($dot, $random.Next($width), $random.Next($height), $random.Next(1, 3), $random.Next(1, 3))
      $dot.Dispose()
    }
  }
  $g.Dispose()

  # Place the paper on a darker "table" like a phone photo, rotated around its center.
  $margin = if ($screen) { 0 } else { 90 }
  $photo = New-Object System.Drawing.Bitmap ($width + $margin * 2), ($height + $margin * 2)
  $p = [System.Drawing.Graphics]::FromImage($photo)
  $p.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $p.Clear([System.Drawing.Color]::FromArgb(92, 88, 84))
  $angle = Field $fx 'rotate'
  if ($angle) {
    $p.TranslateTransform($photo.Width / 2, $photo.Height / 2)
    $p.RotateTransform([single]$angle)
    $p.TranslateTransform(-$photo.Width / 2, -$photo.Height / 2)
  }
  $p.DrawImage($paper, $margin, $margin)
  $p.Dispose(); $paper.Dispose()

  $amount = Field $fx 'blur'
  if ($amount) {
    # Shrink then enlarge: cheap blur without per-pixel loops.
    $small = New-Object System.Drawing.Bitmap ([int]($photo.Width / $amount)), ([int]($photo.Height / $amount))
    $a = [System.Drawing.Graphics]::FromImage($small)
    $a.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBilinear
    $a.DrawImage($photo, 0, 0, $small.Width, $small.Height); $a.Dispose()
    $b = [System.Drawing.Graphics]::FromImage($photo)
    $b.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $b.DrawImage($small, 0, 0, $photo.Width, $photo.Height); $b.Dispose()
    $small.Dispose()
  }

  # Same limit as the app: long side at most 1600px.
  $ratio = [Math]::Min(1, 1600 / [Math]::Max($photo.Width, $photo.Height))
  $final = New-Object System.Drawing.Bitmap ([int]($photo.Width * $ratio)), ([int]($photo.Height * $ratio))
  $f = [System.Drawing.Graphics]::FromImage($final)
  $f.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $f.DrawImage($photo, 0, 0, $final.Width, $final.Height); $f.Dispose(); $photo.Dispose()
  $final.Save((Join-Path $dir "receipt-$($s.id).jpg"), $jpeg, $quality)
  $final.Dispose(); $brush.Dispose(); $pen.Dispose()
  "receipt-$($s.id).jpg"
}
