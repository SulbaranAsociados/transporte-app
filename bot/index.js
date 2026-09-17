require("dotenv").config({path:"/home/hely/opencode-prueba/bot/.env"});
const { Telegraf } = require("telegraf");
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const ws = require('ws');

// Configuración de Supabase
const supabaseOptions = { realtime: { transport: ws } };

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, supabaseOptions);
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, supabaseOptions);

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN.trim());
const pendingUploads = new Map();

bot.start((ctx) => ctx.reply('¡Hola! Envíame una foto o video.'));

bot.on(['photo', 'video'], async (ctx) => {
    const file = ctx.message.photo ? ctx.message.photo.pop() : ctx.message.video;
    const fileLink = await ctx.telegram.getFileLink(file.file_id);
    const response = await axios.get(fileLink.href, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);
    
    const fileName = `${Date.now()}_${file.file_id}`;
    const { error } = await supabaseAdmin.storage
        .from('media_bucket')
        .upload(fileName, buffer, { contentType: ctx.message.photo ? 'image/jpeg' : 'video/mp4' });

    if (error) return ctx.reply('Error al subir archivo.');

    const { data: publicUrlData } = supabaseAdmin.storage.from('media_bucket').getPublicUrl(fileName);
    pendingUploads.set(ctx.chat.id, { file_url: publicUrlData.publicUrl, file_type: ctx.message.photo ? 'image' : 'video' });
    ctx.reply('Archivo recibido. Envía la URL de destino.');
});

bot.on('text', async (ctx) => {
    const pending = pendingUploads.get(ctx.chat.id);
    if (!pending) return ctx.reply('Sube una imagen primero.');

    await supabaseAdmin.from('media_content').insert({
        file_url: pending.file_url,
        file_type: pending.file_type,
        target_url: ctx.message.text
    });

    pendingUploads.delete(ctx.chat.id);
    ctx.reply('¡Contenido guardado!');
});

bot.launch().then(() => console.log('Bot activo y escuchando...'));
