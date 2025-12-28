#!/usr/bin/env node
/**
 * Script to generate the content card PNG from HTML.
 * Exports at 3x scale (1035x720) as required by World App.
 */

const fs = require('fs');
const path = require('path');

async function generateContentCard() {
  try {
    const puppeteer = require('puppeteer');
    
    // Read the HTML
    const htmlPath = path.join(__dirname, 'app/public/content-card-new.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    
    // Launch browser
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    // Set viewport to 3x scale (1035x720)
    await page.setViewport({ width: 1035, height: 720 });
    
    // Load the HTML
    await page.setContent(htmlContent);
    
    // Wait for fonts to load
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Take screenshot
    const outputPath = path.join(__dirname, 'app/public/content-card-new.png');
    await page.screenshot({
      path: outputPath,
      width: 1035,
      height: 720,
    });
    
    await browser.close();
    
    console.log(`✅ Generated content card at: ${outputPath}`);
    console.log(`   Dimensions: 1035x720px (3x scale)`);
    console.log(`   Actual size: 345x240px`);
    console.log(`   Bottom 94px reserved for overlay`);
    console.log(`\n📸 Image saved! You can view it at: ${path.resolve(outputPath)}`);
    
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND' && error.message.includes('puppeteer')) {
      console.error('❌ Puppeteer is not installed.');
      console.log('\n📦 Installing puppeteer...');
      const { execSync } = require('child_process');
      try {
        execSync('npm install --save-dev puppeteer', { stdio: 'inherit', cwd: __dirname });
        console.log('\n✅ Puppeteer installed! Running script again...\n');
        return generateContentCard();
      } catch (installError) {
        console.error('❌ Failed to install puppeteer:', installError.message);
        process.exit(1);
      }
    } else {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  }
}

generateContentCard();






