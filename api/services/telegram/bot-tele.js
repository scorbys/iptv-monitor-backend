require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

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
        this.fetch = null; // Will be initialized asynchronously

        // Initialize fetch dynamically
        this.initializeFetch();

        this.setupCommands();
        this.setupErrorHandling();

        console.log('🤖 IPTV Telegram Bot initialized');
    }

    // Initialize fetch asynchronously
    async initializeFetch() {
        try {
            const { default: fetch } = await import('node-fetch');
            this.fetch = fetch;
            console.log('✅ node-fetch initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize node-fetch:', error);
        }
    }

    // Tambahkan method untuk mendapatkan base URL API
    getApiBaseUrl() {
        return process.env.BASE_URL || 'http://localhost:3001';
    }

    getIndonesianTime() {
        return new Date().toLocaleString('id-ID', {
            timeZone: 'Asia/Makassar', // WITA timezone
            hour12: false, // Gunakan format 24 jam
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    setupCommands() {
        // Command /start
        this.bot.onText(/\/start/, async (msg) => {  // Tambahkan async di sini
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
• /help - Tampilkan bantuan

✅ *Status:* Aktif menerima notifikasi
🔔 Anda akan menerima notifikasi otomatis saat ada perangkat offline.

Sedang mengecek perangkat offline...
      `;

            await this.bot.sendMessage(chatId, welcomeMessage, {
                parse_mode: 'Markdown',
                reply_markup: {
                    keyboard: [
                        ['/list-channel', '/list-chromecast'],
                        ['/list-TVhospitality', '/ringkasan'],
                        ['/jeda', '/stop', '/help']  // Tambahkan /help di keyboard
                    ],
                    resize_keyboard: true
                }
            });

            console.log(`👤 User ${userName} (${chatId}) subscribed to notifications`);

            // Auto-check untuk perangkat offline setelah /start
            setTimeout(async () => {
                await this.checkAndNotifyOfflineDevices(chatId);
            }, 2000); // Delay 2 detik untuk memastikan setup selesai
        });

        console.log(`🤖 Bot initialized with API base URL: ${this.getApiBaseUrl()}`);

        // Test connection on startup
        setTimeout(async () => {
            try {
                console.log('🔍 Testing API connection...');
                const channels = await this.fetchChannelData();
                const chromecasts = await this.fetchChromecastData();
                const tvs = await this.fetchTVData();

                console.log(`📊 API Test Results:`);
                console.log(`   - Channels: ${channels.length}`);
                console.log(`   - Chromecasts: ${chromecasts.length}`);
                console.log(`   - TVs: ${tvs.length}`);
            } catch (error) {
                console.error('❌ API connection test failed:', error);
            }
        }, 5000); // Test after 5 seconds

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
                    `⏸️ *Notifikasi dijeda selama 1 jam*\n\nNotifikasi akan kembali aktif pada:\n${new Date(Date.now() + 60 * 60 * 1000).toLocaleString('id-ID', { timeZone: 'Asia/Makassar', hour12: false })}`,
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
                        online.slice(0, 15).forEach(d => {
                            message += `• ${d.deviceName || 'Unknown'}\n`;
                        });
                        if (online.length > 15) {
                            message += `... dan ${online.length - 15} Chromecast lainnya\n`
                        }
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

⏰ *Update terakhir:* ${this.getIndonesianTime()}

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
            if (!this.fetch) {
                console.warn('Fetch not initialized yet, waiting...');
                await this.initializeFetch();
                if (!this.fetch) {
                    throw new Error('Failed to initialize fetch');
                }
            }

            const baseUrl = this.getApiBaseUrl();
            const response = await this.fetch(`${baseUrl}/api/internal/channels`, {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'TelegramBot/1.0 node-fetch'
                },
                timeout: 10000 // 10 second timeout
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            console.log(`✅ Fetched ${result.data?.length || 0} channels for bot`);
            return result.success ? result.data : [];
        } catch (error) {
            console.error('Failed to fetch channel data:', error);
            return [];
        }
    }

    async fetchChromecastData() {
        try {
            if (!this.fetch) {
                console.warn('Fetch not initialized yet, waiting...');
                await this.initializeFetch();
                if (!this.fetch) {
                    throw new Error('Failed to initialize fetch');
                }
            }

            const baseUrl = this.getApiBaseUrl();
            const response = await this.fetch(`${baseUrl}/api/internal/chromecast`, {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'TelegramBot/1.0 node-fetch'
                },
                timeout: 10000
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            console.log(`✅ Fetched ${result.data?.length || 0} chromecast devices for bot`);
            return result.success ? result.data : [];
        } catch (error) {
            console.error('Failed to fetch Chromecast data:', error);
            return [];
        }
    }

    async fetchTVData() {
        try {
            if (!this.fetch) {
                console.warn('Fetch not initialized yet, waiting...');
                await this.initializeFetch();
                if (!this.fetch) {
                    throw new Error('Failed to initialize fetch');
                }
            }

            const baseUrl = this.getApiBaseUrl();
            const response = await this.fetch(`${baseUrl}/api/internal/hospitality/tvs`, {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'TelegramBot/1.0 node-fetch'
                },
                timeout: 10000
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            console.log(`✅ Fetched ${result.data?.length || 0} TV devices for bot`);
            return result.success ? result.data : [];
        } catch (error) {
            console.error('Failed to fetch TV data:', error);
            return [];
        }
    }

    // Method untuk check offline devices khusus untuk user baru
    async checkAndNotifyOfflineDevices(specificChatId = null) {
        try {
            const [channels, chromecasts, tvs] = await Promise.all([
                this.fetchChannelData(),
                this.fetchChromecastData(),
                this.fetchTVData()
            ]);

            const notifications = [];

            // Check offline channels
            channels.filter(ch => ch.status === 'offline').forEach(ch => {
                notifications.push({
                    source: 'channel',
                    message: `${ch.channelName || 'Unknown Channel'}`,
                    ipAddr: ch.ipMulticast
                });
            });

            // Check offline chromecasts
            chromecasts.filter(d => !d.isOnline).forEach(d => {
                notifications.push({
                    source: 'chromecast',
                    message: `${d.deviceName || 'Unknown Device'}`,
                    ipAddr: d.ipAddr
                });
            });

            // Check offline TVs
            tvs.filter(tv => tv.status === 'offline').forEach(tv => {
                notifications.push({
                    source: 'tv',
                    message: `Room ${tv.roomNo || 'Unknown'}`,
                    ipAddr: tv.ipAddress
                });
            });

            if (notifications.length > 0) {
                if (specificChatId) {
                    // Send ke user tertentu (untuk /start)
                    await this.sendOfflineNotificationToUser(specificChatId, notifications);
                } else {
                    // Send ke semua subscriber (untuk monitoring rutin)
                    await this.sendOfflineNotification(notifications);
                }
            } else {
                if (specificChatId) {
                    await this.bot.sendMessage(specificChatId,
                        '✅ *Semua perangkat online!*\n\nTidak ada perangkat yang offline saat ini.',
                        { parse_mode: 'Markdown' }
                    );
                }
            }

        } catch (error) {
            console.error('Error checking offline devices:', error);
            if (specificChatId) {
                await this.bot.sendMessage(specificChatId,
                    '❌ Gagal mengecek status perangkat. Silakan coba lagi nanti.'
                );
            }
        }
    }

    // Method untuk send notification ke user tertentu
    async sendOfflineNotificationToUser(chatId, notifications) {
        try {
            // Check apakah user masih aktif dan tidak paused
            const subscriber = this.subscribers.get(chatId);
            if (!subscriber || !subscriber.active) return;
            if (subscriber.pausedUntil && new Date() < subscriber.pausedUntil) return;

            // Group notifications by type
            const groupedNotifications = notifications.reduce((acc, notif) => {
                if (!acc[notif.source]) acc[notif.source] = [];
                acc[notif.source].push(notif);
                return acc;
            }, {});

            let message = '🚨 *Perangkat Offline Terdeteksi*\n\n';

            Object.entries(groupedNotifications).forEach(([source, notifs]) => {
                const sourceEmoji = {
                    'channel': '📺',
                    'chromecast': '📱',
                    'tv': '🏨'
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

            message += `⏰ *Waktu:* ${this.getIndonesianTime()}\n\n`;
            message += `Gunakan perintah untuk info lebih lanjut atau atur notifikasi.`;

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

            console.log(`📤 Initial notification sent to user ${chatId}`);

        } catch (error) {
            console.error(`Failed to send initial notification to ${chatId}:`, error);
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

                message += `⏰ *Waktu:* ${this.getIndonesianTime()}\n\n`;
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

    // Method sendSummaryToUser untuk callback
    async sendSummaryToUser(chatId) {
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
            const uptime = totalDevices > 0 ? ((totalDevices - totalOffline) / totalDevices * 100).toFixed(1) : '100';

            const message = `
📊 *Ringkasan Status IPTV*

🎯 *Uptime Keseluruhan:* ${uptime}%
🔧 *Total Perangkat:* ${totalDevices}
❌ *Total Offline:* ${totalOffline}

📺 *Channel:* ${channels.length - channelOffline}/${channels.length} Online
📱 *Chromecast:* ${chromecasts.length - chromecastOffline}/${chromecasts.length} Online  
🏨 *TV Hospitality:* ${tvs.length - tvOffline}/${tvs.length} Online

⏰ *Update terakhir:* ${this.getIndonesianTime()}

${totalOffline > 0 ? '⚠️ *Perangkat yang perlu perhatian:* ' + totalOffline : '✅ Semua perangkat berjalan normal'}
        `;

            await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('Error generating summary for user:', error);
            await this.bot.sendMessage(chatId, '❌ Gagal mengambil ringkasan data. Silakan coba lagi.');
        }
    }

    // Setup callback query handlers
    setupErrorHandling() {
        this.bot.on('callback_query', async (callbackQuery) => {
            const chatId = callbackQuery.message.chat.id;
            const data = callbackQuery.data;

            try {
                switch (data) {
                    case 'pause_1h':
                        if (this.subscribers.has(chatId)) {
                            const pausedUntil = new Date(Date.now() + 60 * 60 * 1000);
                            this.subscribers.get(chatId).pausedUntil = pausedUntil;

                            await this.bot.answerCallbackQuery(callbackQuery.id, {
                                text: '⏸️ Notifikasi dijeda selama 1 jam'
                            });

                            // Update message untuk konfirmasi
                            await this.bot.editMessageText(
                                `⏸️ *Notifikasi Dijeda*\n\nNotifikasi akan kembali aktif pada:\n${new Date(Date.now() + 60 * 60 * 1000).toLocaleString('id-ID', { timeZone: 'Asia/Makassar', hour12: false })}`,
                                {
                                    chat_id: chatId,
                                    message_id: callbackQuery.message.message_id,
                                    parse_mode: 'Markdown',
                                    reply_markup: {
                                        inline_keyboard: [
                                            [{ text: '✅ Aktifkan Kembali', callback_data: 'resume_notifications' }]
                                        ]
                                    }
                                }
                            );

                            console.log(`⏸️ User ${chatId} paused notifications until ${pausedUntil}`);
                        }
                        break;

                    case 'resume_notifications':
                        if (this.subscribers.has(chatId)) {
                            this.subscribers.get(chatId).pausedUntil = null;

                            await this.bot.answerCallbackQuery(callbackQuery.id, {
                                text: '✅ Notifikasi diaktifkan kembali'
                            });

                            await this.bot.editMessageText(
                                '✅ *Notifikasi Aktif*\n\nAnda akan menerima notifikasi perangkat offline.',
                                {
                                    chat_id: chatId,
                                    message_id: callbackQuery.message.message_id,
                                    parse_mode: 'Markdown'
                                }
                            );

                            console.log(`✅ User ${chatId} resumed notifications`);
                        }
                        break;

                    case 'stop_notifications':
                        if (this.subscribers.has(chatId)) {
                            this.subscribers.get(chatId).active = false;

                            await this.bot.answerCallbackQuery(callbackQuery.id, {
                                text: '🔕 Notifikasi dihentikan'
                            });

                            await this.bot.editMessageText(
                                '🔕 *Notifikasi Dihentikan*\n\nAnda tidak akan menerima notifikasi lagi.\nKetik /start untuk mengaktifkan kembali.',
                                {
                                    chat_id: chatId,
                                    message_id: callbackQuery.message.message_id,
                                    parse_mode: 'Markdown',
                                    reply_markup: { remove_keyboard: true }
                                }
                            );

                            console.log(`🔕 User ${chatId} stopped notifications`);
                        }
                        break;

                    case 'show_summary':
                        await this.bot.answerCallbackQuery(callbackQuery.id);

                        // Panggil langsung method ringkasan
                        await this.sendSummaryToUser(chatId);
                        break;
                }
            } catch (error) {
                console.error('Error handling callback query:', error);
                await this.bot.answerCallbackQuery(callbackQuery.id, {
                    text: '❌ Terjadi kesalahan, silakan coba lagi'
                });
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