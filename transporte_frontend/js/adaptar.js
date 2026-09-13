(function () {
  var frame = document.querySelector('div.max-w-\\[430px\\]')
    || document.querySelector('main.destination-selector')
    || document.querySelector('.frame');

  if (!frame) return;

  var DESIGN_W = 430;
  var DESIGN_H = 932;

  function ajustar() {
    var escala = Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H, 1);
    var anchoReal = DESIGN_W * escala;
    var altoReal = DESIGN_H * escala;

    document.body.style.display = 'block';
    document.body.style.width = anchoReal + 'px';
    document.body.style.height = altoReal + 'px';
    document.body.style.margin = '0 auto';
    document.body.style.maxWidth = '100vw';
    document.body.style.maxHeight = '100vh';
    document.body.style.overflowX = 'hidden';

    frame.style.width = DESIGN_W + 'px';
    frame.style.height = DESIGN_H + 'px';
    frame.style.position = 'relative';
    frame.style.left = '50%';
    frame.style.right = 'auto';
    frame.style.transformOrigin = 'top center';
    frame.style.transform = 'translateX(-50%) scale(' + escala + ')';
  }

  window.addEventListener('resize', ajustar);
  ajustar();
})();