require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const fs = require('fs-extra');
//const fetch = require('node-fetch');
const fetch = require('node-fetch-retry');
const Progress = require('node-fetch-progress');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const cron = require('node-cron');
const zippy = require('zs-extract');
const sysStats = require('./linux.js');
const dood = require('./lib/dood.js');
const MimeType = require('mime-types');

const db_queue = new FileSync('./queue.json');
const db = low(db_queue);
db.defaults({ queue: []}).write();

const users = process.env.grantedUsers
const special_user = users.split('|');
const token = process.env.telegramToken;
const savePath = process.env.savePath;
const bot = new Telegraf(token);
bot.telegram.getMe().then((bot) => console.log(`Server has initialized bot nickname. Nick: ${bot.username}`));

async function download(url, path, chatid, mesid) {
    let result;
    const response = await fetch(url);
    //const mime = response.headers.get('content-type');
    const disposition = response.headers.get('content-disposition');
    const filename = (disposition) ? disposition.match(/filename="(.*?)"/) : false;
    let fixPath = (filename) ? path+filename[1] : path;
    const progress = new Progress(response, { throttle: 100 })
    progress.on('progress', async (p) => {
        let persen = Math.floor(p.progress * 100);
        let estimasi = `<b>Downloading...</b>\n\n`+
        `File size : ${p.totalh}\n`+
        `Downloaded : ${p.doneh} ( ${persen}% )\n`+
        `Transfer rate : ${p.rateh}`;
        if(persen%20==0 && persen != 100){
            await bot.telegram.editMessageText(chatid, mesid, null, estimasi, { parse_mode: 'html' });
        }
    })
    const buffer = await response.arrayBuffer();
    await fs.outputFile(fixPath, Buffer.from(buffer), {flag: 'a'}).then(() => {
        result = `Saved to ${fixPath}`;
    }).catch(err => {
        console.log(err)
        result = "Error saving file!";
    });
    return result;
}

async function downloadQueue(queid, url, hdr = false, path, chatid) {
    db.get('queue').find({ id: queid }).assign({ isOnQueue: true}).write()
    let headers = {}
    headers = hdr ? hdr : '';
    let opts = { method: 'GET', headers: headers, retry: 3, callback: retry => { console.log(`Trying: ${retry}`) } }
    const response = await fetch(url, opts);
    const disposition = response.headers.get('content-disposition');
    const getMime = MimeType.extension(response.headers.get('content-type'))
    const filename = (disposition) ? disposition.match(/filename="(.*?)"/) : false;
    let fixPath = (filename) ? path+filename[1] : (getMime) ? `${path}.${getMime}` : path;
    const buffer = await response.arrayBuffer();
    await fs.outputFile(fixPath, Buffer.from(buffer), {flag: 'a'}).then(() => {
        result = `Saved to ${fixPath}`;
    }).catch(err => {
        console.log(err)
        result = "Error saving file!";
    });
    bot.telegram.sendMessage(chatid, `<b>Queue Status</b>\n\n<b>Queue ID:</b> ${queid}\n<b>Result:</b>\n${result}`, { parse_mode: 'html' });
    db.get('queue').remove({ id: queid, isOnQueue: true }).write();
}

function folderCategory(mime){
    let folder;
    if((/document|pdf|powerpoint|msword|presentation|excel|sheet/g).test(mime)){
        folder = "Document";
    } else if((/image/g).test(mime)){
        folder = "Photo";
    } else if((/video/g).test(mime)){
        folder = "Video";
    } else if((/audio/g).test(mime)){
        folder = "Audio";
    } else if((/text/g).test(mime)){
        folder = "Text";
    } else if((/zip|rar|7z/g).test(mime)){
        folder = "Compressed";
    } else {
        folder = "Other";
    }
    return folder;
}

function fileList(path){
    let list = '';
    const getUser = fs.readdirSync(path);
    getUser.forEach(user => {
        list += `• <b>${user}</b>\n`;
        const getBackup = fs.readdirSync(`${path}/${user}`);
        getBackup.forEach(backupFolder => {
            const countBackup = fs.readdirSync(`${path}/${user}/${backupFolder}`);
            list += `${backupFolder}: ${countBackup.length} files\n`;
        });
    });
    list = list.replace(/[^]•/, "\n\n•");
    return list;
}

