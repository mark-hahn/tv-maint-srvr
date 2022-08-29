import fs               from "fs";
import {readdir, stat}  from 'fs/promises';
import util             from "util";
import * as cp          from 'child_process';
import moment           from 'moment';
import express          from 'express';

const debug = false;

const exec = util.promisify(cp.exec);
const app  = new express();

// const dat = () => typeof(new Date())//.replace(/T|\..*$/, ' ');
const dat = () => moment().format('MM/DD HH-mm-ss:');

const headerStr = fs.readFileSync('config/config1-header.txt',   'utf8');
const rejectStr = fs.readFileSync('config/config2-rejects.json', 'utf8');
const middleStr = fs.readFileSync('config/config3-middle.txt',   'utf8');
const pickupStr = fs.readFileSync('config/config4-pickups.json', 'utf8');
const footerStr = fs.readFileSync('config/config5-footer.txt',   'utf8');
const gapsStr   = fs.readFileSync('config/gapChkStarts.json',    'utf8');

const rejects      = JSON.parse(rejectStr);
const pickups      = JSON.parse(pickupStr);
const gapChkStarts = JSON.parse(gapsStr);

const nameHash = (name) =>
  ('name-' + name
    .toLowerCase()
    .replace(/^the\s/, '')
    .replace(/[^a-zA-Z0-9]*/g, ''))

const folderDates =  async () => {
  const dateList = {};
  try {
    const dir = await readdir('/mnt/media/tv');
    for await (const dirent of dir) {
      const showPath = '/mnt/media/tv/' + dirent;
      const date     = (await stat(showPath)).mtime;
      const dateStr  = date.toISOString()
                        .substring(0,10).replace(/-/g, '/');
      const hash     =  nameHash(dirent);
      if(hash.length > 7) dateList[hash] = dateStr;
    }
  }
  catch (err) {
    console.error(err);
  }
  // console.log(dat(), {dateList});
  return dateList;
}

const recentDates =  async () => {
  let mostRecentDate;
  let errFlg = false;
  const recentDates = {};
  const recurs = async (path) => {
    if(errFlg || path == '/mnt/media/tv/.stfolder') return;
    try {
      const fstat = await stat(path);
      const [sfx] = path.split('.').slice(-1);
      if(['mkv','flv','vob','avi','mov','wmv','mp4',
          'mpg','mpeg','m2v','mp2'].includes(sfx)) {
        // console.log(dat(), 'video file',{path, fstat});
        const dateStr = fstat.mtime.toISOString()
                        .substring(0,10).replace(/-/g, '/');
        if(dateStr > '2050') return;
        if(dateStr > mostRecentDate) mostRecentDate = dateStr;
      }
      if(fstat.isDirectory()) {
        const dir = await readdir(path);
        for (const dirent of dir) {
          await recurs(path + '/' + dirent);
        }
      }
    }
    catch (err) {
      console.error(err);
      errFlg = true;
    }
  }
  const dir = await readdir('/mnt/media/tv');
  for (const dirent of dir) {
    const topLevelPath = '/mnt/media/tv/' + dirent;
    mostRecentDate = '0000/00/00';
    await recurs(topLevelPath);
    recentDates[nameHash(dirent)] = mostRecentDate;
  }
  if(errFlg) return {};
  else       return recentDates;
}
 
