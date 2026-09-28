import sharp from 'sharp';import fs from 'node:fs/promises';
const master='docs/icons/craftly-icon-master.png';
await sharp(master).resize(256,256).webp({quality:90}).toFile('public/images/craftly-icon.webp');
await sharp(master).resize(64,64).png().toFile('public/favicon.png');
for(const [density,size,adaptive] of [['mdpi',48,108],['hdpi',72,162],['xhdpi',96,216],['xxhdpi',144,324],['xxxhdpi',192,432]]){const path='android/app/src/main/res/mipmap-'+density;await fs.mkdir(path,{recursive:true});await sharp(master).resize(size,size).png().toFile(path+'/ic_launcher.png');await sharp(master).resize(adaptive,adaptive).png().toFile(path+'/ic_launcher_foreground.png');}
await fs.mkdir('android/app/src/main/res/mipmap-anydpi-v26',{recursive:true});await fs.writeFile('android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml','<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@color/craftly_icon_bg"/><foreground android:drawable="@mipmap/ic_launcher_foreground"/></adaptive-icon>');
await fs.writeFile('android/app/src/main/res/values/icon-colors.xml','<resources><color name="craftly_icon_bg">#1B102D</color></resources>');
const folder='docs/icons/ios/AppIcon.appiconset';await fs.mkdir(folder,{recursive:true});let images=[];
for(const [idiom,sizes,scales] of [['iphone',[20,29,40,60],[2,3]],['ipad',[20,29,40,76],[1,2]]])for(const size of sizes)for(const scale of scales){const filename=`${idiom}-${size}@${scale}x.png`;await sharp(master).resize(size*scale,size*scale).flatten({background:'#1b102d'}).png().toFile(folder+'/'+filename);images.push({idiom,size:`${size}x${size}`,scale:scale+'x',filename});}
for(const [idiom,size,scale] of [['ipad',83.5,2],['ios-marketing',1024,1]]){const filename=`${idiom}-${size}.png`;await sharp(master).resize(size*scale,size*scale).flatten({background:'#1b102d'}).png().toFile(folder+'/'+filename);images.push({idiom,size:`${size}x${size}`,scale:scale+'x',filename});}
await fs.writeFile(folder+'/Contents.json',JSON.stringify({images,info:{author:'Craftly',version:1}},null,2));
