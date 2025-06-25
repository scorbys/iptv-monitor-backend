const { connectDB } = require('./db');

const channels = {
  international: [
    {
      id: 1, 
      channelNumber: 1,
      channelName: 'ABC Australia',
      category: 'ETC',
      ipMulticast: '238.5.2.224',
      logo: 'https://logotyp.us/file/abc.svg'
    },
    {
      id: 2, 
      channelNumber: 2,
      channelName: 'Bloomberg',
      category: 'ETC',
      ipMulticast: '238.5.2.124',
      logo: 'https://logotyp.us/file/bloomberg.svg'
    },
    { 
      id: 3,
      channelNumber: 3,
      channelName: 'BBC World',
      category: 'ETC',
      ipMulticast: '238.5.2.121',
      logo: 'https://worldvectorlogo.com/logos/bloomberg-television.svg'
    },
    { 
      id: 4,
      channelNumber: 4,
      channelName: 'NHK World',
      category: 'ETC',
      ipMulticast: '238.5.2.125',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/NHK_World.svg/250px-NHK_World.svg.png'
    },
    { 
      id: 5,
      channelNumber: 5,
      channelName: 'CGTN News HD',
      category: 'ETC',
      ipMulticast: '238.5.2.129',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/81/CGTN.svg/200px-CGTN.svg.png'
    },
    { 
      id: 6,
      channelNumber: 6,
      channelName: 'CNN Asia',
      category: 'ETC',
      ipMulticast: '238.5.2.123',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/CNN.svg/200px-CNN.svg.png'
    },
    { 
      id: 7,
      channelNumber: 7,
      channelName: 'Al Jazeera',
      category: 'ETC',
      ipMulticast: '238.5.2.127',
      logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/f/f2/Aljazeera_eng.svg/200px-Aljazeera_eng.svg.png'
    },
    { 
      id: 8,
      channelNumber: 8,
      channelName: 'RT Rusia',
      category: 'News',
      ipMulticast: '238.5.2.128',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Russia-today-logo.svg/250px-Russia-today-logo.svg.png'
    },
    { 
      id: 9,
      channelNumber: 9,
      channelName: 'KBS Korea',
      category: 'News',
      ipMulticast: '238.5.2.220',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/KBS_1_logo.svg/200px-KBS_1_logo.svg.png'
    },
    { 
      id: 10,
      channelNumber: 10,
      channelName: 'KBS World 24',
      category: 'News',
      ipMulticast: '238.5.2.219',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/94/KBS_World_24_logo.svg/1280px-KBS_World_24_logo.svg.png'
    },
    { 
      id: 11,
      channelNumber: 11,
      channelName: 'NHK Premium',
      category: 'News',
      ipMulticast: '238.5.2.226',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/a/aa/NHK_WORLD_PREMIUM_logo.png'
    },
    { 
      id: 12,
      channelNumber: 12,
      channelName: 'Arirang 24',
      category: 'News',
      ipMulticast: '238.5.2.223',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/64/Arirang_logo.png/1200px-Arirang_logo.png'
    },
    { 
      id: 13,
      channelNumber: 13,
      channelName: 'Metro Globe',
      category: 'News',
      ipMulticast: '238.5.2.20',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/2/2d/Metro_Globe_Network.png'
    },
    { 
      id: 14,
      channelNumber: 14,
      channelName: 'Arirang',
      category: 'News',
      ipMulticast: '238.5.2.221',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/64/Arirang_logo.png/1200px-Arirang_logo.png'
    },
    { 
      id: 15,
      channelNumber: 15,
      channelName: 'RT Planeta',
      category: 'News',
      ipMulticast: '238.5.2.227',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Russia-today-logo.svg/200px-Russia-today-logo.svg.png'
    },
    { 
      id: 16,
      channelNumber: 16,
      channelName: 'Al Jazeera Arab',
      category: 'News',
      ipMulticast: '238.5.2.228',
      logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/f/f2/Aljazeera_eng.svg/200px-Aljazeera_eng.svg.png'
    },
    { 
      id: 17,
      channelNumber: 17,
      channelName: 'History HD',
      category: 'ETC',
      ipMulticast: '238.5.2.80',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/History_Logo.svg/200px-History_Logo.svg.png'
    },
    { 
      id: 18,
      channelNumber: 18,
      channelName: 'CGTN Documentary',
      category: 'ETC',
      ipMulticast: '238.5.2.81',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/81/CGTN.svg/200px-CGTN.svg.png'
    },
    { 
      id: 19,
      channelNumber: 19,
      channelName: 'Asian Food Ch',
      category: 'ETC',
      ipMulticast: '238.5.2.205',
      logo: 'https://worldvectorlogo.com/logos/asian-food-channel.svg'
    },
    { 
      id: 20,
      channelNumber: 20,
      channelName: 'Channel News Asia',
      category: 'News',
      ipMulticast: '238.5.2.122',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/CNA_new_logo.svg/200px-CNA_new_logo.svg.png'
    },
    { 
      id: 21,
      channelNumber: 21,
      channelName: 'Travel Channel',
      category: 'ETC',
      ipMulticast: '238.5.2.206',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/2018_Travel_Channel_logo.svg/1280px-2018_Travel_Channel_logo.svg.png'
    },
    { 
      id: 22,
      channelNumber: 22,
      channelName: 'TV5 Monde',
      category: 'ETC',
      ipMulticast: '238.5.2.230',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/TV5Monde_Logo.svg/2560px-TV5Monde_Logo.svg.png'
    },
    { 
      id: 23,
      channelNumber: 23,
      channelName: 'btv',
      category: 'ETC',
      ipMulticast: '238.5.2.22',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/2/22/BTV_%28Indonesia%29_logo_%282025%29.svg'
    },
    { 
      id: 24,
      channelNumber: 24,
      channelName: 'seaToday',
      category: 'ETC',
      ipMulticast: '238.5.2.20',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/c/c5/SEA_Today_Indonesia_Logo.png'
    },
    { 
      id: 25,
      channelNumber: 25,
      channelName: 'idtv',
      category: 'ETC',
      ipMulticast: '238.5.2.12',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/46/IDTV.svg/1280px-IDTV.svg.png'
    },
    { 
      id: 26,
      channelNumber: 26,
      channelName: 'Cartoon Network',
      category: 'ETC',
      ipMulticast: '238.5.2.52',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/Cartoon_Network_2010_logo.svg/200px-Cartoon_Network_2010_logo.svg.png'
    }
  ],
  local: [
    {
      id: 27,
      channelNumber: 27,
      channelName: 'DW TV',
      category: 'News',
      ipMulticast: '238.5.2.222',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Deutsche_Welle_symbol_2012.svg/200px-Deutsche_Welle_symbol_2012.svg.png'
    },
    {
      id: 28,
      channelNumber: 28,
      channelName: 'Biznet Lifestyle',
      category: 'ETC',
      ipMulticast: '238.5.2.200',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/4/46/Biznet_Home_Logo.svg'
    },
    {
      id: 29,
      channelNumber: 29,
      channelName: 'Biznet Kids',
      category: 'ETC',
      ipMulticast: '238.5.2.50',
      logo: 'https://biznethome.net/wp-content/uploads/2024/09/Kids-Biznet-Home-Kids.jpg'
    },
    {
      id: 30,
      channelNumber: 30,
      channelName: 'DAAI TV',
      category: 'ETC',
      ipMulticast: '238.5.2.33',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fc/DAAI_TV.svg/640px-DAAI_TV.svg.png'
    },
    {
      id: 31,
      channelNumber: 31,
      channelName: 'Magna TV',
      category: 'ETC',
      ipMulticast: '238.5.2.21',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/8/83/MagnaChannel.png'
    },
    {
      id: 32,
      channelNumber: 32,
      channelName: 'Sony',
      category: 'ETC',
      ipMulticast: '238.5.2.17',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/Sony_Channel_Logo_2019.svg/640px-Sony_Channel_Logo_2019.svg.png'
    },
    {
      id: 33,
      channelNumber: 33,
      channelName: 'Trans TV',
      category: 'ETC',
      ipMulticast: '238.5.2.100',
      logo: 'https://logotyp.us/file/trans-tv.svg'
    },
    {
      id: 34,
      channelNumber: 34,
      channelName: 'Jak TV',
      category: 'ETC',
      ipMulticast: '238.5.2.101',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/Jak_tv_%282010%29.png/640px-Jak_tv_%282010%29.png'
    },
    {
      id: 35,
      channelNumber: 35,
      channelName: 'GTV 4',
      category: 'News',
      ipMulticast: '238.5.2.102',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/GTV_%282017%29.svg/200px-GTV_%282017%29.svg.png'
    },
    {
      id: 36,
      channelNumber: 36,
      channelName: 'O Channel',
      category: 'News',
      ipMulticast: '238.5.2.103',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Ochannel.svg/640px-Ochannel.svg.png'
    },
    {
      id: 37,
      channelNumber: 37,
      channelName: 'Bali TV',
      category: 'ETC',
      ipMulticast: '238.5.2.104',
      logo: 'https://upload.wikimedia.org/wikipedia/en/0/04/Bali_TV_%282014%29.png'
    },
    {
      id: 38,
      channelNumber: 38,
      channelName: 'JTV',
      category: 'ETC',
      ipMulticast: '238.5.2.105',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/ca/JTV_%28Indonesian_TV_channel%29_2022.svg/640px-JTV_%28Indonesian_TV_channel%29_2022.svg.png'
    },
    {
      id: 39,
      channelNumber: 39,
      channelName: 'Indosiar',
      category: 'ETC',
      ipMulticast: '238.5.2.106',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Indosiar_2015.svg/200px-Indosiar_2015.svg.png'
    },
    {
      id: 40,
      channelNumber: 40,
      channelName: 'TVRI',
      category: 'ETC',
      ipMulticast: '238.5.2.107',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/TVRILogo2019.svg/200px-TVRILogo2019.svg.png'
    },
    {
      id: 41,
      channelNumber: 41,
      channelName: 'Kompas TV',
      category: 'ETC',
      ipMulticast: '238.5.2.108',
      logo: 'https://logotyp.us/file/kompas-tv.svg'
    },
    {
      id: 42,
      channelNumber: 42,
      channelName: 'Trans 7',
      category: 'ETC',
      ipMulticast: '238.5.2.109',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/9/96/Logo_Trans7.png'
    },
    {
      id: 43,
      channelNumber: 43,
      channelName: 'Metro TV',
      category: 'ETC',
      ipMulticast: '238.5.2.110',
      logo: 'https://logotyp.us/file/metro-tv.svg'
    },
    {
      id: 44,
      channelNumber: 44,
      channelName: 'JTV',
      category: 'ETC',
      ipMulticast: '238.5.2.21',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/ca/JTV_%28Indonesian_TV_channel%29_2022.svg/640px-JTV_%28Indonesian_TV_channel%29_2022.svg.png'
    },
    {
      id: 45,
      channelNumber: 45,
      channelName: 'Rajawali TV',
      category: 'ETC',
      ipMulticast: '238.5.2.111',
      logo: 'https://upload.wikimedia.org/wikipedia/id/5/5a/Rajawali_Televisi.svg'
    },
    {
      id: 46,
      channelNumber: 46,
      channelName: 'NET HD',
      category: 'ETC',
      ipMulticast: '238.5.2.112',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/8/89/MDTV_logo.svg'
    },
    {
      id: 47,
      channelNumber: 47,
      channelName: 'Moji',
      category: 'ETC',
      ipMulticast: '238.5.2.113',
      logo: 'https://upload.wikimedia.org/wikipedia/commons/c/c9/Moji_blue.svg'
    }
  ]
};

async function seed() {
  try {
    const { international, local } = await connectDB();
    
    // Clear existing data
    await international.deleteMany({});
    await local.deleteMany({});
    
    // Insert new data
    if (channels.international.length > 0) {
      await international.insertMany(channels.international);
    }
    if (channels.local.length > 0) {
      await local.insertMany(channels.local);
    }
    
    console.log('Data berhasil di-seed ke MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding data:', error);
    process.exit(1);
  }
}

seed();