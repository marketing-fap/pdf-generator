const fetch = require('node-fetch');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url } = req.body;

  try {
    const response = await fetch('https://api.pdfshift.io/v3/convert/pdf', {
      method: 'POST',
      headers: {
        'X-API-Key': 'sk_396fd924e5e9addeab2144626e4f3c345e92ab13',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        source: url,
        format: 'A4',
        margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
        lazy_load_images: false,
        css: `
          #print-only {
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
            height: auto !important;
            overflow: visible !important;
          }
          #print-only img {
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
          }
        `,
        javascript: `
          var el = document.getElementById('print-only');
          if (el) {
            el.style.display = 'block';
            el.style.visibility = 'visible';
            el.style.opacity = '1';
            el.style.height = 'auto';
            el.style.overflow = 'visible';

            var images = el.querySelectorAll('img');
            var loaded = 0;
            images.forEach(function(img) {
              if (img.dataset.src) img.src = img.dataset.src;
              if (img.dataset.lazySrc) img.src = img.dataset.lazySrc;
              img.style.display = 'block';
              img.style.visibility = 'visible';
              img.style.opacity = '1';
            });

            document.body.innerHTML = '';
            document.body.appendChild(el);
          }

          window.pdfReady = function() {
            return document.querySelectorAll('img[src]').length > 0;
          };
        `,
        wait_for: 'pdfReady'
      })
    });

    if (!response.ok) {
      const error = await response.text();
      return res.status(500).json({ error: error });
    }

    const buffer = await response.buffer();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};
