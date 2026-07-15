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
        'Authorization': 'Basic ' + Buffer.from('api:sk_396fd924e5e9addeab2144626e4f3c345e92ab13').toString('base64'),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        source: url,
        use_print: false,
        wait_for: '#print-only',
        viewport: { width: 1280, height: 800 },
        margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
        format: 'A4'
      })
    });

    const pdf = await response.buffer();

    res.setHeader('Content-Type', 'application/pdf');
    res.send(pdf);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};
