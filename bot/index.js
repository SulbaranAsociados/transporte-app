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
    ctx.reply('Archivo recibido. Envía la URL de destino (o "-" para ninguna).');
});

bot.on('text', async (ctx) => {
    const pending = pendingUploads.get(ctx.chat.id);
    if (!pending) return;

    await supabaseAdmin.from('media_content').insert({
        file_url: pending.file_url,
        file_type: pending.file_type,
        target_url: ctx.message.text === '-' ? null : ctx.message.text,
        orden: 0,
        duration: 5
    });

    pendingUploads.delete(ctx.chat.id);
    ctx.reply('¡Contenido guardado!');
});

// Comandos de gestión
bot.command('list', async (ctx) => {
    const { data } = await supabaseAdmin.from('media_content').select('*').order('orden');
    if (!data || data.length === 0) return ctx.reply('No hay contenido.');
    let message = 'Contenido actual:\n';
    data.forEach(item => message += `ID: ${item.id} | Orden: ${item.orden} | Duración: ${item.duration}s | URL: ${item.target_url || 'Ninguna'}\n`);
    ctx.reply(message);
});

bot.command('delete', async (ctx) => {
    const id = ctx.message.text.split(' ')[1];
    if (!id) return ctx.reply('Uso: /delete <id>');
    await supabaseAdmin.from('media_content').delete().eq('id', id);
    ctx.reply(`Contenido ID ${id} eliminado.`);
});

bot.command('set', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 4) return ctx.reply('Uso: /set <id> <orden|duration|target_url> <valor>');
    const [_, id, prop, value] = args;
    await supabaseAdmin.from('media_content').update({ [prop]: value }).eq('id', id);
    ctx.reply(`Actualizado: ${prop} = ${value} para ID ${id}`);
});

bot.launch().then(() => console.log('Bot activo y escuchando...'));
