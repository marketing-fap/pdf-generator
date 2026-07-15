const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url } = req.body;

  try {
    const executablePath = await chromium.executablePath();
    
    const browser = await puppeteer.launch({
      args: [
        ...chromium.args,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ],
      executablePath: executablePath,
      headless: chromium.headless,
      ignoreHTTPSErrors: true
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

    await page.evaluate(() => {
      var el = document.getElementById('print-only');
      if (el) {
        el.style.display = 'block';
        el.style.visibility = 'visible';
        el.style.opacity = '1';
        el.style.height = 'auto';
        el.style.overflow = 'visible';

        var allElements = document.body.children;
        for (var i = 0; i < allElements.length; i++) {
          if (allElements[i].id !== 'print-only') {
            allElements[i].style.display = 'none';
          }
        }
      }
    });

    await new Promise(r => setTimeout(r, 2000));

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' }
    });

    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.send(pdf);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};
