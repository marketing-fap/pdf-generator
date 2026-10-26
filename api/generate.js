	const fetch = require('node-fetch');

const DEFAULT_ORIGIN =
  'https://guia-online-france-air-po-1982015d34ef0.webflow.io';

const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || DEFAULT_ORIGIN)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);

const ALLOWED_SOURCE_HOSTS = new Set(
  (process.env.ALLOWED_SOURCE_HOSTS || new URL(DEFAULT_ORIGIN).hostname)
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
);

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;

  const contentType = String(req.headers['content-type'] || '').toLowerCase();

  if (contentType.includes('application/json')) {
    return JSON.parse(req.body);
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(req.body));
  }

  return {};
}

function validateProductUrl(value) {
  let source;

  try {
    source = new URL(String(value || ''));
  } catch {
    const error = new Error('URL inválido.');
    error.statusCode = 400;
    throw error;
  }

  const allowed =
    source.protocol === 'https:' &&
    ALLOWED_SOURCE_HOSTS.has(source.hostname.toLowerCase()) &&
    source.pathname.startsWith('/produtos/') &&
    !source.username &&
    !source.password;

  if (!allowed) {
    const error = new Error('URL não permitida.');
    error.statusCode = 403;
    throw error;
  }

  source.hash = '';
  return source.toString();
}

function safeFilename(value) {
  const filename = String(value || 'ficha-produto')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);

  return filename || 'ficha-produto';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function sendError(req, res, status, message) {
  const contentType = String(req.headers['content-type'] || '').toLowerCase();

  const isFormNavigation = contentType.includes(
    'application/x-www-form-urlencoded'
  );

  if (isFormNavigation) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    return res.end(`<!doctype html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Erro ao gerar PDF</title>

  <style>
    body {
      margin: 0;
      padding: 40px;
      font: 16px/1.5 Arial, sans-serif;
      color: #222;
    }

    main {
      max-width: 680px;
      margin: 0 auto;
    }
  </style>
</head>

<body>
  <main>
    <h1>Não foi possível gerar o PDF.</h1>
    <p>${escapeHtml(message)}</p>
  </main>
</body>
</html>`);
  }

  return res.status(status).json({
    error: message
  });
}

