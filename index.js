import fs               from "fs";
import {readdir, stat}  from 'fs/promises';
import util             from "util";
import * as cp          from 'child_process';
import express          from 'express';
import {createCipheriv} from "crypto";

const debug = false;

const exec = util.promisify(cp.exec);
const app  = new express();

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
      const date     = (await stat(showPath)).birthtime;
      const year     = date.getFullYear().toString().substring(2);
      const month    = (date.getMonth()+1).toString().padStart(2, '0');
      const day      = date.getDate().toString().padStart(2, '0');
      const hash     = nameHash(dirent);
      const dateStr  = year + '/' + month + '/' + day;
      if(hash.length > 7) {
        dateList[nameHash(dirent)] = dateStr;
      }
    }
  }
  catch (err) {
    console.error(err);
  }
  // console.log({dateList});
  return dateList;
}

const recentDates =  async () => {
  let mostRecentDate;
  let errFlg = false;
  const recentDates = {};
  const recurs = async (path) => {
    // console.log({path, mostRecentDate});
    if(errFlg || path == '/mnt/media/tv/.stfolder') return;
    try {
      const fstat  = await stat(path);
      const date   = fstat.birthtime;
      const year   = date.getFullYear().toString().substring(2);
      const month  = (date.getMonth()+1).toString().padStart(2, '0');
      const day    = date.getDate().toString().padStart(2, '0');
      const dateStr = year + '/' + month + '/' + day;
      if(dateStr > mostRecentDate) mostRecentDate = dateStr;
      // console.log({path, fstat, dateStr, mostRecentDate});
      if(fstat.isDirectory()) {
        // console.log('dir ----- ',{path, mostRecentDate});
        // path = path.replace(/\/$/, '');
        const dir = await readdir(path);
        for await (const dirent of dir) {
          recurs(path + '/' + dirent);
        }
      }
    }
    catch (err) {
      console.error(err);
      errFlg = true;
    }
  }
  const dir = await readdir('/mnt/media/tv');
  for await (const dirent of dir) {
    const topLevelPath = '/mnt/media/tv/' + dirent;
    mostRecentDate = '00/00/00';
    await recurs(topLevelPath);
    recentDates[nameHash(dirent)] = mostRecentDate;
  }
  // console.log({recentDates});
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
  console.log('writing config.yml');
  fs.writeFileSync('config/config.yml', str);
  if(debug) {
    console.log("---- debugging: didn't uploaded & exiting ----");
    process.exit();
  }
  const {stdout} = await exec(
          'rsync -av config/config.yml xobtlu@oracle.usbx.me:' +
          '/home/xobtlu/.config/flexget/config.yml');
  const rx = new RegExp('total size is ([0-9,]*)');
  const matches = rx.exec(stdout);
  if(!matches || parseInt(matches[1].replace(',', '')) < 1000) {
    console.log('\nERROR: config.yml upload failed\n', stdout, '\n');
    return `config.yml upload failed: ${stdout}`;
  }
  console.log('uploaded config.yml, size:', matches[1]);
  return 'ok';
}

const reload = async () => {
  if(debug) {
    console.log("---- debugging: didn't reload ----");
    return 'ok';
  }
  const {stdout} = await exec(
    'ssh xobtlu@oracle.usbx.me /home/xobtlu/reload.sh');
  if(!stdout.includes('Config successfully reloaded'))  {
    console.log('\nERROR: config.yml reload failed\n', stdout, '\n');
    return `config.yml reload failed: ${stdout}`;
  }
  console.log('reloaded config.yml');
  return 'ok';
}

let saveTimeout = null;
let saveResult  = 'ok';
let saving      = false;

const saveConfigYml = () => {
  console.log('saving config.yml');
  rejects.sort((a,b) => { 
    return (a.toLowerCase() > b.toLowerCase() ? +1 : -1);
  });
  pickups.sort((a,b) => { 
    const aname = a.replace(/The\s/i, '');
    const bname = b.replace(/The\s/i, '');
    return (aname.toLowerCase() > bname.toLowerCase() ? +1 : -1);
  });
  fs.writeFileSync('config/rejects.json', JSON.stringify(rejects)); 
  fs.writeFileSync('config/pickups.json', JSON.stringify(pickups)); 
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

if(debug) upload(); // doesn't return

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
  // console.log('get',{gapChkStarts:JSON.stringify(gapChkStarts)});
  res.send(JSON.stringify(gapChkStarts));
});

app.get('/folderDates', async function (req, res) {
  const str = JSON.stringify(await folderDates());
  // console.log(str);
  res.send(str);
});

app.get('/recentDates', async function (req, res) {
  const str = JSON.stringify(await recentDates());
  // console.log(str);
  res.send(str);
});

app.post('/gapChkStart/:pickups/:season/:episode', function (req, res) {
  const {pickups, season, episode} = req.params;
  console.log('-- adding gapChkStart', {pickups, season, episode});
  gapChkStarts[pickups] = [season, episode];
  fs.writeFileSync('config/gapChkStarts.json', JSON.stringify(gapChkStarts));
  res.send('OK');
})

app.post('/rejects/:name', function (req, res) {
  const name = req.params.name;
  console.log('-- adding rejects', name);
  if(!rejects.includes(name)) rejects.push(name);
  res.send(saveConfigYml());
})

app.delete('/rejects/:name', function (req, res) {
  const name = req.params.name;
  console.log('-- deleting rejects', name);
  const idx = rejects.indexOf(name);
  if (idx !== -1) rejects.splice(idx, 1);
  res.send(saveConfigYml());
})

app.post('/pickups/:name', function (req, res) {
  const name = req.params.name;
  console.log('-- adding pickups', name);
  if(!pickups.includes(name)) pickups.push(name);
  res.send(saveConfigYml());
})

app.delete('/pickups/:name', function (req, res) {
  const name = req.params.name;
  console.log('-- deleting pickups', name);
  const idx = pickups.indexOf(name);
  if (idx !== -1) pickups.splice(idx, 1);
  res.send(saveConfigYml());
})

app.listen(8734, () => {
  console.log('server listening on port 8734');
})
