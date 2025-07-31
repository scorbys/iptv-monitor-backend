require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

class IPTVTelegramBot {
    constructor() {
        if (!TELEGRAM_BOT_TOKEN) {
            throw new Error('TELEGRAM_BOT_TOKEN is required');
        }

        this.bot = new TelegramBot(TELEGRAM_BOT_TOKEN, {
            polling: {
                interval: 300,
                params: {
                    timeout: 10
                }
            }
        });
        this.subscribers = new Map();
        this.lastNotifications = new Map();
        this.setupCommands();
        this.setupErrorHandling();

        console.log('🤖 IPTV Telegram Bot initialized');
    }

    // Tambahkan method untuk mendapatkan base URL API
    getApiBaseUrl() {
        return process.env.BASE_URL || 'http://localhost:3001';
    }

    setupCommands() {
        // Command /start
        this.bot.onText(/\/start/, (msg) => {
            const chatId = msg.chat.id;
            const userName = msg.from.first_name || msg.from.username || 'User';

            this.subscribers.set(chatId, {
                active: true,
                pausedUntil: null,
                userName: userName
            });

            const welcomeMessage = `
🔥 *Selamat datang di IPTV Monitor Bot!* 🔥

Halo ${userName}! Bot ini akan membantu memantau status perangkat IPTV Anda.

📋 *Fitur yang tersedia:*
• /list-channel - Daftar status channel
• /list-chromecast - Daftar status Chromecast
• /list-TVhospitality - Daftar status TV Hospitality  
• /ringkasan - Ringkasan error perangkat
• /jeda - Jeda notifikasi 1 jam
• /stop - Berhenti menerima notifikasi

✅ *Status:* Aktif menerima notifikasi
🔔 Anda akan menerima notifikasi otomatis saat ada perangkat offline.

Ketik /help untuk melihat perintah ini lagi.
      `;

            this.bot.sendMessage(chatId, welcomeMessage, {
                parse_mode: 'Markdown',
                reply_markup: {
                    keyboard: [
                        ['/list-channel', '/list-chromecast'],
                        ['/list-TVhospitality', '/ringkasan'],
                        ['/jeda', '/stop']
                    ],
                    resize_keyboard: true
                }
            });

            console.log(`👤 User ${userName} (${chatId}) subscribed to notifications`);
        });

        // Command /stop
        this.bot.onText(/\/stop/, (msg) => {
            const chatId = msg.chat.id;

            if (this.subscribers.has(chatId)) {
                this.subscribers.get(chatId).active = false;
                this.bot.sendMessage(chatId,
                    '🔕 *Notifikasi dihentikan*\n\nAnda tidak akan menerima notifikasi lagi.\nKetik /start untuk mengaktifkan kembali.',
                    {
                        parse_mode: 'Markdown',
                        reply_markup: { remove_keyboard: true }
                    }
                );
                console.log(`🔕 User ${chatId} unsubscribed from notifications`);
            }
        });

        // Command /jeda
        this.bot.onText(/\/jeda/, (msg) => {
            const chatId = msg.chat.id;

            if (this.subscribers.has(chatId)) {
                const pausedUntil = new Date(Date.now() + 60 * 60 * 1000); // 1 jam
                this.subscribers.get(chatId).pausedUntil = pausedUntil;

                this.bot.sendMessage(chatId,
                    `⏸️ *Notifikasi dijeda selama 1 jam*\n\nNotifikasi akan kembali aktif pada:\n${pausedUntil.toLocaleString('id-ID')}`,
                    { parse_mode: 'Markdown' }
                );
                console.log(`⏸️ User ${chatId} paused notifications until ${pausedUntil}`);
            }
        });

        // Command /help
        this.bot.onText(/\/help/, (msg) => {
            const chatId = msg.chat.id;

            const helpMessage = `
🆘 *Bantuan IPTV Monitor Bot*

🔔 *Notifikasi:*
/start - Mulai menerima notifikasi
/stop - Berhenti menerima notifikasi
/jeda - Jeda notifikasi selama 1 jam

📊 *Informasi Status:*
/list-channel - Daftar semua channel dan statusnya
/list-chromecast - Daftar perangkat Chromecast
/list-TVhospitality - Daftar TV di hotel/hospitality
/ringkasan - Ringkasan statistik error perangkat

ℹ️ Bot akan otomatis mengirim notifikasi saat ada perangkat yang offline.
      `;

            this.bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
        });

        // Command untuk list data
        this.setupListCommands();
    }

