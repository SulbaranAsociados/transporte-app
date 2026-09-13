export function createButton(text, variant = '', onClick) {
    console.log("Creando botón:", text, variant);
    const btn = document.createElement('button');
    // Aplicamos la clase base y la variante
    btn.className = `neumorphic-btn ${variant}`;
    btn.innerText = text;
    
    if (onClick) btn.onclick = onClick;
    return btn;
}

export function createShapeButton(shapeClass, onClick) {
    const btn = document.createElement('button');
    btn.className = `neumorphic-shape ${shapeClass}`;
    
    if (onClick) btn.onclick = onClick;
    return btn;
}