const upload = async () => {
  let str = headerStr;
  for(let name of rejects)
    str += `        - ${name}\n`;
  str += middleStr;
  for(let name of pickups)
    str += '        - "' + name.replace(/"/g, '') + '"\n';
  str += footerStr;
  console.log(dat(), 'writing config.yml');
  fs.writeFileSync('config/config.yml', str);
  if(debug) {
    console.log(dat(), "---- debugging: didn't upload ----");
    return 'ok';
  }
  const {stdout} = await exec(
          'rsync -av config/config.yml xobtlu@oracle.usbx.me:' +
          '/home/xobtlu/.config/flexget/config.yml');
  const rx = new RegExp('total size is ([0-9,]*)');
  const matches = rx.exec(stdout);
  if(!matches || parseInt(matches[1].replace(',', '')) < 1000) {
    console.log(dat(), '\nERROR: config.yml upload failed\n', stdout, '\n');
    return `config.yml upload failed: ${stdout}`;
  }
  console.log(dat(), 'uploaded config.yml, size:', matches[1]);
  return 'ok';
}

const reload = async () => {
  if(debug) {
    console.log(dat(), "---- debugging: didn't reload ----");
    return 'ok';
  }
  const {stdout} = await exec(
    'ssh xobtlu@oracle.usbx.me /home/xobtlu/reload.sh');
  if(!stdout.includes('Config successfully reloaded'))  {
    console.log(dat(), '\nERROR: config.yml reload failed\n', stdout, '\n');
    return `config.yml reload failed: ${stdout}`;
  }
  console.log(dat(), 'reloaded config.yml');
  return 'ok';
}

let saveTimeout = null;
let saveResult  = 'ok';
let saving      = false;

const saveConfigYml = () => {
  console.log(dat(), 'saving config.yml');
  rejects.sort((a,b) => { 
    return (a.toLowerCase() > b.toLowerCase() ? +1 : -1);
  });
  pickups.sort((a,b) => { 
    const aname = a.replace(/The\s/i, '');
    const bname = b.replace(/The\s/i, '');
    return (aname.toLowerCase() > bname.toLowerCase() ? +1 : -1);
  });
  fs.writeFileSync('config/config2-rejects.json', JSON.stringify(rejects)); 
  fs.writeFileSync('config/config4-pickups.json', JSON.stringify(pickups)); 
  if(saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout( async () => {
    saveTimeout = null;
    if(saving) {
      setTimeout(saveConfigYml, 10000);
      return;
    }
    saving = true;
    const uploadRes = await upload();
    if(uploadRes != 'ok') saveResult = uploadRes;
    else {
      const reloadRes = await reload();
      if(reloadRes != 'ok') saveResult = reloadRes;
    }
    saving = false;
  }, 10000);  
  const result = saveResult;
  saveResult = 'ok';
  return result;
};

if(debug) upload();


//////////////////  EXPRESS SERVER  //////////////////

app.get('/', function (req, res) {
  res.send('invalid url')
});

app.get('/rejects.json', function (req, res) {
  res.send(fs.readFileSync('config/config2-rejects.json', 'utf8'));
});

app.get('/pickups.json', function (req, res) {
  res.send(fs.readFileSync('config/config4-pickups.json', 'utf8'));
});

app.get('/gapChkStarts.json', function (req, res) {
  // console.log(dat(), 'get',{gapChkStarts:JSON.stringify(gapChkStarts)});
  res.send(JSON.stringify(gapChkStarts));
});

app.get('/folderDates', async function (req, res) {
  const str = JSON.stringify(await folderDates());
  // console.log(dat(), str);
  res.send(str);
});

app.get('/recentDates', async function (req, res) {
  const str = JSON.stringify(await recentDates());
  // console.log(dat(), str);
  res.send(str);
});

app.post('/gapChkStart/:pickups/:season/:episode', function (req, res) {
  const {pickups, season, episode} = req.params;
  console.log(dat(), '-- adding gapChkStart', {pickups, season, episode});
  gapChkStarts[pickups] = [season, episode];
  fs.writeFileSync('config/gapChkStarts.json', JSON.stringify(gapChkStarts));
  res.send('OK');
})

app.post('/rejects/:name', function (req, res) {
  const name = req.params.name;
  console.log(dat(), '-- adding rejects', name);
  if(!rejects.includes(name)) rejects.push(name);
  res.send(saveConfigYml());
})

app.delete('/rejects/:name', function (req, res) {
  const name = req.params.name;
  console.log(dat(), '-- deleting rejects', name);
  const idx = rejects.indexOf(name);
  if (idx !== -1) rejects.splice(idx, 1);
  res.send(saveConfigYml());
})

app.post('/pickups/:name', function (req, res) {
  const name = req.params.name;
  for(const [idx, pickupNameStr] of pickups.entries()) {
    if(pickupNameStr.toLowerCase() === name.toLowerCase()) {
      console.log(dat(), '-- removing old matching pickup:', pickupNameStr);
      pickups.splice(idx, 1);
    }
  }
  console.log(dat(), '-- adding pickup:', name);
  pickups.push(name);
  res.send(saveConfigYml());
})

app.delete('/pickups/:name', function (req, res) {
  const name = req.params.name;
  let deletedOne = false;
  for(const [idx, pickupNameStr] of pickups.entries()) {
    if(pickupNameStr.toLowerCase() === name.toLowerCase()) {
      console.log(dat(), '-- deleting pickup:', pickupNameStr);
      pickups.splice(idx, 1);
      deletedOne = true;
    }
  }
  if(!deletedOne) {
    console.log(dat(), '-- pickup not deleted -- no match:', name);
    res.send('ok');
  }
  else res.send(saveConfigYml());
})

app.listen(8734, () => {
  console.log(dat(), 'server listening on port 8734');
})
