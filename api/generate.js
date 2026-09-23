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


            /*
             * ÁREA DE IMPRESSÃO
             *
             * A4 = 210mm.
             * Margem esquerda = 10mm.
             * Margem direita = 10mm.
             *
             * Largura útil = 190mm.
             */
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


            /*
             * IMPORTANTE
             *
             * Não existe uma regra global:
             *
             * #print-only img {
             *   height: auto !important;
             * }
             *
             * porque isso iria anular alturas e dimensões
             * específicas definidas no Webflow.
             */


            /*
             * FIGURES DENTRO DOS RICH TEXT
             *
             * Uma figure nunca deve ser cortada a meio.
             *
             * Se existir figcaption, fica automaticamente
             * agrupado com a imagem porque pertence à figure.
             */
            #print-only .w-richtext figure {
              max-width: 100% !important;

              page-break-inside: avoid !important;
              break-inside: avoid-page !important;
            }


            /*
             * Imagens inseridas em figures de Rich Text.
             *
             * Estas podem ser redimensionadas pelo JavaScript
             * caso sejam demasiado altas para uma página A4.
             */
            #print-only .w-richtext figure img {
display: block !important;
 
max-width: 100% !important;
width: auto !important;
height: auto !important;
 
max-height: 90mm !important;
 
object-fit: contain !important;
 
