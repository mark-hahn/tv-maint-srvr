import fs      from "fs";
import util    from "util";
import * as cp from 'child_process';
const exec     = util.promisify(cp.exec);
import express from 'express';
const  app     = new express();

const header    = fs.readFileSync('config-hdr.txt',     'utf8');
const footer    = fs.readFileSync('config-footer.txt',  'utf8');
const seriesStr = fs.readFileSync('config-series.json', 'utf8');
const series    = JSON.parse(seriesStr);

const dwnLoadCmd = 'rsync -av xobtlu@oracle.usbx.me:' +
                   '/home/xobtlu/.config/flexget/config.yml config.bkup';

const upLoadCmd = 'rsync -av config.yml xobtlu@oracle.usbx.me:' +
                   '/home/xobtlu/.config/flexget/config.yml';

const upload = async () => {
  const {stdout} = await exec(
    'rsync -av config.yml xobtlu@oracle.usbx.me:' +
    '/home/xobtlu/.config/flexget/config.yml');
  const rx = new RegExp('total size is ([0-9,]*)');
  const matches = rx.exec(stdout);
  if(!matches[1] || parseInt(matches[1].replace(',', '')) < 1000) {
    console.log('\nERROR: config.yml upload failed\n', stdout, '\n');
    return false;
  }
  console.log('uploaded config.yml, size:', matches[1]);
  return true;
}

const reload = async () => {
  const {stdout} = await exec(
    'ssh xobtlu@oracle.usbx.me /home/xobtlu/reload.sh');
  if(!stdout.includes('Config successfully reloaded'))  {
    console.log('\nERROR: config.yml reload failed\n', stdout, '\n');
    return false;
  }
  console.log('reloaded config.yml');
  return true;
}

app.get('/', function (req, res) {
  res.send('invalid url')
})

app.get('/config-series.json', function (req, res) {
  res.send(fs.readFileSync('config-series.json', 'utf8'));
})

app.post('/pickup/:name', function (req, res) {
  const name = req.params.name;
  console.log('add series', name);
  res.send('ok')
})

app.delete('/pickup/:name', function (req, res) {
  const name = req.params.name;
  console.log('delete series', name);
  res.send('ok')
})

app.listen(8734, () => {
  console.log('server listening on port 8734');
})