    setupListCommands() {
        // List Channels
        this.bot.onText(/\/list-channel/, async (msg) => {
            const chatId = msg.chat.id;

            try {
                const channels = await this.fetchChannelData();
                let message = '📺 *Status Channel IPTV*\n\n';

                if (channels.length === 0) {
                    message += 'Tidak ada data channel ditemukan.';
                } else {
                    const online = channels.filter(ch => ch.status === 'online');
                    const offline = channels.filter(ch => ch.status === 'offline');

                    message += `📊 *Ringkasan:* ${online.length} Online | ${offline.length} Offline\n\n`;

                    if (offline.length > 0) {
                        message += '🔴 *Channel Offline:*\n';
                        offline.forEach(ch => {
                            message += `• ${ch.channelName || 'Unknown'}\n  IP: ${ch.ipMulticast || 'N/A'}\n`;
                        });
                        message += '\n';
                    }

                    if (online.length > 0) {
                        message += '🟢 *Channel Online:*\n';
                        online.slice(0, 10).forEach(ch => { // Limit to 10 to avoid message length
                            message += `• ${ch.channelName || 'Unknown'}\n`;
                        });
                        if (online.length > 10) {
                            message += `... dan ${online.length - 10} channel lainnya\n`;
                        }
                    }
                }

                this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
            } catch (error) {
                console.error('Error fetching channel data:', error);
                this.bot.sendMessage(chatId, '❌ Gagal mengambil data channel. Silakan coba lagi.');
            }
        });

        // List Chromecast
        this.bot.onText(/\/list-chromecast/, async (msg) => {
            const chatId = msg.chat.id;

            try {
                const devices = await this.fetchChromecastData();
                let message = '📱 *Status Chromecast*\n\n';

                if (devices.length === 0) {
                    message += 'Tidak ada perangkat Chromecast ditemukan.';
                } else {
                    const online = devices.filter(d => d.isOnline);
                    const offline = devices.filter(d => !d.isOnline);

                    message += `📊 *Ringkasan:* ${online.length} Online | ${offline.length} Offline\n\n`;

                    if (offline.length > 0) {
                        message += '🔴 *Chromecast Offline:*\n';
                        offline.forEach(d => {
                            message += `• ${d.deviceName || 'Unknown'}\n  IP: ${d.ipAddr || 'N/A'}\n`;
                        });
                        message += '\n';
                    }

                    if (online.length > 0) {
                        message += '🟢 *Chromecast Online:*\n';
                        online.forEach(d => {
                            message += `• ${d.deviceName || 'Unknown'}\n`;
                        });
                    }
                }

                this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
            } catch (error) {
                console.error('Error fetching Chromecast data:', error);
                this.bot.sendMessage(chatId, '❌ Gagal mengambil data Chromecast. Silakan coba lagi.');
            }
        });

        // List TV Hospitality
        this.bot.onText(/\/list-TVhospitality/, async (msg) => {
            const chatId = msg.chat.id;

            try {
                const tvs = await this.fetchTVData();
                let message = '🏨 *Status TV Hospitality*\n\n';

                if (tvs.length === 0) {
                    message += 'Tidak ada data TV ditemukan.';
                } else {
                    const online = tvs.filter(tv => tv.status === 'online');
                    const offline = tvs.filter(tv => tv.status === 'offline');

                    message += `📊 *Ringkasan:* ${online.length} Online | ${offline.length} Offline\n\n`;

                    if (offline.length > 0) {
                        message += '🔴 *TV Offline:*\n';
                        offline.forEach(tv => {
                            message += `• Room ${tv.roomNo || 'Unknown'}\n  IP: ${tv.ipAddress || 'N/A'}\n`;
                        });
                        message += '\n';
                    }

                    if (online.length > 0) {
                        message += '🟢 *TV Online:*\n';
                        online.slice(0, 15).forEach(tv => {
                            message += `• Room ${tv.roomNo || 'Unknown'}\n`;
                        });
                        if (online.length > 15) {
                            message += `... dan ${online.length - 15} TV lainnya\n`;
                        }
                    }
                }

                this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
            } catch (error) {
                console.error('Error fetching TV data:', error);
                this.bot.sendMessage(chatId, '❌ Gagal mengambil data TV. Silakan coba lagi.');
            }
        });

        // Ringkasan
        this.bot.onText(/\/ringkasan/, async (msg) => {
            const chatId = msg.chat.id;

            try {
                const [channels, chromecasts, tvs] = await Promise.all([
                    this.fetchChannelData(),
                    this.fetchChromecastData(),
                    this.fetchTVData()
                ]);

                const channelOffline = channels.filter(ch => ch.status === 'offline').length;
                const chromecastOffline = chromecasts.filter(d => !d.isOnline).length;
                const tvOffline = tvs.filter(tv => tv.status === 'offline').length;

                const totalDevices = channels.length + chromecasts.length + tvs.length;
                const totalOffline = channelOffline + chromecastOffline + tvOffline;
                const uptime = ((totalDevices - totalOffline) / totalDevices * 100).toFixed(1);

                const message = `
📊 *Ringkasan Status IPTV*

🎯 *Uptime Keseluruhan:* ${uptime}%
🔧 *Total Perangkat:* ${totalDevices}
❌ *Total Offline:* ${totalOffline}

📺 *Channel:* ${channels.length - channelOffline}/${channels.length} Online
📱 *Chromecast:* ${chromecasts.length - chromecastOffline}/${chromecasts.length} Online  
🏨 *TV Hospitality:* ${tvs.length - tvOffline}/${tvs.length} Online

⏰ *Update terakhir:* ${new Date().toLocaleString('id-ID')}

${totalOffline > 0 ? '⚠️ *Perangkat yang perlu perhatian:* ' + totalOffline : '✅ Semua perangkat berjalan normal'}
        `;

                this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
            } catch (error) {
                console.error('Error generating summary:', error);
                this.bot.sendMessage(chatId, '❌ Gagal mengambil ringkasan data. Silakan coba lagi.');
            }
        });
    }