bot.start((ctx) => ctx.reply('Kirim file untuk backup pada local server'));
bot.help((ctx) => ctx.reply('Kirim file untuk backup pada local server'));
bot.command('download', (ctx) => ctx.reply('URL?', Markup.forceReply(true).selective(true)));

bot.command('dl', async (ctx) => {
    let downloadUrl, headers;
    let serv = "none";
    const { message: { reply_to_message, from: { id, username, first_name } } } = ctx;
    if (!special_user.includes(username)) return await ctx.reply(`You Don't Have Permission to Access`);
    if (reply_to_message) {
        const { message_id } = await ctx.reply(`Processing...`);
        const urls = reply_to_message.text.match(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g);
        urls.forEach(async (url) => {
            let filename = new URL(url).pathname.split('/').pop();
            if(filename) {
                if((/zippyshare.com\/.*?\/.*?\/file.html/gi).test(url)){
                    serv = "Zippyshare";
                    const zip = await zippy.extract(url);
                    downloadUrl = (zip.download) ? zip.download : false;
                    filename = (downloadUrl) ? zip.filename : filename;
                } else if(url.match(dood.pattern)){
                    serv = "Dood";
                    const getDood = await dood.get(url);
                    downloadUrl = getDood.dl_link;
                    filename = getDood.title;
                    headers = getDood.headers;
                } else {
                    downloadUrl = url;
                }

                if (!downloadUrl){
                    return await ctx.reply("Undefined downloadUrl");
                }

                let queueId = (Math.random() + 1).toString(36).substring(7);
                const addque = db.get('queue').push({ id: queueId, chatid: id, link: downloadUrl, headers: headers, path: `${savePath}/${first_name}/Downloads/${filename}`, isOnQueue: false }).write();
                let extn = (serv == "none") ? `` : `\n<b>Service:</b> ${serv}\n<b>Download url:</b> ${downloadUrl}`;
                (addque) ? await ctx.replyWithHTML(`Added to queue with id ( <b>${queueId}</b> )${extn}`, { disable_web_page_preview: true }) : await ctx.reply("Fail to add queue");
            } else {
                await ctx.reply("I think it's not downloadable file.");
            }
        });
        await ctx.deleteMessage(message_id);
    }
});

bot.command('status', async (ctx) => {
    const { message: { from: { username }}} = ctx;
    if (!special_user.includes(username)) return await ctx.reply(`You Don't Have Permission to Access`);
    const stat = await sysStats();
    await ctx.replyWithHTML(stat);
});

bot.command('stats', async (ctx) => {
    const { message: { from: { username }}} = ctx;
    if (!special_user.includes(username)) return await ctx.reply(`You Don't Have Permission to Access`);
    const countFiles = fileList(savePath);
    await ctx.replyWithHTML(countFiles);
});

bot.on('document', async (ctx) => {
    const { message: { from: { id, username, first_name }, document: { file_name, mime_type, file_id, file_size }}} = ctx;
    if (!special_user.includes(username)) return await ctx.reply(`You Don't Have Permission to Access`);
    const { message_id } = await ctx.reply(`Processing...`);
    const folder = folderCategory(mime_type);
    console.log(`[+] From : ${username} | ${mime_type}`);
    let filesizeToMB = (file_size/1024/1024).toPrecision(4);
    if(filesizeToMB > 20){
        return await ctx.reply(`File is too big`);
    }
    const fileUrl = await ctx.telegram.getFileLink(file_id);
    const save = await download(fileUrl.href, `${savePath}/${first_name}/${folder}/${file_name}`, id, message_id);
    console.log(`[!] Result : ${save}`);
    await ctx.reply(save);
    await ctx.deleteMessage(message_id);
});

bot.on('photo', async (ctx) => {
    await ctx.reply(`Send as file agar kualitas foto tidak berkurang!`);
});

