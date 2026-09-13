(function () {
  var frame = document.querySelector('div.max-w-\\[430px\\]')
    || document.querySelector('main.destination-selector')
    || document.querySelector('.frame');

  if (!frame) return;

  var DESIGN_W = 430;
  var DESIGN_H = 932;

  function ajustar() {
    var escala = Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H, 1);

    document.body.style.display = 'flex';
    document.body.style.flexDirection = 'column';
    document.body.style.justifyContent = 'center';
    document.body.style.alignItems = 'center';
    document.body.style.width = '100vw';
    document.body.style.height = DESIGN_H * escala + 'px';
    document.body.style.margin = '0';
    document.body.style.maxWidth = '100vw';
    document.body.style.overflow = 'hidden';

    frame.style.width = DESIGN_W + 'px';
    frame.style.height = DESIGN_H + 'px';
    frame.style.margin = '0';
    frame.style.position = 'static';
    frame.style.left = 'auto';
    frame.style.right = 'auto';
    frame.style.flexShrink = '0';
    frame.style.transformOrigin = 'top center';
    frame.style.transform = 'scale(' + escala + ')';
  }

  window.addEventListener('resize', ajustar);
  ajustar();
})();