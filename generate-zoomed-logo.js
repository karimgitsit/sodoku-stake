#!/usr/bin/env node
/**
 * Script to generate a zoomed-in version of the app icon for World Coin app store.
 * Zooms in by 7.5% (middle of 5-10% range) to remove edge borders.
 */

const fs = require('fs');
const path = require('path');

async function generateZoomedLogo() {
  try {
    // Try to use puppeteer
    const puppeteer = require('puppeteer');
    
    // Read the original HTML
    const htmlPath = path.join(__dirname, 'app/public/app-icon.html');
    let htmlContent = fs.readFileSync(htmlPath, 'utf8');
    
    // Calculate zoom: 52% zoom to ensure rounded corners are completely cropped
    // Canvas is 512px, original grid is 380px
    // At 1.52x zoom, grid becomes ~578px, ensuring all edges and corners are cropped
    const zoomFactor = 1.52;
    const originalSize = 380;
    const zoomedSize = Math.round(originalSize * zoomFactor); // ~532px (larger than 512px canvas)
    const originalFontSize = 180;
    const zoomedFontSize = Math.round(originalFontSize * zoomFactor);
    
    // Modify the HTML to zoom in
    htmlContent = htmlContent.replace(
      new RegExp(`width: ${originalSize}px;`, 'g'),
      `width: ${zoomedSize}px;`
    );
    htmlContent = htmlContent.replace(
      new RegExp(`height: ${originalSize}px;`, 'g'),
      `height: ${zoomedSize}px;`
    );
    htmlContent = htmlContent.replace(
      new RegExp(`font-size: ${originalFontSize}px;`, 'g'),
      `font-size: ${zoomedFontSize}px;`
    );
    
    // Add transform to scale more horizontally to crop left/right edges
    // Scale X axis more than Y to crop dark lines on sides
    const horizontalScale = 1.15; // Scale horizontally by 15% more
    htmlContent = htmlContent.replace(
      /\.grid-container \{/,
      `.grid-container {
      transform: scaleX(${horizontalScale});`
    );
    
    // Also add overflow hidden to body to ensure cropping
    htmlContent = htmlContent.replace(
      /body \{/,
      `body {
      overflow: hidden;`
    );
    
    // Launch browser
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    // Set viewport
    await page.setViewport({ width: 512, height: 512 });
    
    // Load the modified HTML
    await page.setContent(htmlContent);
    
    // Wait for fonts to load
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Take screenshot
    const outputPath = path.join(__dirname, 'app/public/app-icon-zoomed.png');
    await page.screenshot({
      path: outputPath,
      width: 512,
      height: 512,
    });
    
    await browser.close();
    
    console.log(`✅ Generated zoomed logo at: ${outputPath}`);
    console.log(`   Zoom factor: ${(zoomFactor * 100).toFixed(1)}%`);
    console.log(`   Grid size: ${originalSize}px → ${zoomedSize}px`);
    console.log(`   Font size: ${originalFontSize}px → ${zoomedFontSize}px`);
    console.log(`\n📸 Image saved! You can view it at: ${path.resolve(outputPath)}`);
    
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND' && error.message.includes('puppeteer')) {
      console.error('❌ Puppeteer is not installed.');
      console.log('\n📦 Installing puppeteer...');
      const { execSync } = require('child_process');
      try {
        execSync('npm install --save-dev puppeteer', { stdio: 'inherit', cwd: __dirname });
        console.log('\n✅ Puppeteer installed! Running script again...\n');
        return generateZoomedLogo();
      } catch (installError) {
        console.error('❌ Failed to install puppeteer:', installError.message);
        console.log('\n💡 Alternative: Open the modified HTML file in a browser and take a screenshot manually.');
        process.exit(1);
      }
    } else {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  }
}

generateZoomedLogo();

