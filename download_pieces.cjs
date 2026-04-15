const fs = require('fs');
const https = require('https');

const pieces = ['wP', 'bP', 'wN', 'bN', 'wB', 'bB', 'wR', 'bR', 'wQ', 'bQ', 'wK', 'bK'];
const baseURL = 'https://raw.githubusercontent.com/lichess-org/lila/master/public/piece/pixel/';
const dir = './public/assets/';

if (!fs.existsSync(dir)){
    fs.mkdirSync(dir, { recursive: true });
}

pieces.forEach(p => {
    https.get(`${baseURL}${p}.svg`, (res) => {
        const path = `${dir}pixel_${p}.svg`;
        const writeStream = fs.createWriteStream(path);
        res.pipe(writeStream);
        writeStream.on('finish', () => writeStream.close());
    });
});
console.log('Downloading 12 pixel pieces...');
