(function () {
  var frame = document.querySelector('div.max-w-\\[430px\\]')
    || document.querySelector('main.destination-selector')
    || document.querySelector('.frame');

  if (!frame) return;

  var DESIGN_W = 430;
  var DESIGN_H = 932;

  function ajustar() {
    var escala = Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H, 1);

    frame.style.width = DESIGN_W + 'px';
    frame.style.height = DESIGN_H + 'px';
    frame.style.transformOrigin = 'top center';
    frame.style.transform = 'scale(' + escala + ')';

    var contenedor = frame.parentElement;
    if (contenedor) {
      contenedor.style.width = DESIGN_W + 'px';
      contenedor.style.height = DESIGN_H * escala + 'px';
      contenedor.style.margin = '0 auto';
      contenedor.style.overflow = 'hidden';
    }
  }

  window.addEventListener('resize', ajustar);
  ajustar();
})();