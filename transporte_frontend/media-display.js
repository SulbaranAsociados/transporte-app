(async function() {
    // Cargar Supabase
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    document.head.appendChild(script);

    script.onload = async () => {
        const supabase = supabase.createClient('https://wpzhupxosghrtessxvlo.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indwemh1cHhvc2docnRlc3N4dmxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzNTI3MzEsImV4cCI6MjEwNDkyODczMX0.AFJjVeyrjVNwTLJqTYH8MEV3ycj2uL4h4Ci6fNn4D7E');
        
        const { data, error } = await supabase.from('media_content').select('*').eq('is_active', true).order('orden', { ascending: true });
        
        const containers = document.querySelectorAll('.media-display');
        if (error || !data || data.length === 0) {
            containers.forEach(c => c.innerHTML = "Sin contenido");
            return;
        }

        let index = 0;
        function show() {
            const item = data[index];
            containers.forEach(container => {
                let html = `<a href="${item.target_url}" target="_blank" class="block w-full h-full">`;
                if (item.file_type === 'image') {
                    html += `<img src="${item.file_url}" class="w-full h-full object-cover">`;
                } else {
                    html += `<video src="${item.file_url}" autoplay muted loop class="w-full h-full object-cover"></video>`;
                }
                html += `</a>`;
                container.innerHTML = html;
            });
            index = (index + 1) % data.length;
        }
        show();
        setInterval(show, 5000);
    };
})();