module.exports = async (req, res) => {
  const origin = req.headers.origin;

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader(
      'Access-Control-Allow-Origin',
      origin
    );

    res.setHeader(
      'Vary',
      'Origin'
    );
  }

  res.setHeader(
    'Access-Control-Allow-Methods',
    'POST, OPTIONS'
  );

  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type'
  );

  if (req.method === 'OPTIONS') {
    if (
      origin &&
      !ALLOWED_ORIGINS.has(origin)
    ) {
      return res.status(403).end();
    }

    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader(
      'Allow',
      'POST, OPTIONS'
    );

    return sendError(
      req,
      res,
      405,
      'Método não permitido.'
    );
  }

  if (
    origin &&
    !ALLOWED_ORIGINS.has(origin)
  ) {
    return sendError(
      req,
      res,
      403,
      'Origem não permitida.'
    );
  }

  const apiKey =
    process.env.PDFSHIFT_API_KEY;

  if (!apiKey) {
    return sendError(
      req,
      res,
      500,
      'O serviço de PDF não está configurado.'
    );
  }

  try {
    const body =
      parseBody(req);

    const source =
      validateProductUrl(body.url);

    const filename =
      safeFilename(body.filename);

    const pdfResponse = await fetch(
      'https://api.pdfshift.io/v3/convert/pdf',
      {
        method: 'POST',

        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json'
        },

        body: JSON.stringify({
          source,

          format: 'A4',

          margin: {
            top: '10mm',
            bottom: '10mm',
            left: '10mm',
            right: '10mm'
          },

          raise_for_status: true,
          lazy_load_images: true,
          wait_for_network: true,
          ignore_long_polling: true,

          css: `
            html,
            body {
              background: #fff !important;
            }



            #print-only {
              display: block !important;
              visibility: visible !important;
              opacity: 1 !important;

              height: auto !important;
              overflow: visible !important;

              box-sizing: border-box !important;

              width: 190mm !important;
              max-width: 190mm !important;

              margin-left: auto !important;
              margin-right: auto !important;
            }


            #print-only figure {
              max-width: 100% !important;

              page-break-inside: avoid !important;
              break-inside: avoid-page !important;
            }


            #print-only figure img {
              display: block !important;

              max-width: 100% !important;
	      max-height: 180px !important;
              width: auto !important;
              height: auto !important;
              object-fit: contain !important;
              margin-left: auto !important;
              margin-right: auto !important;
            }


            #print-only picture.pdf-picture-size-locked {
              box-sizing: border-box !important;
            }

            #print-only picture.pdf-picture-size-locked > img {
              box-sizing: border-box !important;
            }



            #print-only h1,
            #print-only h2,
            #print-only h3,
            #print-only h4,
            #print-only h5,
            #print-only h6 {
              page-break-inside: avoid !important;
              break-inside: avoid-page !important;

              page-break-after: avoid !important;
              break-after: avoid-page !important;
            }


            #print-only .pdf-keep-after {
              page-break-after: avoid !important;
              break-after: avoid-page !important;
            }


            #print-only .pdf-keep-before {
              page-break-before: avoid !important;
              break-before: avoid-page !important;
            }


            #print-only .pdf-keep-bridge {
              page-break-before: avoid !important;
              break-before: avoid-page !important;

              page-break-after: avoid !important;
              break-after: avoid-page !important;

              page-break-inside: avoid !important;
              break-inside: avoid-page !important;
            }


            #print-only p.pdf-keep-before {
              orphans: 1 !important;
              widows: 1 !important;
            }


            #print-only .pdf-first-list-item {
              page-break-before: avoid !important;
              break-before: avoid-page !important;

              page-break-inside: avoid !important;
              break-inside: avoid-page !important;
            }


            #print-only .pdf-atomic-figure {
              page-break-inside: avoid !important;
              break-inside: avoid-page !important;
            }


            #print-only .section-header-wrapper,
            #print-only .section-main-header-wrapper {
              page-break-inside: avoid !important;
              break-inside: avoid-page !important;

              page-break-after: avoid !important;
              break-after: avoid-page !important;
            }


            #print-only .section-header-wrapper + .conteudo-geral-wrapper,
            #print-only .section-main-header-wrapper + * {
              page-break-before: avoid !important;
              break-before: avoid-page !important;
            }
          `,


          javascript: `
            (function () {

              window.__pdfReady = false;


              window.pdfReady = function () {
                return window.__pdfReady === true;
              };


              function delay(ms) {
                return new Promise(
                  function (resolve) {
                    setTimeout(
                      resolve,
                      ms
                    );
                  }
                );
              }


              function waitForTwoFrames() {
                return new Promise(
                  function (resolve) {
                    requestAnimationFrame(
                      function () {
                        requestAnimationFrame(
                          resolve
                        );
                      }
                    );
                  }
                );
              }


              function isolateElement(root) {

                var node = root;

                while (
                  node &&
                  node !== document.body
                ) {

                  if (
                    window
                      .getComputedStyle(node)
                      .display === 'none'
                  ) {
                    node.style.setProperty(
                      'display',
                      'block',
                      'important'
                    );
                  }


                  node.style.setProperty(
                    'visibility',
                    'visible',
                    'important'
                  );


                  node.style.setProperty(
                    'opacity',
                    '1',
                    'important'
                  );


                  node.style.setProperty(
                    'overflow',
                    'visible',
                    'important'
                  );


                  var parent =
                    node.parentElement;


                  if (!parent) {
                    break;
                  }


                  Array.prototype.forEach.call(
                    parent.children,

                    function (sibling) {

                      if (
                        sibling !== node
                      ) {

                        sibling.style.setProperty(
                          'display',
                          'none',
                          'important'
                        );

                      }

                    }
                  );


                  node = parent;
                }
              }


              function hydrateImage(img) {

                img.loading = 'eager';


                if (
                  !img.getAttribute('src') &&
                  img.dataset.src
                ) {

                  img.src =
                    img.dataset.src;

                }


                if (
                  !img.getAttribute('src') &&
                  img.dataset.lazySrc
                ) {

                  img.src =
                    img.dataset.lazySrc;

                }


                if (
                  !img.getAttribute('srcset') &&
                  img.dataset.srcset
                ) {

                  img.srcset =
                    img.dataset.srcset;

                }


                if (
                  !img.getAttribute('srcset') &&
                  img.dataset.lazySrcset
                ) {

                  img.srcset =
                    img.dataset.lazySrcset;

                }

              }


              function isHeading(element) {

                return (
                  !!element &&
                  /^H[1-6]$/.test(
                    element.tagName
                  )
                );

              }


              function isEmptyPrintElement(element) {

                if (!element) {
                  return true;
                }


                if (
                  element.matches(
                    'img, picture, figure, video, iframe, svg, table, ul, ol, blockquote'
                  )
                ) {

                  return false;

                }


                if (
                  element.querySelector(
                    'img, picture, figure, video, iframe, svg, table, ul, ol, blockquote'
                  )
                ) {

                  return false;

                }


                return (
                  element.textContent
                    .replace(
                      /[\\\\s\\\\u200B\\\\u200C\\\\u200D\\\\uFEFF]/g,
                      ''
                    ) === ''
                );

              }


              function isVisiblePrintElement(
                element
              ) {

                if (!element) {
                  return false;
                }


                var style =
                  window.getComputedStyle(
                    element
                  );


                return (
                  style.display !== 'none' &&
                  style.visibility !== 'hidden'
                );

              }


              function isContentBlock(
                element
              ) {

                return (
                  !!element &&
                  element.matches(
                    'p, ul, ol, figure, table, blockquote, pre, dl'
                  )
                );

              }


              function collectPrintBlocks(
                container,
                output
              ) {

                Array.prototype.forEach.call(
                  container.children,

                  function (child) {

                    if (
                      !isVisiblePrintElement(
                        child
                      )
                    ) {

                      return;

                    }


                    if (
                      isHeading(child) ||
                      isContentBlock(child)
                    ) {

                      output.push(
                        child
                      );

                      return;

                    }


                    if (
                      child.children.length
                    ) {

                      collectPrintBlocks(
                        child,
                        output
                      );

                      return;

                    }


                    if (
                      !isEmptyPrintElement(
                        child
                      )
                    ) {

                      output.push(
                        child
                      );

                    }

                  }
                );

              }


              function getCommonAncestor(
                first,
                second
              ) {

                var ancestors = [];

                var node =
                  first;


                while (node) {

                  ancestors.push(
                    node
                  );

                  node =
                    node.parentElement;

                }


                node =
                  second;


                while (node) {

                  if (
                    ancestors.indexOf(
                      node
                    ) !== -1
                  ) {

                    return node;

                  }


                  node =
                    node.parentElement;

                }


                return null;
              }


              function isBetweenElements(
                element,
                first,
                second
              ) {

                if (
                  !element ||
                  element === first ||
                  element === second
                ) {

                  return false;

                }


                return (

                  !!(
                    first.compareDocumentPosition(
                      element
                    ) &
                    Node.DOCUMENT_POSITION_FOLLOWING
                  )

                  &&

                  !!(
                    element.compareDocumentPosition(
                      second
                    ) &
                    Node.DOCUMENT_POSITION_FOLLOWING
                  )

                );

              }


              function markEmptyBridgeElements(
                common,
                first,
                second
              ) {

                if (!common) {
                  return;
                }


                Array.prototype.forEach.call(
                  common.querySelectorAll('*'),

                  function (element) {

                    if (
                      isBetweenElements(
                        element,
                        first,
                        second
                      ) &&
                      isEmptyPrintElement(
                        element
                      )
                    ) {

                      element.classList.add(
                        'pdf-keep-bridge'
                      );

                    }

                  }
                );

              }


              function linkElementsWithoutPageBreak(
                first,
                second
              ) {

                var common =
                  getCommonAncestor(
                    first,
                    second
                  );


                var node;


                if (!common) {
                  return;
                }


                node = first;


                while (
                  node &&
                  node !== common
                ) {

                  node.classList.add(
                    'pdf-keep-after'
                  );

                  node =
                    node.parentElement;

                }


                node = second;


                while (
                  node &&
                  node !== common
                ) {

                  node.classList.add(
                    'pdf-keep-before'
                  );

                  node =
                    node.parentElement;

                }


                markEmptyBridgeElements(
                  common,
                  first,
                  second
                );

              }


              function getFirstListItem(
                list
              ) {

                var children =
                  Array.prototype.slice.call(
                    list.children
                  );


                for (
                  var index = 0;
                  index < children.length;
                  index += 1
                ) {

                  if (
                    children[index].tagName === 'LI'
                  ) {

                    return children[index];

                  }

                }


                return null;
              }


              function preservePictureImageSizes(
                root
              ) {

                Array.prototype.forEach.call(
                  root.querySelectorAll(
                    'picture'
                  ),

                  function (picture) {

                    var image =
                      picture.querySelector(
                        'img'
                      );


                    if (!image) {
                      return;
                    }


                    var imageRect =
                      image.getBoundingClientRect();


                    if (
                      !imageRect.width ||
                      !isFinite(
                        imageRect.width
                      )
                    ) {

                      return;

                    }


                    var renderedWidth =
                      imageRect.width;


                    var pictureStyle =
                      window.getComputedStyle(
                        picture
                      );


                    if (
                      pictureStyle.display === 'inline' ||
                      pictureStyle.display === 'contents'
                    ) {

                      picture.style.setProperty(
                        'display',
                        'inline-block',
                        'important'
                      );

                    }


                    picture.classList.add(
                      'pdf-picture-size-locked'
                    );


                    picture.style.setProperty(
                      'width',
                      renderedWidth + 'px',
                      'important'
                    );


                    picture.style.setProperty(
                      'max-width',
                      renderedWidth + 'px',
                      'important'
                    );


                    image.style.setProperty(
                      'width',
                      renderedWidth + 'px',
                      'important'
                    );


                    image.style.setProperty(
                      'max-width',
                      renderedWidth + 'px',
                      'important'
                    );

                  }
                );

              }


              function protectHeadingGroups(
                root
              ) {

                var blocks = [];

                var figureHeadingMap =
                  new Map();


                collectPrintBlocks(
                  root,
                  blocks
                );


                for (
                  var index = 0;
                  index < blocks.length;
                  index += 1
                ) {

                  if (
                    !isHeading(
                      blocks[index]
                    )
                  ) {

                    continue;

                  }


                  var firstHeading =
                    blocks[index];


                  var lastHeading =
                    firstHeading;


                  var cursor =
                    index;


                  while (
                    cursor + 1 < blocks.length &&
                    isHeading(
                      blocks[cursor + 1]
                    )
                  ) {

                    linkElementsWithoutPageBreak(
                      lastHeading,
                      blocks[cursor + 1]
                    );


                    cursor += 1;


                    lastHeading =
                      blocks[cursor];

                  }


                  var firstContent =
                    blocks[cursor + 1];


                  if (firstContent) {

                    linkElementsWithoutPageBreak(
                      lastHeading,
                      firstContent
                    );


                    if (
                      firstContent.matches(
                        'ul, ol'
                      )
                    ) {

                      var firstListItem =
                        getFirstListItem(
                          firstContent
                        );


                      if (
                        firstListItem
                      ) {

                        firstListItem.classList.add(
                          'pdf-first-list-item'
                        );

                      }

                    }


                    if (
                      firstContent.matches(
                        'figure'
                      )
                    ) {

                      figureHeadingMap.set(
                        firstContent,
                        firstHeading
                      );

                    }

                  }


                  index =
                    cursor;

                }


                return figureHeadingMap;
              }


              function millimetresToPixels(
                mm
              ) {

                var probe =
                  document.createElement(
                    'div'
                  );


                probe.style.setProperty(
                  'position',
                  'absolute',
                  'important'
                );


                probe.style.setProperty(
                  'visibility',
                  'hidden',
                  'important'
                );


                probe.style.setProperty(
                  'pointer-events',
                  'none',
                  'important'
                );


                probe.style.setProperty(
                  'width',
                  '0',
                  'important'
                );


                probe.style.setProperty(
                  'height',
                  String(mm) + 'mm',
                  'important'
                );


                probe.style.setProperty(
                  'margin',
                  '0',
                  'important'
                );


                probe.style.setProperty(
                  'padding',
                  '0',
                  'important'
                );


                probe.style.setProperty(
                  'border',
                  '0',
                  'important'
                );


                document.body.appendChild(
                  probe
                );


                var pixels =
                  probe
                    .getBoundingClientRect()
                    .height;


                probe.remove();


                return pixels;
              }


              function fitAllFiguresToPage(
                root,
                figureHeadingMap
              ) {

                var pageHeight =
                  millimetresToPixels(
                    277
                  );


                var safety =
                  millimetresToPixels(
                    2
                  );


                var usableHeight =
                  pageHeight -
                  safety;


                Array.prototype.forEach.call(
                  root.querySelectorAll(
                    'figure'
                  ),

                  function (figure) {

                    figure.classList.add(
                      'pdf-atomic-figure'
                    );


                    var image =
                      figure.querySelector(
                        'img'
                      );


                    if (!image) {
                      return;
                    }


                    var groupStart =
                      figureHeadingMap.get(
                        figure
                      ) || figure;


                    var startRect =
                      groupStart
                        .getBoundingClientRect();


                    var figureRect =
                      figure
                        .getBoundingClientRect();


                    var imageRect =
                      image
                        .getBoundingClientRect();


                    if (
                      !imageRect.height ||
                      !figureRect.height
                    ) {

                      return;

                    }


                    var groupHeight =
                      figureRect.bottom -
                      startRect.top;


                    if (
                      groupHeight <=
                      usableHeight
                    ) {

                      return;

                    }


                    var nonImageHeight =
                      groupHeight -
                      imageRect.height;


                    var targetImageHeight =
                      usableHeight -
                      nonImageHeight;


                    if (
                      targetImageHeight <= 0
                    ) {

                      return;

                    }


                    if (
                      targetImageHeight <
                      imageRect.height
                    ) {

                      image.style.setProperty(
                        'max-height',
                        targetImageHeight +
                          'px',
                        'important'
                      );


                      image.style.setProperty(
                        'height',
                        'auto',
                        'important'
                      );


                      image.style.setProperty(
                        'width',
                        'auto',
                        'important'
                      );


                      image.style.setProperty(
                        'max-width',
                        '100%',
                        'important'
                      );


                      image.style.setProperty(
                        'margin-left',
                        'auto',
                        'important'
                      );


                      image.style.setProperty(
                        'margin-right',
                        'auto',
                        'important'
                      );

                    }

                  }
                );

              }


              function waitForImage(
                img
              ) {

                hydrateImage(
                  img
                );


                var src =
                  (
                    img.getAttribute(
                      'src'
                    ) || ''
                  ).trim();


                var srcset =
                  (
                    img.getAttribute(
                      'srcset'
                    ) || ''
                  ).trim();


                if (
                  !src &&
                  !srcset
                ) {

                  img.remove();

                  return Promise.resolve();

                }


                return new Promise(
                  function (resolve) {

                    var finished =
                      false;


                    function finish(
                      success
                    ) {

                      if (finished) {
                        return;
                      }


                      finished =
                        true;


                      clearTimeout(
                        timer
                      );


                      if (!success) {
                        img.remove();
                      }


                      resolve();

                    }


                    var timer =
                      setTimeout(
                        function () {

                          finish(
                            img.complete &&
                            img.naturalWidth > 0
                          );

                        },
                        15000
                      );


                    if (
                      img.complete
                    ) {

                      finish(
                        img.naturalWidth > 0
                      );


                      return;

                    }


                    img.addEventListener(
                      'load',

                      function () {

                        finish(
                          img.naturalWidth > 0
                        );

                      },

                      {
                        once: true
                      }
                    );


                    img.addEventListener(
                      'error',

                      function () {

                        finish(
                          false
                        );

                      },

                      {
                        once: true
                      }
                    );

                  }
                );

              }


              async function preparePdf() {

                var root =
                  document.getElementById(
                    'print-only'
                  );


                if (!root) {

                  throw new Error(
                    'Elemento #print-only não encontrado.'
                  );

                }


                root.style.setProperty(
                  'display',
                  'block',
                  'important'
                );


                root.style.setProperty(
                  'visibility',
                  'visible',
                  'important'
                );


                root.style.setProperty(
                  'opacity',
                  '1',
                  'important'
                );


                root.style.setProperty(
                  'height',
                  'auto',
                  'important'
                );


                root.style.setProperty(
                  'overflow',
                  'visible',
                  'important'
                );


                isolateElement(
                  root
                );


                Array.prototype.forEach.call(
                  root.querySelectorAll(
                    'source[data-srcset]'
                  ),

                  function (source) {

                    source.srcset =
                      source.dataset.srcset;

                  }
                );


                window.scrollTo(
                  0,
                  document.body.scrollHeight
                );


                await delay(
                  100
                );


                var images =
                  Array.prototype.slice.call(
                    root.querySelectorAll(
                      'img'
                    )
                  );


                await Promise.all(
                  images.map(
                    waitForImage
                  )
                );


                if (
                  document.fonts &&
                  document.fonts.ready
                ) {

                  await Promise.race([
                    document.fonts.ready,
                    delay(5000)
                  ]);

                }


                await waitForTwoFrames();


                preservePictureImageSizes(
                  root
                );


                await waitForTwoFrames();


                var figureHeadingMap =
                  protectHeadingGroups(
                    root
                  );


                fitAllFiguresToPage(
                  root,
                  figureHeadingMap
                );


                await waitForTwoFrames();


                fitAllFiguresToPage(
                  root,
                  figureHeadingMap
                );


                await waitForTwoFrames();


                window.scrollTo(
                  0,
                  0
                );


                window.__pdfReady =
                  true;

              }


              preparePdf().catch(
                function (error) {

                  console.error(
                    error
                  );

                }
              );

            })();
          `,


          wait_for: 'pdfReady'
        })
      }
    );


    if (!pdfResponse.ok) {

      const providerError =
        await pdfResponse.text();


      console.error(
        'PDFShift:',
        pdfResponse.status,
        providerError
      );


      return sendError(
        req,
        res,

        pdfResponse.status === 429
          ? 429
          : 502,

        'O serviço de PDF não conseguiu concluir a conversão.'
      );

    }


    const responseType =
      pdfResponse.headers.get(
        'content-type'
      ) || '';


    if (
      !responseType.includes(
        'application/pdf'
      )
    ) {

      const unexpectedBody =
        await pdfResponse.text();


      console.error(
        'Resposta inesperada da PDFShift:',
        unexpectedBody
      );


      return sendError(
        req,
        res,
        502,
        'A resposta recebida não é um PDF.'
      );

    }


    const contentLength =
      pdfResponse.headers.get(
        'content-length'
      );


    res.setHeader(
      'Content-Type',
      'application/pdf'
    );


    res.setHeader(
      'Content-Disposition',
      `inline; filename="${filename}.pdf"`
    );


    res.setHeader(
      'Cache-Control',
      'no-store'
    );


    if (contentLength) {

      res.setHeader(
        'Content-Length',
        contentLength
      );

    }


    await new Promise(
      (resolve, reject) => {

        pdfResponse.body.on(
          'error',
          reject
        );


        res.on(
          'finish',
          resolve
        );


        res.on(
          'close',
          resolve
        );


        pdfResponse.body.pipe(
          res
        );

      }
    );

  } catch (error) {

    console.error(
      error
    );


    if (
      res.headersSent
    ) {

      return res.destroy(
        error
      );

    }


    return sendError(
      req,
      res,

      error.statusCode ||
        500,

      error.statusCode
        ? error.message
        : 'Erro interno ao gerar o PDF.'
    );

  }
};
