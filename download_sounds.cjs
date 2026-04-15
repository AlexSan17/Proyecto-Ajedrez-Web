const fs = require('fs');
const https = require('https');

const sounds = ['Move', 'Capture'];
const baseURL = 'https://raw.githubusercontent.com/lichess-org/lila/master/public/sound/standard/';
const dir = './public/assets/';

if (!fs.existsSync(dir)){
    fs.mkdirSync(dir, { recursive: true });
}

sounds.forEach(s => {
    https.get(`${baseURL}${s}.ogg`, (res) => {
        const path = `${dir}${s.toLowerCase()}.ogg`;
        const writeStream = fs.createWriteStream(path);
        res.pipe(writeStream);
    });
});
console.log('Downloading sounds...');
