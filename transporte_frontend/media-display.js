(function() {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    document.head.appendChild(script);

    script.onload = async () => {
        const client = window.supabase.createClient('https://wpzhupxosghrtessxvlo.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indwemh1cHhvc2docnRlc3N4dmxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzNTI3MzEsImV4cCI6MjEwNDkyODczMX0.AFJjVeyrjVNwTLJqTYH8MEV3ycj2uL4h4Ci6fNn4D7E');
        
        const { data, error } = await client.from('media_content').select('*').eq('is_active', true).order('orden', { ascending: true });
        
        const containers = document.querySelectorAll('.media-display');
        if (error || !data || data.length === 0) {
            containers.forEach(c => c.innerHTML = "Sin contenido");
            return;
        }

        let index = 0;
        function show() {
            const item = data[index];
            containers.forEach(container => {
                let html = item.target_url ? `<a href="${item.target_url}" target="_blank" class="block w-full h-full">` : '<div class="w-full h-full">';
                
                // object-contain asegura que no se recorte
                if (item.file_type === 'image') {
                    html += `<img src="${item.file_url}" class="w-full h-full object-contain">`;
                } else {
                    html += `<video src="${item.file_url}" autoplay muted loop class="w-full h-full object-contain"></video>`;
                }
                
                html += item.target_url ? `</a>` : '</div>';
                container.innerHTML = html;
            });
            const duration = (item.duration || 5) * 1000;
            index = (index + 1) % data.length;
            setTimeout(show, duration);
        }
        show();
    };
})();