bot.on('video', async (ctx) => {
    const { message: { from: { id, username, first_name }, video: { file_name, mime_type, file_id, file_size }}} = ctx;
    if (!special_user.includes(username)) return await ctx.reply(`You Don't Have Permission to Access`);
    const folder = folderCategory(mime_type);
    console.log(`[+] From : ${username} | ${mime_type}`);
    let filesizeToMB = (file_size/1024/1024).toPrecision(4);
    if(filesizeToMB > 20){
        return await ctx.reply(`File is too big`);
    }
    const fileUrl = await ctx.telegram.getFileLink(file_id);
    const find = db.get('queue').value();
    let queueId = parseInt(find.length)+1;
    const addque = db.get('queue').push({ id: queueId, chatid: id, link: fileUrl.href, path: `${savePath}/${first_name}/${folder}/${file_name}` }).write();
    (addque) ? await ctx.reply(`Added to queue with id : ${queueId}`) : await ctx.reply("Fail to add queue");
});

bot.on('text', async (ctx) => {
    let downloadUrl, headers;
    let serv = "none";
    const { message: { reply_to_message, text, from: { id, username, first_name } } } = ctx
    if (!special_user.includes(username)) return await ctx.reply(`You Don't Have Permission to Access`);
    if (reply_to_message && reply_to_message.text === "URL?") {
        console.log(`[+] From : ${username} | ${text}`);
        const regex = /((([A-Za-z]{3,9}:(?:\/\/)?)(?:[-;:&=\+\$,\w]+@)?[A-Za-z0-9.-]+|(?:www.|[-;:&=\+\$,\w]+@)[A-Za-z0-9.-]+)((?:\/[\+~%\/.\w-_]*)?\??(?:[-\+=&;%@.\w_]*)#?(?:[\w]*))?)/g;
        if(regex.test(text)){
            const { message_id } = await ctx.reply(`Processing...`);
            let filename = new URL(text).pathname.split('/').pop();
            if(filename) {
                if((/zippyshare.com\/.*?\/.*?\/file.html/gi).test(text)){
                    serv = "Zippyshare";
                    const zip = await zippy.extract(text);
                    downloadUrl = (zip.download) ? zip.download : false;
                    filename = (downloadUrl) ? zip.filename : filename;
                } else if(text.match(dood.pattern)){
                    serv = "Dood";
                    const getDood = await dood.get(text);
                    downloadUrl = getDood.dl_link;
                    filename = getDood.title;
                    headers = getDood.headers;
                } else {
                    downloadUrl = text;
                }

                if (!downloadUrl){
                    return await ctx.reply("Undefined downloadUrl");
                }

                let queueId = (Math.random() + 1).toString(36).substring(7);
                const addque = db.get('queue').push({ id: queueId, chatid: id, link: downloadUrl, headers: headers, path: `${savePath}/${first_name}/Downloads/${filename}`, isOnQueue: false }).write();
                let extn = (serv == "none") ? `` : `\n<b>Service:</b> ${serv}\n<b>Download url:</b> ${downloadUrl}`;
                (addque) ? await ctx.replyWithHTML(`Added to queue with id ( <b>${queueId}</b> )${extn}`, { disable_web_page_preview: true }) : await ctx.reply("Fail to add queue");
            } else {
                await ctx.reply("I think it's not downloadable file.");
            }
            await ctx.deleteMessage(message_id);
        } else {
            await ctx.reply("Invalid URL!");
        }
    }
});

cron.schedule(`* * * * *`, () => {
    async function dlQue(){
        const getQue = db.get('queue').find({ isOnQueue: false }).value();
        if(getQue){
            console.log(`[!] Processing queue with ID : ${getQue.id}`);
            await bot.telegram.sendMessage(getQue.chatid, `Processing queue with ID : ${getQue.id}`);
            await downloadQueue(getQue.id, getQue.link, getQue.headers, getQue.path, getQue.chatid);
            console.log(`[-] Queue ID (${getQue.id}) process complete `);
        }
    }
    dlQue();
});

bot.launch();

bot.catch((err, ctx) => {
    console.error('Error!', err);
    ctx.reply("BOT Error!");
});

process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))