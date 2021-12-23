import fs      from "fs";
import util    from "util";
import * as cp from 'child_process';
const exec     = util.promisify(cp.exec);
import express from 'express';
const  app     = new express();

const header    = fs.readFileSync('config/config-hdr.txt',     'utf8');
const footer    = fs.readFileSync('config/config-footer.txt',  'utf8');
const seriesStr = fs.readFileSync('config/config-series.json', 'utf8');
const series    = JSON.parse(seriesStr);

const upload = async () => {
  const upLoadCmd = 'rsync -av config/config.yml xobtlu@oracle.usbx.me:' +
                    '/home/xobtlu/.config/flexget/config.yml';
  const {stdout} = await exec(
    'rsync -av config/config.yml xobtlu@oracle.usbx.me:' +
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
});

const saveSeries = async () => {
  console.log('saving series');
  fs.writeFileSync('series.json', JSON.stringify(series));
  let str = header;
  for(let name of series)
    str += '        - "' + name.replace('"', '') + '"\n';
  str += footer;
  fs.writeFileSync('config/config.yml', str);
  await upload();
  await reload();
};

app.get('/config-series.json', function (req, res) {
  res.send(fs.readFileSync('config/config-series.json', 'utf8'));
});
  
app.post('/pickup/:name', function (req, res) {
  const name = req.params.name;
  try{
    if(!series.includes(name))
      series.push(name);
    saveSeries();
    console.log('added series', name);
    res.send('ok')
  }
  catch (e) {
    console.log('ERROR: add series', name, e.message);
    res.send(e.message);
  }
})

app.delete('/pickup/:name', function (req, res) {
  const name = req.params.name;
  try{
    const idx = series.indexOf(name);
    if (idx !== -1) series.splice(idx, 1);
    saveSeries();
    console.log('removed series', name);
    res.send('ok')
  }
  catch (e) {
    console.log('ERROR: remove series', name, e.message);
    res.send(e.message);
  }
})

app.listen(8734, () => {
  console.log('server listening on port 8734');
})
