# PowerShell Script to Create Chrome Extension Icons
# Requires ImageMagick or similar image processing tool

param(
    [string]$SourceImage = "extension/icons/app-icon-source.png",
    [string]$OutputDir = "extension/icons"
)

# Check if ImageMagick is available
$magickPath = Get-Command magick -ErrorAction SilentlyContinue

if ($magickPath) {
    Write-Host "Creating Chrome extension icons using ImageMagick..."
    
    # Create 16x16 icon
    & magick $SourceImage -resize 16x16 "$OutputDir/icon16.png"
    Write-Host "Created icon16.png (16x16)"
    
    # Create 48x48 icon  
    & magick $SourceImage -resize 48x48 "$OutputDir/icon48.png"
    Write-Host "Created icon48.png (48x48)"
    
    # Create 128x128 icon
    & magick $SourceImage -resize 128x128 "$OutputDir/icon128.png"
    Write-Host "Created icon128.png (128x128)"
    
    Write-Host "All icons created successfully!"
    
} else {
    Write-Host "ImageMagick not found. Please use one of these alternatives:"
    Write-Host ""
    Write-Host "1. Online Tools:"
    Write-Host "   - https://www.icoconverter.com/"
    Write-Host "   - https://convertio.co/png-ico/"
    Write-Host "   - https://chrome-extension-icon-generator.vercel.app/"
    Write-Host ""
    Write-Host "2. Install ImageMagick:"
    Write-Host "   - Download from: https://imagemagick.org/script/download.php"
    Write-Host "   - Or use: winget install ImageMagick.ImageMagick"
    Write-Host ""
    Write-Host "3. Use GIMP (Free):"
    Write-Host "   - Open source image"
    Write-Host "   - Image → Scale Image"
    Write-Host "   - Set to 16x16, 48x48, 128x128"
    Write-Host "   - Export as PNG"
}

# Show current icon sizes
Write-Host ""
Write-Host "Current icon files:"
Get-ChildItem "$OutputDir/icon*.png" | Format-Table Name, Length -AutoSize
