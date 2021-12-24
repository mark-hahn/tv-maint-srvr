import fs      from "fs";
import util    from "util";
import * as cp from 'child_process';
const exec     = util.promisify(cp.exec);
import express from 'express';
const  app     = new express();

const header    = fs.readFileSync('config/config-hdr.txt',     'utf8');
const footer    = fs.readFileSync('config/config-footer.txt',  'utf8');
const seriesStr = fs.readFileSync('config/series.json', 'utf8');
const series    = JSON.parse(seriesStr);

const upload = async () => {
  let str = header;
  for(let name of series)
    str += '        - "' + name.replace('"', '') + '"\n';
  str += footer;
  console.log('writing config.yml');
  fs.writeFileSync('config/config.yml', str);
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
  const {stdout} = await exec(
    'ssh xobtlu@oracle.usbx.me /home/xobtlu/reload.sh');
  if(!stdout.includes('Config successfully reloaded'))  {
    console.log('\nERROR: config.yml reload failed\n', stdout, '\n');
    return `config.yml reload failed: ${stdout}`;
  }
  console.log('reloaded config.yml');
  return 'ok';
}

app.get('/', function (req, res) {
  res.send('invalid url')
});

let saveTimeout = null;
let saveResult  = 'ok';
let saving      = false;

const saveSeries = () => {
  console.log('saving series.json');
  series.sort((a,b) => {
    const aname = a.replace(/The\s/i, '');
    const bname = b.replace(/The\s/i, '');
    return (aname.toLowerCase() > bname.toLowerCase() ? +1 : -1);
  });
  fs.writeFileSync('config/series.json', JSON.stringify(series)); 
  if(saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout( async () => {
    saveTimeout = null;
    if(saving) {
      setTimeout(saveSeries, 10000);
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

app.get('/series.json', function (req, res) {
  res.send(fs.readFileSync('config/series.json', 'utf8'));
});
   
app.post('/pickup/:name', function (req, res) {
  const name = req.params.name;
  console.log('-- adding series', name);
  if(!series.includes(name)) series.push(name);
  res.send(saveSeries());
})

app.delete('/pickup/:name', function (req, res) {
  const name = req.params.name;
  console.log('-- deleting series', name);
  const idx = series.indexOf(name);
  if (idx !== -1) series.splice(idx, 1);
  res.send(saveSeries());
})

app.listen(8734, () => {
  console.log('server listening on port 8734');
})