    // Fetch data methods (integrate with your existing API endpoints)
    async fetchChannelData() {
        try {
            const baseUrl = this.getApiBaseUrl();
            const response = await fetch(`${baseUrl}/api/channels`, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            const result = await response.json();
            return result.success ? result.data : [];
        } catch (error) {
            console.error('Failed to fetch channel data:', error);
            return [];
        }
    }

    async fetchChromecastData() {
        try {
            const baseUrl = this.getApiBaseUrl();
            const response = await fetch(`${baseUrl}/api/chromecast`, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            const result = await response.json();
            return result.success ? result.data : [];
        } catch (error) {
            console.error('Failed to fetch Chromecast data:', error);
            return [];
        }
    }

    async fetchTVData() {
        try {
            const baseUrl = this.getApiBaseUrl();
            const response = await fetch(`${baseUrl}/api/hospitality/tvs`, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            const result = await response.json();
            return result.success ? result.data : [];
        } catch (error) {
            console.error('Failed to fetch TV data:', error);
            return [];
        }
    }

    // Method untuk mengirim notifikasi offline devices
    async sendOfflineNotification(notifications) {
        const activeSubscribers = Array.from(this.subscribers.entries())
            .filter(([chatId, sub]) => {
                if (!sub.active) return false;
                if (sub.pausedUntil && new Date() < sub.pausedUntil) return false;
                return true;
            });

        if (activeSubscribers.length === 0) return;

        // Group notifications by type
        const groupedNotifications = notifications.reduce((acc, notif) => {
            if (!acc[notif.source]) acc[notif.source] = [];
            acc[notif.source].push(notif);
            return acc;
        }, {});

        for (const [chatId, subscriber] of activeSubscribers) {
            try {
                let message = '🚨 *Peringatan Perangkat Offline*\n\n';

                Object.entries(groupedNotifications).forEach(([source, notifs]) => {
                    const sourceEmoji = {
                        'channel': '📺',
                        'chromecast': '📱',
                        'tv': '🏨',
                        'system': '⚙️'
                    };

                    message += `${sourceEmoji[source] || '🔧'} *${source.toUpperCase()}:*\n`;

                    notifs.slice(0, 5).forEach(notif => {
                        message += `• ${notif.message}\n`;
                        if (notif.ipAddr) {
                            message += `  IP: ${notif.ipAddr}\n`;
                        }
                    });

                    if (notifs.length > 5) {
                        message += `  ... dan ${notifs.length - 5} perangkat lainnya\n`;
                    }
                    message += '\n';
                });

                message += `⏰ *Waktu:* ${new Date().toLocaleString('id-ID')}\n\n`;
                message += `Ketik /jeda untuk jeda 1 jam atau /stop untuk berhenti menerima notifikasi.`;

                await this.bot.sendMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '⏸️ Jeda 1 Jam', callback_data: 'pause_1h' },
                                { text: '🔕 Stop', callback_data: 'stop_notifications' }
                            ],
                            [
                                { text: '📊 Lihat Ringkasan', callback_data: 'show_summary' }
                            ]
                        ]
                    }
                });