margin-left: auto !important;
margin-right: auto !important;
}


            /*
             * IMAGENS DENTRO DE PICTURE
             *
             * Algumas imagens do Webflow recebem o max-width
             * no elemento <picture>.
             *
             * No browser normal isso funciona corretamente,
             * mas o Chromium pode recalcular o tamanho do IMG
             * quando entra no modo de impressão.
             *
             * O JavaScript mede previamente a largura correta
             * e adiciona esta classe.
             */
            #print-only picture.pdf-picture-size-locked {
              box-sizing: border-box !important;
            }

            #print-only picture.pdf-picture-size-locked > img {
              box-sizing: border-box !important;
            }


            /*
             * HEADINGS
             *
             * Nenhum heading deve ficar isolado no final
             * de uma página.
             */
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


            /*
             * Estas classes são adicionadas dinamicamente
             * pelo JavaScript para ligar headings e conteúdos
             * que podem estar em wrappers diferentes.
             */
            #print-only .pdf-keep-after {
              page-break-after: avoid !important;
              break-after: avoid-page !important;
            }


            #print-only .pdf-keep-before {
              page-break-before: avoid !important;
              break-before: avoid-page !important;
            }


            /*
             * Elementos vazios existentes entre dois elementos
             * ligados não devem criar uma oportunidade de quebra.
             */
            #print-only .pdf-keep-bridge {
              page-break-before: avoid !important;
              break-before: avoid-page !important;

              page-break-after: avoid !important;
              break-after: avoid-page !important;

              page-break-inside: avoid !important;
              break-inside: avoid-page !important;
            }


            /*
             * PARÁGRAFOS
             *
             * O parágrafo deve começar na mesma página
             * do heading, mas pode continuar para a página seguinte.
             */
            #print-only p.pdf-keep-before {
              orphans: 1 !important;
              widows: 1 !important;
            }


            /*
             * LISTAS
             *
             * O primeiro LI deve caber juntamente
             * com o heading/subheading.
             *
             * A UL ou OL inteira pode continuar
             * para a página seguinte.
             */
            #print-only .pdf-first-list-item {
              page-break-before: avoid !important;
              break-before: avoid-page !important;

              page-break-inside: avoid !important;
              break-inside: avoid-page !important;
            }


            /*
             * FIGURE ATÓMICA
             *
             * Não permitir quebra dentro de:
             *
             * figure
             *   imagem
             *   legenda
             */
            #print-only .pdf-atomic-figure {
              page-break-inside: avoid !important;
              break-inside: avoid-page !important;
            }


            /*
             * WRAPPERS WEBFLOW
             *
             * Proteção adicional para as estruturas
             * já existentes no site.
             */
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


              /*
               * Pequeno delay auxiliar.
               */
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


              /*
               * Espera por dois ciclos completos de layout/render.
               *
               * É importante antes de medir imagens.
               */
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


              /*
               * Mostra apenas o #print-only.
               *
               * Os elementos irmãos são escondidos para que
               * não interfiram no PDF.
               */
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


              /*
               * FORÇAR CARREGAMENTO DE IMAGENS LAZY
               */
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


              /*
               * Verifica se é uma tag H1-H6.
               */
              function isHeading(element) {

                return (
                  !!element &&
                  /^H[1-6]$/.test(
                    element.tagName
                  )
                );

              }


              /*
               * Identifica elementos visualmente vazios.
               */
              function isEmptyPrintElement(element) {

                if (!element) {
                  return true;
                }


                /*
                 * Estes elementos contam sempre como conteúdo.
                 */
                if (
                  element.matches(
                    'img, picture, figure, video, iframe, svg, table, ul, ol, blockquote'
                  )
                ) {

                  return false;

                }


                /*
                 * Se contiverem media ou estruturas relevantes
                 * também não são vazios.
                 */
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


              /*
               * Verifica se um elemento participa
               * visualmente no layout.
               */
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


              /*
               * Blocos que representam conteúdo real.
               */
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


              /*
               * CONSTRUIR UMA SEQUÊNCIA LÓGICA DO CONTEÚDO
               *
               * Os DIVs estruturais são ignorados.
               *
               * Exemplo:
               *
               * DIV
               *   H3
               *
               * DIV
               *   DIV
               *     UL
               *
               * passa a:
               *
               * H3
               * UL
               */
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


                    /*
                     * É apenas um wrapper:
                     * continuar a descer.
                     */
                    if (
                      child.children.length
                    ) {

                      collectPrintBlocks(
                        child,
                        output
                      );

                      return;

                    }


                    /*
                     * Elemento textual não vazio.
                     */
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


              /*
               * Primeiro ancestral comum
               * entre dois elementos.
               */
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


              /*
               * Determina se um elemento se encontra
               * fisicamente entre outros dois no DOM.
               */
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


              /*
               * Elementos vazios entre heading
               * e conteúdo não podem introduzir
               * uma quebra.
               */
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


              /*
               * LIGA DOIS ELEMENTOS ATRAVÉS DOS WRAPPERS
               *
               * Isto é fundamental porque o heading pode estar
               * dentro de um DIV e o conteúdo dentro de outro DIV.
               */
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


                /*
                 * Do primeiro elemento para cima:
                 * impedir quebra depois.
                 */
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


                /*
                 * Do segundo elemento para cima:
                 * impedir quebra antes.
                 */
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


              /*
               * Primeiro LI de uma lista.
               */
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


              /*
               * =====================================================
               * CORREÇÃO DAS IMAGENS EM PICTURE
               * =====================================================
               *
               * Algumas imagens recebem o max-width diretamente
               * no elemento picture através do Webflow.
               *
               * No layout normal estão corretas.
               *
               * Durante a impressão o Chromium pode recalcular
               * o IMG a partir do seu tamanho intrínseco e fazê-lo
               * crescer.
               *
               * Para evitar isso:
               *
               * 1. Esperamos que imagens e fontes carreguem.
               * 2. Medimos a largura visual correta do IMG.
               * 3. Fixamos exatamente essa largura no picture.
               * 4. Fixamos exatamente essa largura no IMG.
               *
               * Não alteramos a altura.
               */
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


                    /*
                     * Esta é a dimensão correta que já
                     * está visualmente renderizada.
                     */
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


                    /*
                     * O picture por defeito pode comportar-se
                     * como inline.
                     *
                     * Nesse caso o max-width pode não produzir
                     * uma caixa física consistente em print.
                     *
                     * inline-block mantém-no no fluxo mas
                     * permite definir uma largura real.
                     */
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


                    /*
                     * Bloquear a largura do PICTURE.
                     */
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


                    /*
                     * Bloquear também a largura do IMG.
                     *
                     * Não definimos height.
                     *
                     * Assim continuamos a respeitar eventuais
                     * alturas específicas existentes no Webflow.
                     */
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


              /*
               * =====================================================
               * PROTEÇÃO DE HEADINGS + CONTEÚDO
               * =====================================================
               */
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


                  /*
                   * Primeiro heading da cadeia.
                   */
                  var firstHeading =
                    blocks[index];


                  var lastHeading =
                    firstHeading;


                  var cursor =
                    index;


                  /*
                   * Agrupar headings consecutivos:
                   *
                   * H3
                   * H4
                   * H5
                   */
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


                  /*
                   * Primeiro conteúdo depois dos headings.
                   */
                  var firstContent =
                    blocks[cursor + 1];


                  if (firstContent) {

                    linkElementsWithoutPageBreak(
                      lastHeading,
                      firstContent
                    );


                    /*
                     * LISTAS
                     *
                     * Garantir que pelo menos o primeiro LI
                     * cabe juntamente com os headings.
                     */
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


                    /*
                     * FIGURES
                     *
                     * Guardamos o primeiro heading da cadeia
                     * para posteriormente medir:
                     *
                     * heading(s)
                     * +
                     * figure
                     * +
                     * figcaption
                     */
                    if (
                      firstContent.matches(
                        'figure'
                      ) &&
                      firstContent.closest(
                        '.w-richtext'
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


              /*
               * Converte milímetros físicos em pixels CSS
               * no Chromium utilizado pela PDFShift.
               */
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


              /*
               * =====================================================
               * REDIMENSIONAR FIGURES DEMASIADO GRANDES
               * =====================================================
               *
               * A4:
               *
               * 297mm altura total
               *
               * - 10mm margem superior
               * - 10mm margem inferior
               *
               * = 277mm área útil.
               *
               * Reservamos 2mm adicionais como segurança.
               */
              function fitRichTextFiguresToPage(
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
                    '.w-richtext figure'
                  ),

                  function (figure) {

                    /*
                     * Figure inteira = unidade indivisível.
                     */
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


                    /*
                     * Caso a figure pertença a uma cadeia
                     * de headings, começar a medir no heading.
                     */
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


                    /*
                     * Altura total:
                     *
                     * heading(s)
                     * +
                     * espaçamentos
                     * +
                     * figure
                     * +
                     * legenda
                     */
                    var groupHeight =
                      figureRect.bottom -
                      startRect.top;


                    /*
                     * Já cabe na página.
                     *
                     * Não mexer na imagem.
                     */
                    if (
                      groupHeight <=
                      usableHeight
                    ) {

                      return;

                    }


                    /*
                     * Tudo exceto a imagem:
                     *
                     * heading
                     * subtítulos
                     * margens
                     * padding
                     * figcaption
                     * etc.
                     */
                    var nonImageHeight =
                      groupHeight -
                      imageRect.height;


                    /*
                     * Altura máxima restante
                     * para a imagem.
                     */
                    var targetImageHeight =
                      usableHeight -
                      nonImageHeight;


                    /*
                     * Caso extremo:
                     * nem removendo a imagem o grupo cabe.
                     */
                    if (
                      targetImageHeight <= 0
                    ) {

                      console.warn(
                        'Figure demasiado alta mesmo sem a imagem:',
                        figure
                      );


                      return;
                    }


                    /*
                     * Reduzir SOMENTE quando necessário.
                     */
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


                      /*
                       * Quando a altura passa a ser a limitação,
                       * deixar a largura adaptar-se proporcionalmente.
                       */
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


                      /*
                       * Centrar horizontalmente.
                       */
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


              /*
               * Esperar pelo carregamento efetivo
               * de cada imagem.
               */
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


                /*
                 * Imagem sem origem válida.
                 */
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

                        console.error(
                          'Imagem removida por falha de carregamento:',
                          img.currentSrc ||
                            img.src
                        );


                        img.remove();

                      }


                      resolve();

                    }


                    /*
                     * Timeout máximo de 15 segundos.
                     */
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


                    /*
                     * Já está carregada.
                     */
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


              /*
               * =====================================================
               * PREPARAÇÃO FINAL DO PDF
               * =====================================================
               */
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


                /*
                 * Garantir visibilidade.
                 */
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


                /*
                 * Isolar a secção de impressão.
                 */
                isolateElement(
                  root
                );


                /*
                 * Resolver sources lazy-loaded
                 * existentes dentro de picture.
                 */
                Array.prototype.forEach.call(
                  root.querySelectorAll(
                    'source[data-srcset]'
                  ),

                  function (source) {

                    source.srcset =
                      source.dataset.srcset;

                  }
                );


                /*
                 * Fazer scroll até ao fim para ajudar
                 * Webflow/browser a carregar recursos lazy.
                 */
                window.scrollTo(
                  0,
                  document.body.scrollHeight
                );


                await delay(
                  100
                );


                /*
                 * Esperar por TODAS as imagens.
                 */
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


                /*
                 * Esperar pelas fontes.
                 */
                if (
                  document.fonts &&
                  document.fonts.ready
                ) {

                  await Promise.race([
                    document.fonts.ready,
                    delay(5000)
                  ]);

                }


                /*
                 * IMPORTANTE
                 *
                 * Esperar o layout estabilizar antes
                 * de medir as imagens dentro de picture.
                 */
                await waitForTwoFrames();


                /*
                 * =================================================
                 * CORREÇÃO DO TAMANHO DAS IMAGENS PICTURE
                 * =================================================
                 *
                 * Neste momento o layout ainda representa
                 * corretamente as dimensões definidas pelo Webflow.
                 *
                 * Guardamos essas dimensões antes da impressão.
                 */
                preservePictureImageSizes(
                  root
                );


                /*
                 * O bloqueio das dimensões pode provocar um pequeno
                 * reflow. Esperar que termine.
                 */
                await waitForTwoFrames();


                /*
                 * =================================================
                 * HEADINGS + CONTEÚDO
                 * =================================================
                 */
                var figureHeadingMap =
                  protectHeadingGroups(
                    root
                  );


                /*
                 * =================================================
                 * FIGURES DEMASIADO ALTAS
                 * =================================================
                 */
                fitRichTextFiguresToPage(
                  root,
                  figureHeadingMap
                );


                /*
                 * Esperar pelo reflow.
                 */
                await waitForTwoFrames();


                /*
                 * Segunda passagem.
                 *
                 * Serve para absorver pequenas alterações
                 * de altura provocadas pelo primeiro resize.
                 */
                fitRichTextFiguresToPage(
                  root,
                  figureHeadingMap
                );


                /*
                 * Esperar pelo layout final.
                 */
                await waitForTwoFrames();


                /*
                 * Voltar ao topo.
                 */
                window.scrollTo(
                  0,
                  0
                );


                /*
                 * Dar autorização à PDFShift
                 * para gerar o PDF.
                 */
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
