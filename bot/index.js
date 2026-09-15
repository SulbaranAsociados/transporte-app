require('dotenv').config();
const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const ws = require('ws');

// Configuración de Supabase
const supabaseOptions = {
    realtime: { transport: ws }
};

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, supabaseOptions);
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, supabaseOptions);

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const pendingUploads = new Map();

bot.start((ctx) => ctx.reply('¡Hola! Envíame una foto o video para agregarlo al display de la app.'));

bot.on(['photo', 'video'], async (ctx) => {
    const file = ctx.message.photo ? ctx.message.photo.pop() : ctx.message.video;
    const fileLink = await ctx.telegram.getFileLink(file.file_id);
    const response = await axios.get(fileLink.href, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);
    
    const fileName = `${Date.now()}_${file.file_id}`;
    const { data, error } = await supabaseAdmin.storage
        .from('media_bucket')
        .upload(fileName, buffer, { contentType: ctx.message.photo ? 'image/jpeg' : 'video/mp4' });

    if (error) {
        console.error('Error storage:', error);
        return ctx.reply('Error al subir el archivo al almacenamiento.');
    }

    const { data: publicUrlData } = supabaseAdmin.storage.from('media_bucket').getPublicUrl(fileName);
    
    pendingUploads.set(ctx.chat.id, {
        file_url: publicUrlData.publicUrl,
        file_type: ctx.message.photo ? 'image' : 'video'
    });

    ctx.reply('Archivo recibido. Por favor, envíame la URL de destino.');
});

bot.on('text', async (ctx) => {
    console.log('Mensaje recibido:', ctx.message.text);
    const pending = pendingUploads.get(ctx.chat.id);
    console.log('Estado pendiente:', pending);
    if (!pending) return ctx.reply('No hay subida pendiente.');

    const { error } = await supabaseAdmin.from('media_content').insert({
        file_url: pending.file_url,
        file_type: pending.file_type,
        target_url: ctx.message.text
    });

    if (error) {
        console.error('Error DB:', error);
        return ctx.reply('Error al guardar en BD.');
    }

    pendingUploads.delete(ctx.chat.id);
    ctx.reply('¡Contenido guardado!');
});

bot.launch();
console.log('Bot de Telegram iniciado.');