                console.log(`📤 Notification sent to user ${chatId}`);

            } catch (error) {
                console.error(`Failed to send notification to ${chatId}:`, error);

                // Remove invalid chat IDs
                if (error.response && error.response.statusCode === 403) {
                    this.subscribers.delete(chatId);
                    console.log(`🗑️ Removed blocked user ${chatId}`);
                }
            }
        }
    }

    // Setup callback query handlers
    setupErrorHandling() {
        this.bot.on('callback_query', (callbackQuery) => {
            const chatId = callbackQuery.message.chat.id;
            const data = callbackQuery.data;

            switch (data) {
                case 'pause_1h':
                    if (this.subscribers.has(chatId)) {
                        const pausedUntil = new Date(Date.now() + 60 * 60 * 1000);
                        this.subscribers.get(chatId).pausedUntil = pausedUntil;
                        this.bot.answerCallbackQuery(callbackQuery.id, {
                            text: '⏸️ Notifikasi dijeda selama 1 jam'
                        });
                    }
                    break;

                case 'stop_notifications':
                    if (this.subscribers.has(chatId)) {
                        this.subscribers.get(chatId).active = false;
                        this.bot.answerCallbackQuery(callbackQuery.id, {
                            text: '🔕 Notifikasi dihentikan'
                        });
                    }
                    break;

                case 'show_summary':
                    this.bot.answerCallbackQuery(callbackQuery.id);
                    // Trigger ringkasan command
                    this.bot.emit('message', {
                        chat: { id: chatId },
                        text: '/ringkasan',
                        from: callbackQuery.from
                    });
                    break;
            }
        });

        this.bot.on('polling_error', (error) => {
            console.error('Telegram polling error:', error);
        });

        this.bot.on('error', (error) => {
            console.error('Telegram bot error:', error);
        });
    }

    // Method untuk mendapatkan daftar subscriber aktif
    getActiveSubscribers() {
        return Array.from(this.subscribers.entries())
            .filter(([_, sub]) => sub.active)
            .map(([chatId, sub]) => ({ chatId, ...sub }));
    }

    // Method untuk cleanup subscriber yang tidak aktif
    cleanupSubscribers() {
        const now = new Date();
        let cleaned = 0;

        for (const [chatId, sub] of this.subscribers.entries()) {
            // Remove paused status if time has passed
            if (sub.pausedUntil && now > sub.pausedUntil) {
                sub.pausedUntil = null;
                console.log(`⏰ Resumed notifications for user ${chatId}`);
            }
        }

        console.log(`🧹 Cleaned up ${cleaned} inactive subscribers`);
    }
}

module.exports = IPTVTelegramBot;